import { db } from '../../db';
import type { Attachment } from '../../types';
import {
  decodeAttachmentText,
  isTextLikeAttachment,
} from '../attachments';
import { collectFileAttachments, sliceText } from '../document-text';
import type { Tool, ToolContext } from './index';

export { sliceText, collectFileAttachments } from '../document-text';

/**
 * Document tools — let the model extract readable text from chat
 * attachments (PDF / EPUB / DOCX / plain text) on demand.
 *
 * Why a tool (not always injecting full file text into the prompt):
 *  - OpenAI-compatible endpoints don't get native PDF document blocks
 *  - Large PDFs would bloat every turn if always injected
 *  - DOCX/EPUB are accepted by the composer but not auto-decoded today
 *
 * Text-like attachments are usually already in the prompt; the model
 * can still call this for paging (`start_char`) or when the inject was
 * truncated / missing.
 */

const DEFAULT_MAX_CHARS = 40_000;
const HARD_MAX_CHARS = 80_000;

export async function documentTools(_ctx: ToolContext): Promise<Tool[]> {
  void _ctx;
  return [parseDocumentTool()];
}

function parseDocumentTool(): Tool {
  return {
    def: {
      name: 'parse_document',
      description:
        '从本对话最近用户消息的附件中提取可读正文（PDF / EPUB / DOCX / 文本）。' +
        '文本附件通常已直接出现在对话里；对 PDF（尤其非 Anthropic 接口）、Word、EPUB，' +
        '或需要按偏移翻页阅读长文时调用。可传 attachment_id 或 filename；都省略则取最近一条带附件的用户消息里第一个非图片文件。' +
        '返回 text 可能被截断——看 truncated / next_start_char，再调一次继续读。',
      parameters: {
        type: 'object',
        properties: {
          attachment_id: {
            type: 'string',
            description: 'Attachment.id。与 filename 二选一；都省略则自动选最近附件。',
          },
          filename: {
            type: 'string',
            description: '按文件名（子串，不区分大小写）匹配附件。',
          },
          max_chars: {
            type: 'integer',
            description: `本次返回最多多少字，默认 ${DEFAULT_MAX_CHARS}，上限 ${HARD_MAX_CHARS}。`,
          },
          start_char: {
            type: 'integer',
            description: '从正文第几个字符开始截取（0-based），用于翻页读长文。默认 0。',
          },
        },
      },
    },
    handler: async (input: unknown, ctx: ToolContext) => {
      const args = (input ?? {}) as {
        attachment_id?: string;
        filename?: string;
        max_chars?: number;
        start_char?: number;
      };

      const maxChars = clampInt(
        args.max_chars ?? DEFAULT_MAX_CHARS,
        1_000,
        HARD_MAX_CHARS,
      );
      const startChar = Math.max(0, Math.floor(args.start_char ?? 0));

      try {
        const found = await resolveAttachment(ctx.conversationId, {
          attachmentId: args.attachment_id?.trim() || undefined,
          filename: args.filename?.trim() || undefined,
        });
        if ('error' in found) return found;

        const parsed = await extractAttachmentText(found.attachment);
        if ('error' in parsed) {
          return {
            ...parsed,
            attachment_id: found.attachment.id,
            filename: found.attachment.filename ?? null,
          };
        }

        const slice = sliceText(parsed.text, startChar, maxChars);
        return {
          attachment_id: found.attachment.id,
          filename: found.attachment.filename ?? null,
          mimeType: found.attachment.mimeType,
          format: parsed.format,
          title: parsed.title ?? null,
          author: parsed.author ?? null,
          char_count: parsed.text.length,
          start_char: startChar,
          max_chars: maxChars,
          text: slice.text,
          truncated: slice.truncated,
          next_start_char: slice.nextStart,
          hint: slice.truncated
            ? '正文未读完。用同一个 attachment_id，把 start_char 设为 next_start_char 再调一次。'
            : undefined,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function resolveAttachment(
  conversationId: string,
  opts: { attachmentId?: string; filename?: string },
): Promise<
  | { attachment: Attachment; messageId: string }
  | { error: string; available?: Array<{ id: string; filename: string | null; mimeType: string }> }
> {
  const messages = await db.messages.where({ conversationId }).toArray();
  const files = collectFileAttachments(messages);

  if (files.length === 0) {
    return {
      error:
        '这个对话里还没有可解析的文件附件。请让用户用回形针上传 PDF / EPUB / DOCX / 文本后再试。',
    };
  }

  const available = files.slice(0, 12).map((a) => ({
    id: a.id,
    filename: a.filename ?? null,
    mimeType: a.mimeType,
  }));

  // Rebuild messageId map for the chosen attachment.
  const messageIdByAttachment = new Map<string, string>();
  for (const m of messages) {
    if (m.role !== 'user' || !m.attachments?.length) continue;
    for (const a of m.attachments) {
      if (a.kind !== 'image') messageIdByAttachment.set(a.id, m.id);
    }
  }

  let chosen: Attachment | undefined;
  if (opts.attachmentId) {
    chosen = files.find((a) => a.id === opts.attachmentId);
    if (!chosen) {
      return {
        error: `找不到 attachment_id=${opts.attachmentId}`,
        available,
      };
    }
  } else if (opts.filename) {
    const needle = opts.filename.toLowerCase();
    chosen = files.find((a) =>
      (a.filename ?? '').toLowerCase().includes(needle),
    );
    if (!chosen) {
      return {
        error: `找不到文件名包含「${opts.filename}」的附件`,
        available,
      };
    }
  } else {
    chosen = files[0];
  }

  return {
    attachment: chosen,
    messageId: messageIdByAttachment.get(chosen.id) ?? '',
  };
}

async function extractAttachmentText(
  a: Attachment,
): Promise<
  | { text: string; format: string; title?: string; author?: string }
  | { error: string }
> {
  const name = (a.filename ?? '').toLowerCase();
  const mime = (a.mimeType ?? '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      const { parsePdf } = await import('../pdf');
      const parsed = await parsePdf(attachmentToFile(a));
      return {
        text: parsed.content,
        format: 'pdf',
        title: parsed.title,
        author: parsed.author,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (
    mime === 'application/epub+zip' ||
    name.endsWith('.epub')
  ) {
    try {
      const { parseEpub } = await import('../epub');
      const parsed = await parseEpub(attachmentToFile(a));
      return {
        text: parsed.content,
        format: 'epub',
        title: parsed.title,
        author: parsed.author,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    try {
      const { parseDocx } = await import('../docx');
      const parsed = await parseDocx(attachmentToFile(a));
      return {
        text: parsed.content,
        format: 'docx',
        title: parsed.title,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (isTextLikeAttachment(a)) {
    const text = decodeAttachmentText(a);
    if (text === null) {
      return { error: '文本附件解码失败（可能不是 UTF-8）。' };
    }
    return {
      text,
      format: 'text',
      title: a.filename,
    };
  }

  return {
    error: `暂不支持解析此类型（${a.mimeType || 'unknown'} / ${a.filename || '无文件名'}）。支持 PDF、EPUB、DOCX 与常见文本。`,
  };
}

function attachmentToFile(a: Attachment): File {
  const binary = atob(a.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], a.filename || 'file', {
    type: a.mimeType || 'application/octet-stream',
  });
}
