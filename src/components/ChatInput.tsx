import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Send, Square, X } from 'lucide-react';
import type { Attachment } from '../types';
import {
  attachmentDataUrl,
  fileToAttachment,
  formatBytes,
} from '../lib/attachments';
import { recordTyping } from '../lib/behavior';

interface Props {
  onSend: (text: string, attachments: Attachment[]) => void;
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
  const [activeTags, setActiveTags] = useState<MoodTag[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typingStartRef = useRef<number | null>(null);
  const typedCharsRef = useRef<number>(0);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

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
    if (typingStartRef.current && typedCharsRef.current > 0) {
      recordTyping(typedCharsRef.current, Date.now() - typingStartRef.current);
    }
    typingStartRef.current = null;
    typedCharsRef.current = 0;
    onSend(text, attachments);
    setValue('');
    setAttachments([]);
    setActiveTags([]);
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
      for (const f of list) {
        try {
          out.push(await fileToAttachment(f));
        } catch {
          /* skip */
        }
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
      <div className="mx-auto w-full max-w-3xl">
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
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || uploading}
                className="wis-send-btn"
                aria-label="附图片"
                title="附图片"
              >
                <ImageIcon size={14} strokeWidth={1.6} />
              </button>
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
      <span className="max-w-[12ch] truncate font-mono">
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
