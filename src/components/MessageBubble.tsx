import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import type { Attachment, Message, Persona, ToolCallRecord } from '../types';
import { getSiblingInfo, type SiblingInfo } from '../lib/branch';
import { attachmentDataUrl, formatBytes } from '../lib/attachments';
import { DEFAULT_ACCENT } from './AccentPicker';

interface Props {
  message: Message;
  /** Live-streaming text override (used during in-flight assistant response). */
  streamingText?: string;
  /** Live-streaming thinking text override. */
  streamingThinking?: string;
  /** Disable interactive controls (during another stream). */
  disabled?: boolean;
  /** The persona who authored this assistant message (for the in-group label). */
  authorPersona?: Persona;
  /** Is this conversation a group chat? Toggles in-group affordances. */
  isGroup?: boolean;
  /** All persona members of the group (used to render 让 X 说 buttons). */
  groupMembers?: Persona[];
  /** Called when the user asks another persona to speak after this message. */
  onLetSpeak?: (persona: Persona) => void;
  /** Conversation accent color used for the user bubble. Defaults to sky. */
  accentColor?: string | null;
  onEdit?: (newText: string) => void;
  onRegenerate?: () => void;
  onSwitchSibling?: (newActiveMessageId: string) => void;
}

export default function MessageBubble({
  message,
  streamingText,
  streamingThinking,
  disabled,
  authorPersona,
  isGroup,
  groupMembers,
  onLetSpeak,
  accentColor,
  onEdit,
  onRegenerate,
  onSwitchSibling,
}: Props) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';
  const text = streamingText ?? message.content;
  const thinking = streamingThinking ?? message.thinking ?? '';
  const hasThinking = thinking.trim().length > 0;
  const accent = accentColor ?? DEFAULT_ACCENT;

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

  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    const payload = message.content || '';
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // Fallback for older / insecure contexts.
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        // give up silently
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex min-w-0 flex-col gap-1.5 ${
          isUser ? 'max-w-[85%]' : 'w-full max-w-full'
        }`}
      >
        {!isUser && isGroup && authorPersona && (
          <div className="flex items-center gap-1.5 px-1 text-xs">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: authorPersona.color }}
            >
              {authorPersona.avatar}
            </span>
            <span className="font-normal italic tracking-wide text-ink-500">
              {authorPersona.name}
            </span>
          </div>
        )}
        {!isUser && hasThinking && (
          <ThinkingBlock text={thinking} streaming={isStreaming && !text} />
        )}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallChips calls={message.toolCalls} />
        )}

        {message.attachments && message.attachments.length > 0 && (
          <Attachments attachments={message.attachments} alignRight={isUser} />
        )}

        <div
          className={`min-w-0 text-[15px] leading-relaxed ${
            isUser
              ? 'rounded-2xl px-4 py-3 text-ink-900 ring-1'
              : isError
                ? 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700'
                : 'px-1 py-1 text-ink-900'
          }`}
          style={
            isUser
              ? {
                  background: `${accent}73`,
                  boxShadow: `inset 0 0 0 1px ${accent}40`,
                }
              : undefined
          }
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(2, Math.min(12, draft.split('\n').length + 1))}
                className="w-full resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 text-[15px] text-ink-900 focus:border-lavender-300"
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
                  className="flex items-center gap-1 rounded-lg bg-lavender-200 px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:bg-lavender-300"
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
                    <span className="text-sky-500">
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
            {message.content && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 shadow-sm ring-1 ring-lavender-100 transition hover:bg-white"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-sky-500" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy size={12} /> 复制
                  </>
                )}
              </button>
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
            {!isUser &&
              isGroup &&
              groupMembers &&
              onLetSpeak &&
              groupMembers
                .filter((p) => p.id !== message.personaId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onLetSpeak(p)}
                    disabled={disabled}
                    className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 shadow-sm ring-1 ring-lavender-100 transition hover:bg-white disabled:opacity-40"
                    style={{ color: p.color }}
                    title={`让 ${p.name} 说几句`}
                  >
                    <span
                      className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                      style={{ background: p.color }}
                    >
                      {p.avatar}
                    </span>
                    让 {p.name}
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible thinking block. Auto-expands while streaming so the user
 * can watch the reasoning unfold; collapses after the visible text starts.
 */
function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(streaming);
  // When the assistant text starts streaming, fold thinking back to a peek.
  useEffect(() => {
    setOpen(streaming);
  }, [streaming]);

  return (
    <div className="px-1 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs text-ink-500/70 transition hover:text-ink-500"
      >
        <Brain size={13} className="opacity-60" />
        <span className="italic">{streaming ? '在想……' : '想了想'}</span>
        <span className="ml-auto opacity-50">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {open && (
        <div className="mt-2 whitespace-pre-wrap pl-5 text-[13px] italic leading-relaxed text-ink-500">
          {text}
          {streaming && (
            <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-lavender-400 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}

function Attachments({
  attachments,
  alignRight,
}: {
  attachments: Attachment[];
  alignRight: boolean;
}) {
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');
  return (
    <div
      className={`flex flex-wrap gap-2 ${alignRight ? 'justify-end' : 'justify-start'}`}
    >
      {images.map((a) => (
        <a
          key={a.id}
          href={attachmentDataUrl(a)}
          target="_blank"
          rel="noopener"
          className="block overflow-hidden rounded-[14px] ring-1 ring-sky-300/20 shadow-[0_1px_4px_rgba(124,105,160,0.06)]"
        >
          <img
            src={attachmentDataUrl(a)}
            alt={a.filename ?? 'image'}
            className="max-h-72 max-w-full object-contain"
          />
        </a>
      ))}
      {files.map((a) => (
        <a
          key={a.id}
          href={attachmentDataUrl(a)}
          download={a.filename}
          className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-ink-700 ring-1 ring-lavender-200 transition hover:bg-white"
        >
          <span className="font-mono">{a.filename ?? '文件'}</span>
          <span className="text-ink-500">{formatBytes(a.size)}</span>
        </a>
      ))}
    </div>
  );
}

function ToolCallChips({ calls }: { calls: ToolCallRecord[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((c) => (
        <ToolCallChip key={c.id} call={c} />
      ))}
    </div>
  );
}

function ToolCallChip({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const isRemember = call.name === 'remember';
  const isRecall = call.name === 'recall';
  const icon = isRemember ? '📝' : isRecall ? '🔍' : '🛠';
  const label = (() => {
    if (call.error) return `${call.name} 出错`;
    if (isRemember) {
      const text = (call.input as { text?: string })?.text;
      return text ? `记住：${text}` : '记住';
    }
    if (isRecall) {
      const query = (call.input as { query?: string })?.query;
      const facts = (call.result as { facts?: unknown[] })?.facts;
      const count = Array.isArray(facts) ? facts.length : 0;
      return query
        ? `查"${truncate(query, 24)}"→ ${count} 条`
        : `查 → ${count} 条`;
    }
    return call.name;
  })();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
          call.error
            ? 'border-rose-200 bg-rose-50 text-rose-500'
            : 'border-lavender-200/70 bg-white/60 text-ink-500 hover:bg-white'
        }`}
      >
        <span>{icon}</span>
        <span className="truncate">{label}</span>
        {open ? (
          <ChevronUp size={11} className="opacity-60" />
        ) : (
          <ChevronDown size={11} className="opacity-60" />
        )}
      </button>
      {open && (
        <div className="rounded-lg border border-lavender-100 bg-white/70 px-3 py-2 text-[11px] text-ink-500">
          <div className="mb-1 font-mono text-ink-700">{call.name}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug">
{JSON.stringify(call.input, null, 2)}
          </pre>
          {call.result !== undefined && (
            <>
              <div className="mt-2 font-mono text-ink-700">→</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug">
{JSON.stringify(call.result, null, 2)}
              </pre>
            </>
          )}
          {call.error && (
            <div className="mt-2 text-rose-500">{call.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
