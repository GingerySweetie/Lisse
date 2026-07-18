import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Send, Square, X } from 'lucide-react';
import type { Attachment } from '../types';
import {
  attachmentDataUrl,
  fileToAttachment,
  formatBytes,
} from '../lib/attachments';
import { recordTyping } from '../lib/behavior';
import {
  MAX_CHAT_MESSAGE_CHARS,
  assertChatMessageSize,
  formatChars,
  formatStorageError,
} from '../lib/storage-guards';

/** Soft cap for non-image uploads (base64 lives in IndexedDB). */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Common document / text types for the file picker (images use the other path). */
const FILE_ACCEPT =
  '.txt,.md,.markdown,.pdf,.epub,.csv,.tsv,.json,.xml,.html,.htm,.css,.js,.ts,.tsx,.jsx,.mjs,.cjs,.py,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.sql,.yml,.yaml,.toml,.ini,.log,.rtf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,text/*,application/pdf,application/epub+zip,application/json,application/xml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Props {
  onSend: (
    text: string,
    attachments: Attachment[],
    opts?: { deepThink?: boolean },
  ) => void;
  onAbort?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  supportsImages?: boolean;
  /** Kept for API compatibility; the new layout no longer renders behavior
   *  state chips above the composer (see wis-tags-row mood tags instead). */
  showStateChips?: boolean;
}

/** Mood tags rendered above the composer. Tapping toggles the prefix
 *  「{tag}」 at the start of the textarea — read by the model as a soft
 *  hint about the register of the reply. */
const MOOD_TAGS = ['想了想', '碎碎念', '做梦', '撒娇'] as const;
type MoodTag = (typeof MOOD_TAGS)[number];

function buildPrefix(active: MoodTag[]): string {
  if (active.length === 0) return '';
  return active.map((t) => `「${t}」`).join('') + ' ';
}

function stripPrefix(text: string, tags: MoodTag[]): string {
  let body = text;
  const prefix = buildPrefix(tags);
  if (prefix && body.startsWith(prefix)) body = body.slice(prefix.length);
  return body;
}

export default function ChatInput({
  onSend,
  onAbort,
  busy = false,
  disabled = false,
  placeholder = '写点什么……',
  supportsImages = true,
}: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [activeTags, setActiveTags] = useState<MoodTag[]>([]);
  /** Sticky deep-think — stays on across turns until tapped off (ADHD-friendly). */
  const [deepThink, setDeepThink] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const typingStartRef = useRef<number | null>(null);
  const typedCharsRef = useRef<number>(0);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!attachMenuRef.current?.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [attachMenuOpen]);

  function toggleTag(t: MoodTag) {
    setActiveTags((prev) => {
      const next = prev.includes(t)
        ? prev.filter((x) => x !== t)
        : [...prev, t];
      // Re-write the textarea to reflect the new prefix without losing the
      // body the user has typed past it.
      const body = stripPrefix(value, prev);
      setValue(buildPrefix(next) + body);
      return next;
    });
    // Restore focus so the keyboard stays up.
    queueMicrotask(() => taRef.current?.focus());
  }

  function submit() {
    const text = value.trim();
    if ((!text && attachments.length === 0) || busy || disabled) return;
    try {
      assertChatMessageSize(text);
    } catch (err) {
      alert(formatStorageError(err));
      return;
    }
    if (typingStartRef.current && typedCharsRef.current > 0) {
      recordTyping(typedCharsRef.current, Date.now() - typingStartRef.current);
    }
    typingStartRef.current = null;
    typedCharsRef.current = 0;
    onSend(text, attachments, { deepThink });
    setValue('');
    setAttachments([]);
    setActiveTags([]);
    // deepThink stays sticky on purpose — deep sessions often span many turns
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      !isMobile
    ) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    // Giant paste into the composer has OOMed the tab before send; clamp.
    if (next.length > MAX_CHAT_MESSAGE_CHARS) {
      alert(
        `粘贴内容太长了（${formatChars(next.length)}）。` +
          `聊天单条上限 ${formatChars(MAX_CHAT_MESSAGE_CHARS)}——超长正文请放到「书架」导入。`,
      );
      const clipped = next.slice(0, MAX_CHAT_MESSAGE_CHARS);
      if (typingStartRef.current === null) typingStartRef.current = Date.now();
      const delta = clipped.length - value.length;
      if (delta > 0) typedCharsRef.current += delta;
      setValue(clipped);
      return;
    }
    if (typingStartRef.current === null) typingStartRef.current = Date.now();
    const delta = next.length - value.length;
    if (delta > 0) typedCharsRef.current += delta;
    setValue(next);
  }

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const out: Attachment[] = [];
      const rejected: string[] = [];
      for (const f of list) {
        if (!f.type.startsWith('image/') && f.size > MAX_FILE_BYTES) {
          rejected.push(f.name || '文件');
          continue;
        }
        try {
          out.push(await fileToAttachment(f));
        } catch {
          /* skip */
        }
      }
      if (rejected.length > 0) {
        alert(
          `这些文件超过 ${formatBytes(MAX_FILE_BYTES)}，先压缩再传喵：\n${rejected.join('\n')}`,
        );
      }
      setAttachments((prev) => [...prev, ...out]);
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!supportsImages) return;
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await handleFiles(files);
    }
  }

  const canSend = !disabled && !busy && (value.trim() || attachments.length > 0);

  return (
    <div className="wis-composer-wrap">
      <div className="chat-content-column wis-composer-inner">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => removeAttachment(a.id)}
              />
            ))}
          </div>
        )}

        <div className="wis-tags-row">
          <button
            type="button"
            onClick={() => {
              setDeepThink((v) => !v);
              queueMicrotask(() => taRef.current?.focus());
            }}
            className={`wis-tag wis-tag-deep${deepThink ? ' is-on' : ''}`}
            title="粘性开关：开着时每轮用 max thinking。深聊/亲密也会自动拉高，忘开也没事。"
            aria-pressed={deepThink}
          >
            长思考
          </button>
          {MOOD_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`wis-tag${activeTags.includes(t) ? ' is-on' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="wis-composer-row">
          {supportsImages && (
            <>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept={FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <div ref={attachMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAttachMenuOpen((v) => !v)}
                  disabled={disabled || uploading}
                  className="wis-send-btn"
                  aria-label="添加附件"
                  title="添加附件"
                  aria-expanded={attachMenuOpen}
                  aria-haspopup="menu"
                >
                  <Paperclip size={14} strokeWidth={1.6} />
                </button>
                {attachMenuOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-[132px] overflow-hidden rounded-xl border border-lavender-100 bg-white/95 py-1 shadow-lg backdrop-blur-md"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-light text-ink-700 transition hover:bg-lavender-50"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        imageRef.current?.click();
                      }}
                    >
                      <ImageIcon size={14} strokeWidth={1.6} className="opacity-70" />
                      图片
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-light text-ink-700 transition hover:bg-lavender-50"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileRef.current?.click();
                      }}
                    >
                      <FileText size={14} strokeWidth={1.6} className="opacity-70" />
                      文件
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <textarea
            ref={taRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={disabled ? '请先去设置里配一个 endpoint 喵' : placeholder}
            disabled={disabled}
            rows={1}
            className="wis-composer-field"
          />
          {busy ? (
            <button
              type="button"
              onClick={onAbort}
              className="wis-send-btn is-stop"
              aria-label="停止"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="wis-send-btn"
              aria-label="发送"
            >
              <Send size={13} strokeWidth={1.7} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  if (attachment.kind === 'image') {
    return (
      <div className="group relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-lavender-200">
        <img
          src={attachmentDataUrl(attachment)}
          alt={attachment.filename ?? 'image'}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900/55 text-white transition hover:bg-ink-900"
          aria-label="移除"
        >
          <X size={12} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-xs font-light text-ink-700 ring-1 ring-lavender-100">
      <Paperclip size={12} strokeWidth={1.6} className="shrink-0 opacity-60" />
      <span className="max-w-[16ch] truncate font-mono">
        {attachment.filename ?? '文件'}
      </span>
      <span className="text-ink-500">{formatBytes(attachment.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-ink-500 transition hover:bg-lavender-50"
        aria-label="移除"
      >
        <X size={12} />
      </button>
    </div>
  );
}
