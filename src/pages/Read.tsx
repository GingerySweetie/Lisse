import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronLeft,
  ListTree,
  MessageSquarePlus,
  Send,
  Square,
  X,
} from 'lucide-react';
import BookmarkTocPanel from '../components/BookmarkTocPanel';
import { db, getSettings, saveSettings } from '../db';
import {
  extractExcerpt,
  getBookConversation,
  updateReadingPosition,
} from '../lib/books';
import { sendMessage, letPersonaSpeak } from '../lib/chat';
import { getActiveBranch } from '../lib/branch';
import PersonaPicker from '../components/PersonaPicker';
import StylePicker from '../components/StylePicker';
import EndpointPicker from '../components/EndpointPicker';
import type { Conversation, Message, Persona } from '../types';

export default function ReadPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();

  const book = useLiveQuery(
    () => (bookId ? db.books.get(bookId) : undefined),
    [bookId],
  );

  const conversation = useBookConversation(book);

  const allMessages = useLiveQuery(
    () =>
      conversation?.id
        ? db.messages
            .where({ conversationId: conversation.id })
            .sortBy('createdAt')
        : [],
    [conversation?.id],
    [],
  );

  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const styles = useLiveQuery(() => db.writingStyles.toArray(), [], []);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const settings = useLiveQuery(() => getSettings(), [], null);

  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoints || !settings) return;
    const ep =
      endpoints.find((e) => e.id === settings.defaultEndpointId) ??
      endpoints[0];
    if (!ep) return;
    setEndpointId(ep.id);
    const m =
      settings.defaultModel && ep.chatModels.includes(settings.defaultModel)
        ? settings.defaultModel
        : ep.chatModels[0] ?? null;
    setModel(m);
    setPersonaId(conversation?.personaId ?? settings.defaultPersonaId);
    setStyleId(conversation?.styleId ?? settings.defaultStyleId);
  }, [endpoints, settings, conversation]);

  function selectedPersona() {
    if (!personaId) return undefined;
    return personas?.find((p) => p.id === personaId);
  }
  function selectedStyle() {
    if (!styleId) return undefined;
    return styles?.find((s) => s.id === styleId);
  }
  function selectedEndpoint() {
    return endpoints?.find((e) => e.id === endpointId);
  }
  function groupOthers(): Persona[] | undefined {
    const ids = conversation?.personaIds ?? [];
    if (ids.length < 2 || !personas) return undefined;
    return personas.filter((p) => ids.includes(p.id) && p.id !== personaId);
  }

  // Streaming UI state
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const [branch, setBranch] = useState<Message[]>([]);
  useEffect(() => {
    if (!conversation || !allMessages) {
      setBranch([]);
      return;
    }
    getActiveBranch(conversation).then(setBranch);
  }, [conversation, allMessages]);

  // Track reading position via scroll
  const readerRef = useRef<HTMLDivElement>(null);
  const [scrollFraction, setScrollFraction] = useState(0);
  function handleScroll() {
    const el = readerRef.current;
    if (!el || !book) return;
    const max = el.scrollHeight - el.clientHeight;
    const frac = max > 0 ? el.scrollTop / max : 0;
    setScrollFraction(frac);
    const pos = Math.floor(frac * book.totalChars);
    void updateReadingPosition(book.id, pos);
  }

  /** Scroll to a specific character offset in book.content. */
  function jumpToPosition(pos: number) {
    const el = readerRef.current;
    if (!el || !book || book.totalChars <= 0) return;
    const frac = Math.max(0, Math.min(1, pos / book.totalChars));
    el.scrollTop = frac * (el.scrollHeight - el.clientHeight);
  }

  // Bookmark / TOC drawer
  const [tocOpen, setTocOpen] = useState(false);

  // Selection-driven comment popover
  const [selection, setSelection] = useState<{
    text: string;
    position: number;
  } | null>(null);
  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const text = sel.toString().trim();
    if (!text || !book) {
      setSelection(null);
      return;
    }
    // Resolve approximate position via current scroll center.
    const el = readerRef.current;
    if (!el) return;
    const fraction = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;
    const position = Math.floor(fraction * book.totalChars);
    setSelection({ text, position });
  }

  const [composer, setComposer] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  function openComposerWithSelection() {
    if (!selection) return;
    setComposerOpen(true);
    // Pre-fill with a quote of the selection
    setComposer((prev) => prev || '');
  }
  function openComposerFresh() {
    setComposerOpen(true);
  }

  async function handleSend() {
    if (!conversation || !endpointId || !model || !book) return;
    const text = composer.trim();
    if (!text) return;
    const ep = selectedEndpoint();
    if (!ep) return;

    const position = selection
      ? selection.position
      : Math.floor(scrollFraction * book.totalChars);
    const excerpt = extractExcerpt(book.content, position);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');

    await sendMessage({
      conversation,
      endpoint: ep,
      model,
      userText: text,
      persona: selectedPersona(),
      style: selectedStyle(),
      groupOthers: groupOthers(),
      bookAnchor: {
        position,
        selection: selection?.text,
        excerpt,
      },
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
      onThinking: (_delta, assistantId) => {
        setStreamingId(assistantId);
      },
    });

    await saveSettings({
      defaultEndpointId: ep.id,
      defaultModel: model,
      defaultPersonaId: personaId,
      defaultStyleId: styleId,
    });

    setComposer('');
    setSelection(null);
    setStreamingId(null);
    setStreamingText('');
    abortRef.current = null;
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  async function handleLetSpeak(speaker: Persona) {
    if (!conversation || !endpointId || !model) return;
    const ep = selectedEndpoint();
    if (!ep) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingText('');
    const others = (personas ?? []).filter(
      (p) =>
        (conversation.personaIds ?? []).includes(p.id) && p.id !== speaker.id,
    );
    await letPersonaSpeak({
      conversation,
      endpoint: ep,
      model,
      persona: speaker,
      style: selectedStyle(),
      groupOthers: others.length > 0 ? others : undefined,
      signal: controller.signal,
      onDelta: (delta, assistantId) => {
        setStreamingId(assistantId);
        setStreamingText((prev) => prev + delta);
      },
      onThinking: (_delta, assistantId) => {
        setStreamingId(assistantId);
      },
    });
    setStreamingId(null);
    setStreamingText('');
    abortRef.current = null;
  }

  // Restore last reading position once book + reader mount
  const restoredRef = useRef(false);
  useEffect(() => {
    const el = readerRef.current;
    if (!el || !book || restoredRef.current) return;
    if (book.lastPosition && book.totalChars > 0) {
      const frac = book.lastPosition / book.totalChars;
      el.scrollTop = frac * (el.scrollHeight - el.clientHeight);
      restoredRef.current = true;
    }
  }, [book?.id, book?.lastPosition, book?.totalChars]);

  const busy = streamingId !== null;

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center text-ink-500">
        加载中喵……
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-2 border-b border-lavender-100/70 bg-white/40 px-3 py-2 pl-14 backdrop-blur-md md:px-6 md:pl-6">
        <Link
          to="/books"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          书架
        </Link>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-base font-normal tracking-wide text-ink-900"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {book.title}
          </h2>
          <div className="truncate text-[11px] font-light text-ink-500">
            {book.author ?? '佚名'} · {Math.round(scrollFraction * 100)}% ·
            {' '}
            {selection ? `已选 ${selection.text.length} 字` : '滚动阅读'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTocOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#B66B82] transition hover:bg-[#F8E8EE]"
          title="目录 / 书签"
          aria-label="目录 / 书签"
        >
          <ListTree size={16} />
        </button>
        <button
          type="button"
          onClick={() => navigate(`/chat/${conversation?.id ?? ''}`)}
          disabled={!conversation}
          className="rounded-full bg-lavender-200/60 px-3 py-1.5 text-xs text-lavender-600 ring-1 ring-lavender-300/40 transition hover:bg-lavender-300/70 disabled:opacity-50"
          title="进入这本书的对话"
        >
          完整对话
        </button>
      </header>

      {/* Picker row, compact */}
      <div className="flex flex-wrap items-center gap-2 border-b border-lavender-100/60 bg-white/30 px-3 py-1.5 text-xs md:px-6">
        <PersonaPicker
          personaId={personaId}
          onChange={setPersonaId}
          groupPersonaIds={conversation?.personaIds}
        />
        <StylePicker styleId={styleId} onChange={setStyleId} />
        <EndpointPicker
          endpointId={endpointId}
          model={model}
          onChange={(epId, m) => {
            setEndpointId(epId);
            setModel(m);
          }}
        />
      </div>

      {/* Reader */}
      <div
        ref={readerRef}
        onScroll={handleScroll}
        onMouseUp={captureSelection}
        onTouchEnd={captureSelection}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 md:px-10"
      >
        <article
          className="mx-auto max-w-2xl text-[16px] leading-[1.9]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {!book.content || !book.content.trim() ? (
            <div className="py-12 text-center text-sm text-ink-500">
              这本书的内容是空的喵——可能导入时只填了标题没填正文。回到书架重新导入一次吧。
            </div>
          ) : book.format === 'md' ? (
            <div className="prose-msg">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {book.content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-[inherit] text-[inherit] leading-[inherit]">
              {book.content}
            </pre>
          )}
        </article>
      </div>

      {/* Selection action bar */}
      {selection && !composerOpen && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex w-[min(92vw,28rem)] items-center justify-between gap-2 rounded-full border border-lavender-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
            「{selection.text}」
          </span>
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="rounded-full p-1 text-ink-500 hover:bg-lavender-50"
            aria-label="取消"
          >
            <X size={13} />
          </button>
          <button
            type="button"
            onClick={openComposerWithSelection}
            className="flex items-center gap-1 rounded-full bg-lavender-200/70 px-3 py-1 text-xs font-medium text-lavender-600 ring-1 ring-lavender-300/50 transition hover:bg-lavender-300/80 hover:text-ink-900"
          >
            <MessageSquarePlus size={13} />
            吐槽
          </button>
        </div>
      )}

      {/* Floating recent reply chip(s) */}
      {streamingId && streamingText && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-20 mx-auto w-[min(92vw,40rem)] px-3">
          <div className="rounded-2xl border border-lavender-100 bg-white/85 px-3 py-2 text-sm text-ink-700 shadow-lg backdrop-blur-md">
            <div className="line-clamp-4">{streamingText}</div>
          </div>
        </div>
      )}

      {/* Bottom composer */}
      {composerOpen ? (
        <ComposerBar
          value={composer}
          onChange={setComposer}
          onSend={handleSend}
          onCancel={() => {
            setComposerOpen(false);
            setSelection(null);
            setComposer('');
          }}
          onAbort={handleAbort}
          busy={busy}
          selection={selection?.text}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 border-t border-lavender-100 bg-white/55 px-3 py-2 backdrop-blur-md md:px-6">
          <button
            type="button"
            onClick={openComposerFresh}
            className="flex items-center gap-1.5 rounded-full bg-lavender-200/70 px-4 py-2 text-sm font-normal text-lavender-600 ring-1 ring-lavender-300/50 transition hover:bg-lavender-300/80 hover:text-ink-900"
          >
            <MessageSquarePlus size={14} />
            吐槽一句
          </button>
          {branch.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/chat/${conversation?.id ?? ''}`)}
              className="text-xs text-ink-500 hover:text-ink-700"
            >
              已有 {branch.filter((m) => m.role !== 'system').length} 条对话 →
            </button>
          )}
          {/* Inline group chatter trigger */}
          {(conversation?.personaIds ?? []).length >= 2 &&
            personas &&
            branch.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {personas
                  .filter((p) =>
                    (conversation?.personaIds ?? []).includes(p.id),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleLetSpeak(p)}
                      className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-xs shadow-sm ring-1 ring-lavender-100 transition hover:bg-white disabled:opacity-40"
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
      )}

      {tocOpen && book && (
        <BookmarkTocPanel
          book={book}
          currentPosition={Math.floor(scrollFraction * book.totalChars)}
          currentSnippet={book.content.slice(
            Math.floor(scrollFraction * book.totalChars),
            Math.floor(scrollFraction * book.totalChars) + 80,
          )}
          onClose={() => setTocOpen(false)}
          onJump={jumpToPosition}
        />
      )}
    </div>
  );
}

/** Resolve (lazily create) the book's chat conversation. Lives in a
 *  plain useEffect because getBookConversation does DB writes on first
 *  call — useLiveQuery's querier runs inside a read-only transaction
 *  and would throw ReadOnlyError on the write. */
function useBookConversation(
  book: ReturnType<typeof useLiveQuery<unknown>> & unknown,
): Conversation | undefined {
  const [conv, setConv] = useState<Conversation | undefined>(undefined);
  const b = book as { id?: string; conversationId?: string } | undefined;
  useEffect(() => {
    if (!b) {
      setConv(undefined);
      return;
    }
    let cancelled = false;
    getBookConversation(b as unknown as Parameters<typeof getBookConversation>[0])
      .then((c) => {
        if (!cancelled) setConv(c);
      })
      .catch((e) => {
        console.error('[read] getBookConversation failed:', e);
      });
    return () => {
      cancelled = true;
    };
  }, [b?.id, b?.conversationId]);
  return conv;
}

interface ComposerBarProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onAbort: () => void;
  busy: boolean;
  selection?: string;
}

function ComposerBar({
  value,
  onChange,
  onSend,
  onCancel,
  onAbort,
  busy,
  selection,
}: ComposerBarProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

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
      onSend();
    }
  }

  return (
    <div className="border-t border-lavender-100 bg-white/65 px-3 py-3 backdrop-blur-md md:px-6">
      {selection && (
        <div className="mb-2 max-h-20 overflow-y-auto rounded-lg border-l-2 border-lavender-300 bg-lavender-50/60 px-2 py-1 text-xs italic text-ink-700">
          「{selection}」
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 text-ink-500 transition hover:bg-lavender-50"
          aria-label="收起"
        >
          <X size={14} />
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="对刚才那段的吐槽 / 评论 / 提问……"
          className="min-h-[40px] flex-1 resize-none rounded-2xl border border-lavender-100 bg-white px-3 py-2 text-[15px] text-ink-900 placeholder:text-ink-500/60 focus:border-lavender-300"
        />
        {busy ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-500 ring-1 ring-rose-200"
            aria-label="停止"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-lavender-200/70 text-lavender-600 ring-1 ring-lavender-300/50 transition hover:bg-lavender-300/80 hover:text-ink-900 disabled:opacity-50"
            aria-label="发送"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

