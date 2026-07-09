import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertCircle,
  BookOpen,
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
import type { Attachment, Message, ToolCallRecord } from '../types';
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
      className={`group msg-enter flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex min-w-0 flex-col gap-1.5 ${
          isUser ? 'max-w-[85%]' : 'w-full max-w-full'
        }`}
      >
        {!isUser && !isError && (
          <div className="wis-ai-msg ai-message">
            {/* Letter header — small bud + gradient stroke. Pure visual,
                no text. Replaces the previous .ai-byline persona name. */}
            <div className="wis-ai-byline">
              <span className="wis-ai-bud" />
              <span className="wis-ai-stroke" />
            </div>
            {hasThinking && (
              <ThinkingBlock text={thinking} streaming={isStreaming && !text} />
            )}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolCallChips calls={message.toolCalls} />
            )}
            {message.attachments && message.attachments.length > 0 && (
              <Attachments attachments={message.attachments} alignRight={false} />
            )}
            <div className="wis-ai-body ai-body prose-msg min-w-0">
              {text ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {mergeShortParagraphs(text)}
                </ReactMarkdown>
              ) : isStreaming ? (
                <span className="stream-cursor" />
              ) : null}
              {message.usage && message.status === 'done' && (
                <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-ink-500/70">
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
                        {(() => {
                          const pct = cacheHitPercent(message.usage);
                          return pct !== null ? ` (${pct}%)` : '';
                        })()}
                      </span>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {isUser && message.attachments && message.attachments.length > 0 && (
          <Attachments attachments={message.attachments} alignRight={true} />
        )}

        {/* Book anchor: show the quoted passage that the user was commenting on */}
        {isUser && message.bookAnchor?.selection && (
          <div className="flex justify-end">
            <div className="mb-1 flex max-w-[85%] items-start gap-1.5 rounded-xl border border-lavender-200 bg-lavender-50/70 px-3 py-2 text-xs text-ink-600 shadow-sm">
              <BookOpen size={12} className="mt-0.5 shrink-0 text-lavender-400" />
              <blockquote className="m-0 line-clamp-3 italic leading-relaxed">
                {message.bookAnchor.selection}
              </blockquote>
            </div>
          </div>
        )}

        {(isUser || isError) && (
          <div
            className={
              isUser
                ? 'wis-user-bubble bubble-user prose-msg min-w-0'
                : 'min-w-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] leading-relaxed text-rose-700'
            }
            style={
              isUser && accentColor
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
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {text}
              </ReactMarkdown>
            )}
          </div>
        )}

        {/* Action row: sibling nav + edit/regenerate */}
        {/*
          Shown at low opacity by default so they're discoverable on touch
          devices (no hover). Desktop hover bumps opacity to full.
        */}
        {!editing && !isStreaming && (
          <div
            className={`msg-actions opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-90 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            {sib && sib.total > 1 && (
              <div className="flex items-center gap-0 text-ink-500/45">
                <button
                  type="button"
                  onClick={() => gotoSibling(-1)}
                  disabled={disabled}
                  className="px-0.5 py-0.5 transition hover:text-ink-700"
                  aria-label="上一条分支"
                >
                  <ChevronLeft size={11} strokeWidth={1.5} />
                </button>
                <span className="px-0.5 text-[10px] tabular-nums leading-none">
                  {sib.index + 1}/{sib.total}
                </span>
                <button
                  type="button"
                  onClick={() => gotoSibling(1)}
                  disabled={disabled}
                  className="px-0.5 py-0.5 transition hover:text-ink-700"
                  aria-label="下一条分支"
                >
                  <ChevronRight size={11} strokeWidth={1.5} />
                </button>
              </div>
            )}
            {message.content && (
              <button type="button" onClick={handleCopy} className="msg-act">
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
                className="msg-act"
              >
                <Pencil size={12} /> 编辑
              </button>
            )}
            {!isUser && onRegenerate && message.role === 'assistant' && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={disabled}
                className="msg-act"
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

/**
 * Thinking block — a small chip in the bubble that opens a centered
 * modal when clicked. Long thinking traces stretched the chat flow
 * unreadably; the modal puts them in their own scroll container.
 *
 * 流式期间 chip 显示「在想……」, 用户主动点开 modal 才看实时滚动;
 * 不再自动展开避免 modal 在用户看正文时突然弹出.
 */
function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  // 三态: 'closed' = 完全不渲染; 'opening' = 已挂载, CSS 待跳到 open 帧;
  // 'open' = 稳态; 'closing' = 触发 close 动画, 150ms 后 unmount.
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>(
    'closed',
  );

  function open() {
    if (phase !== 'closed') return;
    setPhase('opening');
    // 下一帧再切到 open, 让 'opening' 的初始 CSS 先 paint 一次,
    // CSS transition 才能从 0.95/0 过渡到 1/1.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
    });
  }

  function close() {
    if (phase === 'closed' || phase === 'closing') return;
    setPhase('closing');
    window.setTimeout(() => setPhase('closed'), 150);
  }

  // ESC 关闭 + body 锁滚 (开 modal 时阻止背后聊天页跟着滚)
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [phase]);

  // 触发 chip — 流式时显示「在想……」, 否则「想了想」
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="thinking-head"
        aria-haspopup="dialog"
      >
        <Brain size={13} className="opacity-60" />
        <span className="italic">{streaming ? '在想……' : '想了想'}</span>
      </button>
      {phase !== 'closed' && (
        <ThinkingModal
          text={text}
          streaming={streaming}
          phase={phase}
          onClose={close}
        />
      )}
    </>
  );
}

function ThinkingModal({
  text,
  streaming,
  phase,
  onClose,
}: {
  text: string;
  streaming: boolean;
  phase: 'opening' | 'open' | 'closing';
  onClose: () => void;
}) {
  // 下滑手势关闭. 触点 Y 在 grip / titlebar 上按下, 沿 Y 拖, 阈值
  // > 80px 松手 → 关闭. 拖过程中 window 跟手 translateY, 没过阈值
  // 弹回 0. 用 ref 而不是 state 避免每帧 re-render 卡手.
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    if (touchStartY.current === null) return;
    touchStartY.current = null;
    if (dragY > 80) {
      // 触发关闭 — 不重置 dragY, 让 CSS transition 从当前拖位置
      // 平滑滑回 100%
      onClose();
    } else {
      setDragY(0);
    }
  }

  const windowStyle =
    dragY > 0
      ? {
          transform: `translateY(${dragY}px)`,
          // 拖动时关掉过渡, 跟手才不黏滞
          transition: 'none' as const,
        }
      : undefined;

  // 渲染到 document.body 而不是消息气泡内部. 否则 chat tree 里
  // 任何祖先节点带 transform / filter / will-change 都会把
  // position: fixed 锚到那个祖先而不是 viewport — 这就是「框大小
  // 随思考链变化, 初始短短思考链居中」那条 bug 的根因. portal
  // 一发, modal 直接挂在 body 下面, containing block 永远是 viewport.
  return createPortal(
    <div
      className={`thinking-modal-backdrop ${phase === 'open' ? 'is-open' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`thinking-modal-window ${phase === 'open' ? 'is-open' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={windowStyle}
        role="dialog"
        aria-modal="true"
        aria-label="想了想"
      >
        {/* 顶部 grip 横条 — 视觉上是下滑手势提示, 也是主要拖拽抓点 */}
        <div
          className="thinking-modal-grip-area"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <span className="thinking-modal-grip" />
        </div>
        <header className="thinking-modal-bar">
          <span className="thinking-modal-title">
            <Brain size={13} className="opacity-60" />
            <span className="italic">想了想</span>
            {streaming && (
              <span className="ml-2 text-[11px] opacity-60">实时</span>
            )}
          </span>
        </header>
        <div className="thinking-modal-body">
          {text}
          {streaming && <span className="stream-cursor" />}
        </div>
      </div>
    </div>,
    document.body,
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

/** Merge short consecutive paragraphs into flowing prose, and collapse
 *  in-paragraph single \n into spaces so prose reflows at the container
 *  edge instead of breaking where the model emitted its newlines.
 *  Lists / headings / quotes / fenced code keep their structural \n. */
/**
 * Cache hit rate as a whole percent (0–100), or null when not computable.
 *
 * inputTokens is the total prompt size for messages written after the usage
 * normalization (Anthropic adapter sums input + cache_creation + cache_read;
 * OpenAI prompt_tokens already includes cached_tokens). Older Anthropic
 * messages stored the raw uncached-only input_tokens, so read+creation can
 * exceed inputTokens — detect that and reconstruct the true total instead of
 * showing a >100% rate.
 */
function cacheHitPercent(usage: NonNullable<Message['usage']>): number | null {
  const read = usage.cacheReadTokens ?? 0;
  const creation = usage.cacheCreationTokens ?? 0;
  const input = usage.inputTokens ?? 0;
  const total = input >= read + creation ? input : input + read + creation;
  if (total <= 0 || read <= 0) return null;
  return Math.min(100, Math.round((read / total) * 100));
}

function mergeShortParagraphs(raw: string): string {
  // Don't touch fenced code blocks
  const parts = raw.split(/(```[\s\S]*?```)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // code block, keep as-is
    // Split on double-newline (paragraph boundary)
    const paragraphs = part.split(/\n\n+/);
    const merged: string[] = [];
    let buffer: string[] = [];
    for (const p of paragraphs) {
      const trimmed = p.trim();
      // Structural if ANY line inside is a heading / list / blockquote.
      // Tested per-line because a paragraph might be "intro\n- item".
      const hasStructure = trimmed
        .split('\n')
        .some((line) => /^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>/.test(line));
      // Non-structural prose: collapse single \n inside the paragraph
      // to a space so it reflows naturally.
      const processed = hasStructure
        ? trimmed
        : trimmed.replace(/\n+/g, ' ');
      const isShort = processed.length < 80;
      if (!hasStructure && isShort) {
        buffer.push(processed);
      } else {
        if (buffer.length) { merged.push(buffer.join(' ')); buffer = []; }
        merged.push(processed);
      }
    }
    if (buffer.length) merged.push(buffer.join(' '));
    return merged.join('\n\n');
  }).join('');
}
