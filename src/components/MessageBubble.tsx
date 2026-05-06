import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  X,
  Check,
} from 'lucide-react';
import type { Message } from '../types';
import { getSiblingInfo, type SiblingInfo } from '../lib/branch';

interface Props {
  message: Message;
  /** Live-streaming text override (used during in-flight assistant response). */
  streamingText?: string;
  /** Disable interactive controls (during another stream). */
  disabled?: boolean;
  onEdit?: (newText: string) => void;
  onRegenerate?: () => void;
  onSwitchSibling?: (newActiveMessageId: string) => void;
}

export default function MessageBubble({
  message,
  streamingText,
  disabled,
  onEdit,
  onRegenerate,
  onSwitchSibling,
}: Props) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';
  const text = streamingText ?? message.content;

  const [sib, setSib] = useState<SiblingInfo | null>(null);
  useEffect(() => {
    getSiblingInfo(message).then(setSib);
  }, [message.id, message.activeChildId]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
  }
  function saveEdit() {
    const t = draft.trim();
    if (!t || t === message.content) {
      setEditing(false);
      return;
    }
    onEdit?.(t);
    setEditing(false);
  }

  function gotoSibling(direction: -1 | 1) {
    if (!sib || sib.total <= 1) return;
    const next = (sib.index + direction + sib.total) % sib.total;
    const target = sib.siblings[next];
    if (target) onSwitchSibling?.(target.id);
  }

  return (
    <div
      className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex min-w-0 flex-col gap-1 ${
          isUser ? 'max-w-[85%]' : 'w-full max-w-full'
        }`}
      >
        <div
          className={`min-w-0 rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser
              ? 'bg-sky-200/80 text-ink-900 shadow-[0_1px_2px_rgba(124,105,160,0.06)] ring-1 ring-sky-300/40 backdrop-blur-sm'
              : isError
                ? 'border border-rose-200 bg-rose-50 text-rose-700'
                : 'bg-white/65 text-ink-900 shadow-[0_1px_2px_rgba(124,105,160,0.05)] ring-1 ring-lavender-100 backdrop-blur-sm'
          }`}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(2, Math.min(12, draft.split('\n').length + 1))}
                className="w-full resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 text-[15px] text-ink-900 focus:border-mint-300"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-ink-500 transition hover:bg-lavender-50"
                >
                  <X size={14} /> 取消
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="flex items-center gap-1 rounded-lg bg-mint-300 px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:bg-mint-400"
                >
                  <Check size={14} /> 保存并重发
                </button>
              </div>
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">请求出错</div>
                <div className="mt-1 break-all text-sm opacity-90">
                  {message.errorMessage ?? '未知错误'}
                </div>
              </div>
            </div>
          ) : isUser ? (
            <div className="prose-msg">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {text}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="prose-msg">
              {text ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {text}
                </ReactMarkdown>
              ) : isStreaming ? (
                <span className="inline-flex gap-1 text-ink-500">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse [animation-delay:0.15s]">●</span>
                  <span className="animate-pulse [animation-delay:0.3s]">●</span>
                </span>
              ) : null}
            </div>
          )}

          {message.usage &&
            message.role === 'assistant' &&
            message.status === 'done' && (
              <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-500">
                {message.usage.inputTokens !== undefined && (
                  <span>输入 {message.usage.inputTokens}</span>
                )}
                {message.usage.outputTokens !== undefined && (
                  <span>输出 {message.usage.outputTokens}</span>
                )}
                {message.usage.cacheReadTokens !== undefined &&
                  message.usage.cacheReadTokens > 0 && (
                    <span className="text-mint-500">
                      缓存命中 {message.usage.cacheReadTokens}
                    </span>
                  )}
              </div>
            )}
        </div>

        {/* Action row: sibling nav + edit/regenerate */}
        {/*
          Shown at low opacity by default so they're discoverable on touch
          devices (no hover). Desktop hover bumps opacity to full.
        */}
        {!editing && !isStreaming && (
          <div
            className={`flex items-center gap-1 px-1 text-xs text-ink-500 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-90 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            {sib && sib.total > 1 && (
              <div className="flex items-center gap-0.5 rounded-full bg-white/80 px-1 py-0.5 shadow-sm ring-1 ring-lavender-100">
                <button
                  type="button"
                  onClick={() => gotoSibling(-1)}
                  disabled={disabled}
                  className="rounded-full p-1 transition hover:bg-lavender-100 disabled:opacity-40"
                  aria-label="上一条分支"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-1 tabular-nums">
                  {sib.index + 1}/{sib.total}
                </span>
                <button
                  type="button"
                  onClick={() => gotoSibling(1)}
                  disabled={disabled}
                  className="rounded-full p-1 transition hover:bg-lavender-100 disabled:opacity-40"
                  aria-label="下一条分支"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            {isUser && onEdit && (
              <button
                type="button"
                onClick={startEdit}
                disabled={disabled}
                className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 shadow-sm ring-1 ring-lavender-100 transition hover:bg-white disabled:opacity-40"
              >
                <Pencil size={12} /> 编辑
              </button>
            )}
            {!isUser && onRegenerate && message.role === 'assistant' && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={disabled}
                className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 shadow-sm ring-1 ring-lavender-100 transition hover:bg-white disabled:opacity-40"
              >
                <RefreshCw size={12} /> 重生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
