import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onAbort?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  onAbort,
  busy = false,
  disabled = false,
  placeholder = '说点什么……',
}: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send; Shift+Enter for newline. Mobile keyboards: keep Enter as newline.
    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-lavender-200 bg-white/70 px-3 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '请先去设置里配一个 endpoint 喵' : placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-[44px] flex-1 resize-none rounded-2xl border border-lavender-200 bg-white px-4 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-500/70 focus:border-mint-300 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-200 text-rose-700 transition hover:bg-rose-300"
            aria-label="停止"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-mint-200 text-ink-900 transition hover:bg-mint-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="发送"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
