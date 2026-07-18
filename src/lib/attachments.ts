import type { Attachment } from '../types';
import { newId } from './id';

/** Read a File as base64 (no data URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unexpected reader result'));
        return;
      }
      // result is "data:<mime>;base64,<data>" — strip the prefix.
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Resize an image File client-side to keep base64 payload manageable.
 *  Returns the resized JPEG/PNG as base64 (no prefix). */
export async function resizeImageToBase64(
  file: File,
  maxDim: number = 2048,
  quality: number = 0.86,
): Promise<{ data: string; mimeType: string }> {
  // Bypass resize for SVG (vector) and small files.
  if (file.type === 'image/svg+xml' || file.size < 200 * 1024) {
    return { data: await fileToBase64(file), mimeType: file.type };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (img.width <= maxDim && img.height <= maxDim) {
      return { data: await fileToBase64(file), mimeType: file.type };
    }
    const scale = maxDim / Math.max(img.width, img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { data: await fileToBase64(file), mimeType: file.type };
    }
    ctx.drawImage(img, 0, 0, w, h);
    // Prefer JPEG for photos to shrink, PNG only if input was PNG with transparency potential.
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, outType, quality),
    );
    if (!blob) {
      return { data: await fileToBase64(file), mimeType: file.type };
    }
    return {
      data: await blobToBase64(blob),
      mimeType: outType,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return fileToBase64(new File([blob], 'x', { type: blob.type }));
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/')) {
    const { data, mimeType } = await resizeImageToBase64(file);
    return {
      id: newId(),
      kind: 'image',
      mimeType,
      data,
      filename: file.name,
      size: file.size,
    };
  }
  return {
    id: newId(),
    kind: 'file',
    mimeType: file.type || 'application/octet-stream',
    data: await fileToBase64(file),
    filename: file.name,
    size: file.size,
  };
}

export function attachmentDataUrl(a: Attachment): string {
  return `data:${a.mimeType};base64,${a.data}`;
}

export function formatBytes(n: number | undefined): string {
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|javascript|x-javascript|typescript|x-yaml|yaml|toml|sql|rtf|x-sh|x-httpd-php))/i;

const TEXT_EXT_RE =
  /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|c|cc|cpp|h|hpp|rb|php|swift|kt|kts|sql|ya?ml|toml|ini|log|rtf|sh|bash|zsh|env|conf|cfg|gitignore|dockerignore|editorconfig)$/i;

/** Whether a non-image attachment can be decoded and injected as UTF-8 text. */
export function isTextLikeAttachment(a: Attachment): boolean {
  if (a.kind === 'image') return false;
  if (a.mimeType === 'application/pdf') return false;
  if (TEXT_MIME_RE.test(a.mimeType)) return true;
  if (a.filename && TEXT_EXT_RE.test(a.filename)) return true;
  // Empty/generic MIME: allow if extension looks textual.
  if (
    (!a.mimeType || a.mimeType === 'application/octet-stream') &&
    a.filename &&
    TEXT_EXT_RE.test(a.filename)
  ) {
    return true;
  }
  return false;
}

/** Decode a base64 attachment payload as UTF-8 text, or null on failure. */
export function decodeAttachmentText(a: Attachment): string | null {
  if (!isTextLikeAttachment(a)) return null;
  try {
    const binary = atob(a.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Format a non-image attachment for inclusion in the model prompt.
 * Returns null for images (handled separately) and undecodable binaries.
 * PDFs are handled by Anthropic's document block; OpenAI gets a short note.
 */
export function formatAttachmentForModel(
  a: Attachment,
  opts: { pdfAsNote?: boolean } = {},
): string | null {
  if (a.kind === 'image') return null;
  const name = a.filename ?? 'file';
  if (a.mimeType === 'application/pdf') {
    if (!opts.pdfAsNote) return null;
    return `[附件: ${name} (${a.mimeType}, ${formatBytes(a.size)}) — PDF 内容需由支持文档的接口读取]`;
  }
  const text = decodeAttachmentText(a);
  if (text !== null) {
    return `[附件: ${name}]\n\`\`\`\n${text}\n\`\`\``;
  }
  return `[附件: ${name} (${a.mimeType || 'unknown'}, ${formatBytes(a.size)}) — 二进制文件，无法直接读取内容]`;
}
