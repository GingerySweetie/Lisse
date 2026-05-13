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
import type { Attachment, Message, Persona } from '../types';
import { getSiblingInfo, type SiblingInfo } from '../lib/branch';
import { attachmentDataUrl, formatBytes } from '../lib/attachments';
import { getPersonaFontStack } from '../lib/persona-state';

interface Props {
  message: Message;
  /** Live-streaming text override (used during in-flight assistant response). */
  streamingText?: string;
  /** Live-streaming thinking text override. */
  streamingThinking?: string;
  /** Disable interactive controls (during another stream). */
  disabled?: boolean;
  /** Persona id for font lookup; usually the author for group, conversation default otherwise. */
  personaId?: string;
  /** The persona who authored this assistant message (for the in-group label). */
  authorPersona?: Persona;
  /** Is this conversation a group chat? Toggles in-group affordances. */
  isGroup?: boolean;
  /** All persona members of the group (used to render 让 X 说 buttons). */
  groupMembers?: Persona[];
  /** Called when the user asks another persona to speak after this message. */
  onLetSpeak?: (persona: Persona) => void;
  onEdit?: (newText: string) => void;
  onRegenerate?: () => void;
  onSwitchSibling?: (newActiveMessageId: string) => void;
}

export default function MessageBubble({
  message,
  streamingText,
  streamingThinking,
  disabled,
  personaId,
  authorPersona,
  isGroup,
  groupMembers,
  onLetSpeak,
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

  // Per-persona font for the assistant's voice. Falls back to body sans.
  const personaFont = !isUser ? getPersonaFontStack(personaId) : undefined;
  const personaFontStyle = personaFont ? { fontFamily: personaFont } : undefined;

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
            <span
              className="font-normal italic tracking-wide"
              style={{
                color: authorPersona.color,
                fontFamily: 'var(--font-serif)',
              }}
            >
              {authorPersona.name}
            </span>
          </div>
        )}
        {!isUser && hasThinking && (
          <ThinkingBlock
            text={thinking}
            streaming={isStreaming && !text}
            fontFamily={personaFont}
          />
        )}

        {message.attachments && message.attachments.length > 0 && (
          <Attachments attachments={message.attachments} alignRight={isUser} />
        )}

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
            <div className="prose-msg" style={personaFontStyle}>
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
            {message.content && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 shadow-sm ring-1 ring-lavender-100 transition hover:bg-white"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-mint-500" /> 已复制
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
  fontFamily,
}: {
  text: string;
  streaming: boolean;
  fontFamily?: string;
}) {
  const [open, setOpen] = useState(streaming);
  // When the assistant text starts streaming, fold thinking back to a peek.
  useEffect(() => {
    setOpen(streaming);
  }, [streaming]);

  // Thinking is the persona's inner voice; use their font when known.
  // Fall back to the serif used elsewhere for an italic literary tone.
  const innerFont = fontFamily ?? 'var(--font-serif)';

  return (
    <div className="rounded-2xl border border-dashed border-lavender-200/80 bg-white/40 px-3 py-2 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs text-lavender-600 transition hover:text-lavender-500"
      >
        <Brain size={13} />
        <span className="italic" style={{ fontFamily: innerFont }}>
          {streaming ? '在想……' : '想了想'}
        </span>
        <span className="ml-auto opacity-60">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {open && (
        <div
          className="mt-2 whitespace-pre-wrap text-[13px] italic leading-relaxed text-ink-500"
          style={{ fontFamily: innerFont }}
        >
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
          className="block overflow-hidden rounded-xl ring-1 ring-lavender-200 transition hover:ring-lavender-300"
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
