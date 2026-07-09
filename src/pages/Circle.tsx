import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Heart, Image as ImageIcon, MessageCircle, Plus, Send, X } from 'lucide-react';
import { db } from '../db';
import { newId } from '../lib/id';
import { relativeTime } from '../lib/format';
import {
  scheduleCircleComments,
  scheduleReplyAfterUser,
} from '../lib/circle-comments';
import {
  USER_REACTION_PERSONA_ID,
  type CirclePost,
  type CircleReaction,
  type Persona,
} from '../types';

/**
 * OnlyCircle — 私人朋友圈. 单列时间线, 只有用户和她的两个 AI 恋人看
 * 得到. 数据全在本地 Dexie, 不上服务器.
 *
 * 发动态: 右上 + → 上滑半屏 → 文字 / 图片 → 发送
 *
 * 发完自动触发两个 persona 各自调一次 API 写评论 (见 circle-comments.ts),
 * 随机 3–15s 延迟模拟真人刷到动态的反应时间.
 *
 * 心跳点: 每条动态时间戳旁有一个 4px 圆点, 皮肤主色 + scale 1→1.3→1
 * 2s 脉冲, 暗示这条动态是"活的", 有人在看.
 */

const MAX_IMAGES_PER_POST = 9;

export default function CirclePage() {
  const posts = useLiveQuery(
    () => db.circlePosts.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );
  const reactions = useLiveQuery(
    () => db.circleReactions.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const personas = useLiveQuery(() => db.personas.toArray(), [], []);

  const [composeOpen, setComposeOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 发完动态自动滚顶
  function scrollToTop() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
    });
  }

  async function handlePublish(text: string, images: string[]) {
    const post: CirclePost = {
      id: newId(),
      text,
      images,
      createdAt: Date.now(),
    };
    await db.circlePosts.add(post);
    setComposeOpen(false);
    scrollToTop();
    // 不 await — 评论调度走自己的随机延迟
    void scheduleCircleComments(post);
  }

  return (
    <div
      ref={scrollRef}
      className="circle-page"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--page)',
        fontFamily: "-apple-system,'Noto Sans SC','PingFang SC',sans-serif",
      }}
    >
      <style>{circleStyles}</style>

      <header className="circle-topbar">
        <Link to="/home" className="circle-back" aria-label="返回">
          <ChevronLeft size={16} />
          <span>玄関</span>
        </Link>
        <h1 className="circle-title">OnlyCircle</h1>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="circle-fab-inline"
          aria-label="发动态"
        >
          <Plus size={16} />
        </button>
      </header>

      <main className="circle-feed">
        {posts && posts.length === 0 && (
          <div className="circle-empty">
            <p>还没有动态</p>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="circle-empty-cta"
            >
              <Plus size={14} /> 发第一条
            </button>
          </div>
        )}
        {posts &&
          renderTimeline(posts, reactions ?? [], personas ?? [], setLightboxSrc)}
      </main>

      {composeOpen && (
        <ComposeSheet
          onClose={() => setComposeOpen(false)}
          onSubmit={handlePublish}
        />
      )}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

/** 按日期分组渲染时间线: 每天一个分隔条, 然后底下若干 PostCard. */
function renderTimeline(
  posts: CirclePost[],
  reactions: CircleReaction[],
  personas: Persona[],
  onOpenImage: (src: string) => void,
) {
  const reactionsByPost = new Map<string, CircleReaction[]>();
  for (const r of reactions) {
    const arr = reactionsByPost.get(r.postId) ?? [];
    arr.push(r);
    reactionsByPost.set(r.postId, arr);
  }
  const personaById = new Map(personas.map((p) => [p.id, p]));

  const nodes: React.ReactNode[] = [];
  let lastDay = '';
  posts.forEach((p, i) => {
    const dayLabel = formatDayLabel(p.createdAt);
    if (dayLabel !== lastDay) {
      nodes.push(<DateSep key={`d-${dayLabel}`} label={dayLabel} />);
      lastDay = dayLabel;
    }
    nodes.push(
      <PostCard
        key={p.id}
        post={p}
        reactions={reactionsByPost.get(p.id) ?? []}
        personaById={personaById}
        onOpenImage={onOpenImage}
        delayMs={Math.min(i * 50, 400)}
      />,
    );
  });
  return nodes;
}

function DateSep({ label }: { label: string }) {
  return (
    <div className="circle-date">
      <span className="circle-date-line" />
      <span className="circle-date-text">{label}</span>
      <span className="circle-date-line" />
    </div>
  );
}

function PostCard({
  post,
  reactions,
  personaById,
  onOpenImage,
  delayMs,
}: {
  post: CirclePost;
  reactions: CircleReaction[];
  personaById: Map<string, Persona>;
  onOpenImage: (src: string) => void;
  delayMs: number;
}) {
  // replyTarget: undefined = 关闭, null = 给 post 顶层留言, string = 给
  // 那条 reaction 回复 (thread).
  const [replyTarget, setReplyTarget] = useState<string | null | undefined>(
    undefined,
  );

  async function toggleLike() {
    await db.circlePosts.update(post.id, { userLiked: !post.userLiked });
  }

  async function submitReply(text: string) {
    const t = text.trim();
    if (!t) return;
    const reactionId = newId();
    const row: CircleReaction = {
      id: reactionId,
      postId: post.id,
      personaId: USER_REACTION_PERSONA_ID,
      kind: 'comment',
      text: t,
      status: 'done',
      parentReactionId: typeof replyTarget === 'string' ? replyTarget : undefined,
      createdAt: Date.now(),
    };
    await db.circleReactions.add(row);
    // 给某条 AI 评论 reply → 触发同一 persona 接着说一句
    if (typeof replyTarget === 'string') {
      const parent = await db.circleReactions.get(replyTarget);
      if (parent) {
        const persona = personaById.get(parent.personaId);
        if (persona) void scheduleReplyAfterUser(post, replyTarget, persona);
      }
    }
    setReplyTarget(undefined);
  }

  // 拆 thread: 顶层 reaction (parentReactionId 空) 在外, 它们的回复
  // 缩进显示在下面.
  const topLevel = reactions.filter((r) => !r.parentReactionId);
  const repliesByParent = new Map<string, CircleReaction[]>();
  for (const r of reactions) {
    if (!r.parentReactionId) continue;
    const arr = repliesByParent.get(r.parentReactionId) ?? [];
    arr.push(r);
    repliesByParent.set(r.parentReactionId, arr);
  }

  return (
    <article
      className="circle-card"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {post.text && <div className="circle-card-text">{post.text}</div>}
      {post.images.length > 0 && (
        <div
          className={`circle-card-imgs ${
            post.images.length === 1 ? 'one' : post.images.length === 4 ? 'four' : ''
          }`}
        >
          {post.images.map((src, i) => (
            <button
              key={i}
              type="button"
              className="circle-card-img"
              onClick={() => onOpenImage(src)}
              aria-label="放大图片"
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <footer className="circle-card-foot">
        <span className="circle-card-meta">
          <span className="circle-heartbeat" />
          {relativeTime(post.createdAt)}
        </span>
        <span className="circle-card-acts">
          <button
            type="button"
            className={`circle-card-act ${post.userLiked ? 'is-liked' : ''}`}
            onClick={() => void toggleLike()}
            aria-label={post.userLiked ? '取消喜欢' : '喜欢'}
          >
            <Heart
              size={14}
              fill={post.userLiked ? 'currentColor' : 'none'}
              strokeWidth={1.8}
            />
          </button>
          <button
            type="button"
            className="circle-card-act"
            onClick={() => setReplyTarget(replyTarget === null ? undefined : null)}
            aria-label="留言"
          >
            <MessageCircle size={14} />
          </button>
        </span>
      </footer>
      {(topLevel.length > 0 || repliesByParent.size > 0) && (
        <div className="circle-comments">
          {topLevel.map((r) => (
            <ReactionLine
              key={r.id}
              reaction={r}
              persona={personaById.get(r.personaId)}
              replies={repliesByParent.get(r.id) ?? []}
              personaById={personaById}
              onReply={() =>
                setReplyTarget(replyTarget === r.id ? undefined : r.id)
              }
              replyOpen={replyTarget === r.id}
              onSubmitReply={submitReply}
              onCancelReply={() => setReplyTarget(undefined)}
            />
          ))}
        </div>
      )}
      {replyTarget === null && (
        <ReplyComposer
          placeholder="写点回应…"
          onCancel={() => setReplyTarget(undefined)}
          onSubmit={submitReply}
        />
      )}
    </article>
  );
}

function ReactionLine({
  reaction,
  persona,
  replies,
  personaById,
  onReply,
  replyOpen,
  onSubmitReply,
  onCancelReply,
}: {
  reaction: CircleReaction;
  persona: Persona | undefined;
  replies: CircleReaction[];
  personaById: Map<string, Persona>;
  onReply: () => void;
  replyOpen: boolean;
  onSubmitReply: (text: string) => Promise<void> | void;
  onCancelReply: () => void;
}) {
  const isUser = reaction.personaId === USER_REACTION_PERSONA_ID;
  const color = isUser ? '#7a5a88' : persona?.color ?? '#a090a8';
  const name = isUser ? '你' : persona?.name ?? '?';
  return (
    <div className="circle-comment-thread">
      <div className="circle-comment">
        <span
          className="circle-comment-dot"
          style={{ background: color }}
          title={name}
        />
        <span className="circle-comment-name" style={{ color }}>
          {name}
        </span>
        <span className="circle-comment-text">
          {reaction.status === 'pending' && (
            <span className="circle-comment-pending">正在想…</span>
          )}
          {reaction.status === 'done' && reaction.text}
          {reaction.status === 'error' && (
            <span className="circle-comment-error">
              没说出来 ({reaction.errorMessage ?? '未知错误'})
            </span>
          )}
        </span>
        {/* 只给 AI 评论挂回复按钮 — 用户自己写的不再 reply 自己 */}
        {!isUser && reaction.status === 'done' && (
          <button
            type="button"
            onClick={onReply}
            className="circle-comment-reply-btn"
            aria-label="回复"
          >
            回复
          </button>
        )}
      </div>
      {/* 嵌套的 thread 回复 */}
      {(replies.length > 0 || replyOpen) && (
        <div className="circle-comment-replies">
          {replies
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((r) => {
              const rIsUser = r.personaId === USER_REACTION_PERSONA_ID;
              const rColor = rIsUser
                ? '#7a5a88'
                : personaById.get(r.personaId)?.color ?? '#a090a8';
              const rName = rIsUser
                ? '你'
                : personaById.get(r.personaId)?.name ?? '?';
              return (
                <div key={r.id} className="circle-comment">
                  <span
                    className="circle-comment-dot"
                    style={{ background: rColor }}
                  />
                  <span
                    className="circle-comment-name"
                    style={{ color: rColor }}
                  >
                    {rName}
                  </span>
                  <span className="circle-comment-text">
                    {r.status === 'pending' && (
                      <span className="circle-comment-pending">正在想…</span>
                    )}
                    {r.status === 'done' && r.text}
                    {r.status === 'error' && (
                      <span className="circle-comment-error">
                        没说出来 ({r.errorMessage ?? '未知错误'})
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          {replyOpen && (
            <ReplyComposer
              placeholder={`回复 ${name}…`}
              onCancel={onCancelReply}
              onSubmit={onSubmitReply}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Inline reply 小输入框. 给 post 顶层留言或给某条 AI 评论的 thread
 *  reply 共用 — 视觉一样, 行为差别在父组件传的 onSubmit 里. */
function ReplyComposer({
  placeholder,
  onCancel,
  onSubmit,
}: {
  placeholder: string;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="circle-reply-composer">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={placeholder}
        rows={2}
        className="circle-reply-input"
      />
      <div className="circle-reply-bar">
        <button type="button" onClick={onCancel} className="circle-reply-cancel">
          取消
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || busy}
          className="circle-reply-send"
        >
          {busy ? '…' : '发送'}
        </button>
      </div>
    </div>
  );
}

function ComposeSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (text: string, images: string[]) => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ESC 关
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 让同一文件再选能触发 change
    if (files.length === 0) return;
    const remaining = MAX_IMAGES_PER_POST - images.length;
    const slice = files.slice(0, remaining);
    const dataUrls = await Promise.all(slice.map(fileToDataUrl));
    setImages((prev) => [...prev, ...dataUrls]);
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  const canSend = !busy && (text.trim().length > 0 || images.length > 0);

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      await onSubmit(text.trim(), images);
      setText('');
      setImages([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="circle-compose-mask"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="circle-compose"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="发动态"
      >
        <div className="circle-compose-grip" />
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写点什么…"
          rows={4}
          className="circle-compose-input"
        />
        {images.length > 0 && (
          <div className="circle-compose-thumbs">
            {images.map((src, i) => (
              <div key={i} className="circle-compose-thumb">
                <img src={src} alt="" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="circle-compose-thumb-x"
                  aria-label="移除"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="circle-compose-bar">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={images.length >= MAX_IMAGES_PER_POST}
            className="circle-compose-img-btn"
            aria-label="加图"
          >
            <ImageIcon size={16} />
            {images.length > 0 && (
              <span className="circle-compose-img-count">
                {images.length}/{MAX_IMAGES_PER_POST}
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickFiles}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="circle-compose-send"
            aria-label="发送"
          >
            <Send size={14} />
            {busy ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="circle-lightbox" onClick={onClose} role="presentation">
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      <button
        type="button"
        onClick={onClose}
        className="circle-lightbox-close"
        aria-label="关闭"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDayLabel(ts: number): string {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${m}月${day}日 周${wk}`;
}

/* ─── styles ───────────────────────────────────────────────────────── */

const circleStyles = `
.circle-page { position: relative; }
.circle-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 14px 16px 12px;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  background: linear-gradient(180deg, var(--page) 70%, transparent 100%);
  backdrop-filter: blur(8px);
}
.circle-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3, rgba(120,100,150,0.7));
  font-size: 13px;
  font-family: 'Crimson Pro','Noto Serif SC',serif;
  font-style: italic;
  text-decoration: none;
}
.circle-title {
  justify-self: center;
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 300;
  font-size: 24px;
  letter-spacing: 1px;
  color: var(--head, #4a3550);
}
.circle-fab-inline {
  justify-self: end;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--accent, #b08acc);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(157,110,189,0.25);
}
.circle-fab-inline:hover { filter: brightness(1.06); }

.circle-feed {
  max-width: 480px;
  margin: 0 auto;
  padding: 8px 16px 80px;
  display: flex;
  flex-direction: column;
}

.circle-empty {
  margin-top: 80px;
  text-align: center;
  color: var(--text-3, #b0a0b8);
  font-size: 13px;
}
.circle-empty p {
  margin: 0 0 16px;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 18px;
}
.circle-empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent, #b08acc);
  color: #fff;
  border: none;
  border-radius: 18px;
  font-size: 13px;
  cursor: pointer;
}

.circle-date {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 8px;
  font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 300;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-3, rgba(120,100,150,0.5));
}
.circle-date-line {
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.15;
}

@keyframes circle-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.circle-card {
  margin: 0 0 16px;
  padding: 20px;
  border-radius: 16px;
  background: rgba(255,255,255,0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(157,110,189,0.06);
  opacity: 0;
  animation: circle-card-in 300ms ease-out forwards;
}
.circle-card-text {
  font-family: 'Noto Sans SC', sans-serif;
  font-weight: 400;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-1, #3a2840);
  white-space: pre-wrap;
  word-break: break-word;
}

.circle-card-imgs {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.circle-card-imgs.one { grid-template-columns: 1fr; }
.circle-card-imgs.four { grid-template-columns: repeat(2, 1fr); }
.circle-card-img {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  display: block;
}
.circle-card-imgs.one .circle-card-img { aspect-ratio: auto; max-height: 360px; }
.circle-card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.circle-card-imgs.one .circle-card-img img {
  width: 100%;
  height: auto;
  max-height: 360px;
  object-fit: contain;
  background: rgba(0,0,0,0.02);
}

.circle-card-foot {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-weight: 300;
  font-size: 12px;
  color: var(--text-3, rgba(120,100,150,0.55));
}
.circle-card-meta { display: inline-flex; align-items: center; gap: 6px; }
.circle-card-acts { display: inline-flex; gap: 12px; }
.circle-card-act {
  background: none;
  border: 0;
  color: inherit;
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
}
.circle-card-act[disabled] { opacity: 0.5; cursor: default; }

@keyframes circle-heartbeat {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}
.circle-heartbeat {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent, #b08acc);
  animation: circle-heartbeat 2s ease-in-out infinite;
}

.circle-comments {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(157,110,189,0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.circle-comment {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.circle-comment-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  align-self: center;
}
.circle-comment-name {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}
.circle-comment-text {
  flex: 1;
  color: var(--text-2, #5a4060);
  word-break: break-word;
}
.circle-comment-pending { opacity: 0.55; font-style: italic; }
.circle-comment-error { color: #c45858; font-size: 12px; }

/* thread 嵌套: reply 缩进 + 左侧细竖线 */
.circle-comment-thread { display: flex; flex-direction: column; gap: 8px; }
.circle-comment-replies {
  margin-left: 14px;
  padding-left: 10px;
  border-left: 1.5px solid rgba(157,110,189,0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 评论行末尾的「回复」按钮: 默认半透明, hover 提亮 */
.circle-comment-reply-btn {
  background: none;
  border: 0;
  cursor: pointer;
  color: rgba(120,100,150,0.5);
  font-size: 11px;
  padding: 0 4px;
  flex-shrink: 0;
}
.circle-comment-reply-btn:hover { color: rgba(120,100,150,0.9); }

/* heart 高亮态 — 用户已点 */
.circle-card-act.is-liked { color: #b08acc; }

/* inline reply composer */
.circle-reply-composer {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.circle-reply-input {
  width: 100%;
  resize: none;
  border: 1px solid rgba(157,110,189,0.12);
  background: rgba(245,238,248,0.4);
  border-radius: 10px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-1, #3a2840);
  outline: none;
}
.circle-reply-input:focus { border-color: rgba(157,110,189,0.3); }
.circle-reply-bar {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.circle-reply-cancel {
  background: none;
  border: 0;
  padding: 4px 10px;
  font-size: 11px;
  color: rgba(120,100,150,0.6);
  cursor: pointer;
  font-family: inherit;
}
.circle-reply-send {
  background: rgba(176,138,204,0.85);
  color: #fff;
  border: 0;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.circle-reply-send:disabled { opacity: 0.4; cursor: not-allowed; }

/* compose sheet */
.circle-compose-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(40,30,55,0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: circle-fade-in 200ms ease-out;
}
@keyframes circle-fade-in { from { opacity: 0; } to { opacity: 1; } }
.circle-compose {
  width: 100%;
  max-width: 600px;
  background: var(--page, #fbf9fd);
  border-radius: 18px 18px 0 0;
  padding: 14px 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 -8px 32px rgba(40,30,55,0.18);
  animation: circle-slide-up 250ms ease-out;
}
@keyframes circle-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.circle-compose-grip {
  width: 36px;
  height: 4px;
  margin: 0 auto;
  border-radius: 2px;
  background: rgba(157,110,189,0.2);
}
.circle-compose-input {
  width: 100%;
  border: none;
  outline: none;
  background: rgba(245,238,248,0.4);
  border-radius: 12px;
  padding: 12px 14px;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-1, #3a2840);
  resize: vertical;
  min-height: 90px;
}
.circle-compose-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 6px;
}
.circle-compose-thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
}
.circle-compose-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.circle-compose-thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.circle-compose-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.circle-compose-img-btn {
  background: none;
  border: 1px solid rgba(157,110,189,0.15);
  border-radius: 12px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2, #5a4060);
  cursor: pointer;
  font-size: 12px;
}
.circle-compose-img-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.circle-compose-img-count {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  opacity: 0.7;
}
.circle-compose-send {
  background: var(--accent, #b08acc);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 8px 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.circle-compose-send:disabled { opacity: 0.45; cursor: not-allowed; }

/* lightbox */
.circle-lightbox {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: circle-fade-in 200ms ease-out;
}
.circle-lightbox img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
.circle-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
`;
