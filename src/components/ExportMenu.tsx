import { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileCode, FileJson } from 'lucide-react';
import {
  exportConversation,
  downloadText,
  type ConversationFormat,
} from '../lib/export';
import type { Conversation, Persona } from '../types';

interface Props {
  conversation: Conversation | undefined;
  persona?: Persona;
  disabled?: boolean;
}

export default function ExportMenu({ conversation, persona, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleExport(format: ConversationFormat) {
    if (!conversation) return;
    setOpen(false);
    const out = await exportConversation(conversation, {
      format,
      persona,
      includeUsage: true,
    });
    downloadText(out.content, out.filename, out.mime);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !conversation}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-lavender-200 bg-white text-ink-700 transition hover:bg-lavender-50 disabled:opacity-40"
        aria-label="导出对话"
        title="导出对话"
      >
        <Download size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 min-w-[180px] overflow-hidden rounded-xl border border-lavender-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => handleExport('markdown')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            <FileText size={14} />
            Markdown (.md)
          </button>
          <button
            type="button"
            onClick={() => handleExport('text')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            <FileCode size={14} />
            纯文本 (.txt)
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            <FileJson size={14} />
            JSON (可重导入)
          </button>
        </div>
      )}
    </div>
  );
}
