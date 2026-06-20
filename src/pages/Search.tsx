import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Search as SearchIcon, X } from 'lucide-react';
import { db } from '../db';
import { relativeTime } from '../lib/format';
import type { Conversation, Message, Persona } from '../types';

/**
 * 全对话搜索. 简单 substring (case-insensitive) 命中 messages.content,
 * 按 conversation 分组, 每条会话只露前 3 条匹配片段. 点会话条进去
 * /chat/:id. 没有索引 — 走 db.messages.filter() 全表扫, 几万条以内
 * 都 < 100ms 体感无延迟; 真上百万再考虑给 content 加 prefix index
 * 或 fts 库.
 */

const PER_CONVERSATION_LIMIT = 3;
const TOTAL_CONVERSATIONS_LIMIT = 50;
const SNIPPET_RADIUS = 40; // 匹配前后各保留多少字
const DEBOUNCE_MS = 250;

interface ConversationHits {
  conversation: Conversation;
  persona?: Persona;
  hits: Message[];
  totalHits: number;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ConversationHits[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const personas = useLiveQuery(() => db.personas.toArray(), [], []);
  const personaById = useMemo(
    () => new Map((personas ?? []).map((p) => [p.id, p])),
    [personas],
  );

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const needle = debounced.toLowerCase();
    (async () => {
      // 全表 filter — 没有 content 索引, IndexedDB 也不支持子串. 内存
      // 里 lowercase + includes 是最简单也最稳的路子。
      const matches = await db.messages
        .filter((m) => (m.content ?? '').toLowerCase().includes(needle))
        .toArray();
      if (cancelled) return;
      // group by conversation, sort hits newest first
      const byConv = new Map<string, Message[]>();
      for (const m of matches) {
        const arr = byConv.get(m.conversationId) ?? [];
        arr.push(m);
        byConv.set(m.conversationId, arr);
      }
      // load conversations for the matched ids
      const convs = await db.conversations.bulkGet(Array.from(byConv.keys()));
      const out: ConversationHits[] = [];
      for (const conv of convs) {
        if (!conv) continue;
        const hits = (byConv.get(conv.id) ?? []).sort(
          (a, b) => b.createdAt - a.createdAt,
        );
        out.push({
          conversation: conv,
          persona: conv.personaId
            ? personaById.get(conv.personaId) ?? undefined
            : undefined,
          hits: hits.slice(0, PER_CONVERSATION_LIMIT),
          totalHits: hits.length,
        });
      }
      // sort conversations by most recent hit time
      out.sort((a, b) => {
        const ta = a.hits[0]?.createdAt ?? 0;
        const tb = b.hits[0]?.createdAt ?? 0;
        return tb - ta;
      });
      if (cancelled) return;
      setResults(out.slice(0, TOTAL_CONVERSATIONS_LIMIT));
      setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, personaById]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--page, #fbf9fd)',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
      }}
    >
      <header
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 12px',
          flexShrink: 0,
        }}
      >
        <Link
          to="/home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'rgba(120,100,150,0.7)',
            fontSize: 13,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
            textDecoration: 'none',
          }}
        >
          <ChevronLeft size={16} /> 玄関
        </Link>
        <div
          style={{
            flex: 1,
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 18,
            color: 'var(--head, #4a3550)',
            letterSpacing: 1,
            textAlign: 'center',
          }}
        >
          搜索
        </div>
        <div style={{ width: 48 }} />
      </header>

      <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(157,110,189,0.1)',
            borderRadius: 14,
          }}
        >
          <SearchIcon size={16} color="rgba(120,100,150,0.6)" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜历史聊天里的关键词…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: '#3a2840',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(120,100,150,0.5)',
                padding: 0,
                display: 'flex',
              }}
              aria-label="清除"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {debounced && (
          <div
            style={{
              fontSize: 11,
              color: 'rgba(120,100,150,0.5)',
              marginTop: 6,
              paddingLeft: 4,
            }}
          >
            {searching
              ? '搜索中…'
              : results.length === 0
                ? '没找到匹配'
                : `${results.length} 段会话有匹配`}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 16px 24px',
        }}
      >
        {!debounced && (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              color: 'rgba(120,100,150,0.4)',
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            输关键词搜历史聊天.
            <br />
            匹配的会话按最近时间排, 每段最多露 3 条片段.
          </div>
        )}
        {results.map((r) => (
          <ConversationResult
            key={r.conversation.id}
            data={r}
            needle={debounced}
            onClick={() => navigate(`/chat/${r.conversation.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationResult({
  data,
  needle,
  onClick,
}: {
  data: ConversationHits;
  needle: string;
  onClick: () => void;
}) {
  const { conversation, persona, hits, totalHits } = data;
  const personaColor = persona?.color ?? '#a090a8';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(157,110,189,0.06)',
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: personaColor,
            opacity: 0.8,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            color: '#4a3550',
            fontWeight: 500,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {conversation.title}
        </span>
        {persona && (
          <span style={{ fontSize: 11, color: '#a090a8' }}>{persona.name}</span>
        )}
        {totalHits > hits.length && (
          <span
            style={{
              fontSize: 10,
              color: '#b0a0b8',
              background: 'rgba(176,138,204,0.1)',
              padding: '1px 6px',
              borderRadius: 6,
            }}
          >
            还有 {totalHits - hits.length}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hits.map((m) => (
          <HitLine key={m.id} message={m} needle={needle} />
        ))}
      </div>
    </button>
  );
}

function HitLine({ message, needle }: { message: Message; needle: string }) {
  const role = message.role === 'user' ? '你' : 'AI';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        fontSize: 12,
        lineHeight: 1.55,
        color: '#5a4060',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          color: message.role === 'user' ? '#7a5a88' : '#a090a8',
          width: 14,
          marginTop: 1,
        }}
      >
        {role}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {renderSnippet(message.content ?? '', needle)}
        <span
          style={{
            marginLeft: 6,
            fontSize: 10,
            color: '#b0a0b8',
            whiteSpace: 'nowrap',
          }}
        >
          {relativeTime(message.createdAt)}
        </span>
      </span>
    </div>
  );
}

/** 提取匹配位置周围 ±SNIPPET_RADIUS 字符, 命中处包 mark 样式. */
function renderSnippet(content: string, needle: string) {
  if (!needle) return content.slice(0, 80);
  const lower = content.toLowerCase();
  const n = needle.toLowerCase();
  const idx = lower.indexOf(n);
  if (idx < 0) return content.slice(0, 80);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(content.length, idx + n.length + SNIPPET_RADIUS);
  const before = (start > 0 ? '…' : '') + content.slice(start, idx);
  const match = content.slice(idx, idx + n.length);
  const after = content.slice(idx + n.length, end) + (end < content.length ? '…' : '');
  return (
    <>
      {before}
      <mark
        style={{
          background: 'rgba(176,138,204,0.35)',
          color: '#3a2840',
          padding: '0 2px',
          borderRadius: 3,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  );
}
