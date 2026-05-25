import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Image as ImageIcon, Square, X } from 'lucide-react';
import type { Attachment } from '../types';
import {
  attachmentDataUrl,
  fileToAttachment,
  formatBytes,
} from '../lib/attachments';
import { recordTyping } from '../lib/behavior';
import StateChips from './StateChips';

interface Props {
  onSend: (text: string, attachments: Attachment[]) => void;
  onAbort?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  supportsImages?: boolean;
  showStateChips?: boolean;
}

export default function ChatInput({
  onSend,
  onAbort,
  busy = false,
  disabled = false,
  placeholder = '说点什么……',
  supportsImages = true,
  showStateChips = true,
}: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Track typing cadence for behavioral inference.
  const typingStartRef = useRef<number | null>(null);
  const typedCharsRef = useRef<number>(0);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if ((!text && attachments.length === 0) || busy || disabled) return;
    // Flush typing telemetry into the local moving average.
    if (typingStartRef.current && typedCharsRef.current > 0) {
      recordTyping(typedCharsRef.current, Date.now() - typingStartRef.current);
    }
    typingStartRef.current = null;
    typedCharsRef.current = 0;
    onSend(text, attachments);
    setValue('');
    setAttachments([]);
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
    <div className="border-t border-lavender-100/70 bg-white/55 px-3 py-2.5 backdrop-blur-md md:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {showStateChips && <StateChips />}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => removeAttachment(a.id)}
              />
            ))}
          </div>
        )}

        {/* Pill input row: left attach +, text, right send/stop */}
        <div className="flex items-end gap-1.5 rounded-3xl border border-lavender-100/80 bg-white/85 py-1 pl-1 pr-1 shadow-[0_1px_2px_rgba(124,105,160,0.05)] backdrop-blur-sm focus-within:border-lavender-300 focus-within:bg-white">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full text-ink-500 transition hover:bg-lavender-50 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="附图片"
                title="附图片"
              >
                <ImageIcon size={16} strokeWidth={1.5} />
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
            className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] font-light text-ink-900 placeholder:text-ink-500/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {busy ? (
            <button
              type="button"
              onClick={onAbort}
              className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full bg-rose-100 text-rose-500 ring-1 ring-rose-200/60 transition hover:bg-rose-200"
              aria-label="停止"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className={`flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full ring-1 backdrop-blur-sm transition ${
                canSend
                  ? 'bg-lavender-200/80 text-lavender-600 ring-lavender-300/60 hover:bg-lavender-300/85 hover:text-ink-900'
                  : 'bg-lavender-100/60 text-ink-500/50 ring-lavender-100/40'
              }`}
              aria-label="发送"
            >
              <ArrowUp size={16} strokeWidth={1.7} />
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
