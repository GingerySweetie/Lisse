import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../../db';
import { subscribeClawd, type ClawdBusEvent } from '../../lib/clawd/bus';
import {
  REACTION_MS,
  WAITING_MS,
  defaultAssistantReaction,
  isRirichan,
  moodFromCalendar,
  moodFromMessage,
  moodFromRoute,
} from '../../lib/clawd/mood';
import {
  CLAWD_EMOTE_META,
  getClawdSvg,
  type ClawdEmoteId,
} from './emotes';
import './clawd-pet.css';

const POS_KEY = 'lisse.clawd.pos';
const HIDDEN_KEY = 'lisse.clawd.hiddenUntil';
const HIDE_MS = 30 * 60_000;

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

/** Returns remaining hide ms, or 0 if not hidden / expired. Also clears stale key. */
function remainingHideMs(): number {
  try {
    const n = Number(localStorage.getItem(HIDDEN_KEY) ?? 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const left = n - Date.now();
    if (left <= 0) {
      localStorage.removeItem(HIDDEN_KEY);
      return 0;
    }
    return left;
  } catch {
    return 0;
  }
}

function clampPos(x: number, y: number, size: number): Pos {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - size - pad);
  const maxY = Math.max(pad, window.innerHeight - size - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

function labelFor(id: ClawdEmoteId): string {
  return CLAWD_EMOTE_META.find((m) => m.id === id)?.name ?? id;
}

function resolveBaseMood(pathname: string): ClawdEmoteId {
  const routeMood = moodFromRoute(pathname);
  const cal = moodFromCalendar();
  if (
    cal &&
    (pathname.startsWith('/home') ||
      pathname === '/' ||
      pathname.startsWith('/chat'))
  ) {
    return cal;
  }
  return routeMood;
}

/**
 * Floating Clawd desk pet — SVG+CSS emotes from clawd-emotes-skill.
 * Mood follows the current route, calendar season, and 理理酱 chat events.
 */
export default function ClawdPet() {
  const location = useLocation();
  const settings = useLiveQuery(() => getSettings(), [], null);
  const enabled = settings?.clawdPetEnabled ?? true;

  const [emote, setEmote] = useState<ClawdEmoteId>(() =>
    resolveBaseMood(location.pathname),
  );
  const [bubble, setBubble] = useState<string | null>(null);
  const [tuckedAway, setTuckedAway] = useState(() => remainingHideMs() > 0);
  const [pos, setPos] = useState<Pos>(() => {
    const saved = loadPos();
    if (saved) return saved;
    return {
      x: Math.max(12, window.innerWidth - 118),
      y: Math.max(12, window.innerHeight - 168),
    };
  });

  const baseRef = useRef<ClawdEmoteId>(resolveBaseMood(location.pathname));
  const reactionTimer = useRef<number | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep hide timer alive across mounts.
  useEffect(() => {
    const left = remainingHideMs();
    if (left <= 0) return;
    hideTimer.current = window.setTimeout(() => {
      setTuckedAway(false);
    }, left);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // Route → baseline mood.
  useEffect(() => {
    const pathMood = resolveBaseMood(location.pathname);
    baseRef.current = pathMood;
    if (reactionTimer.current) return;

    let cancelled = false;
    // Defer so we don't setState synchronously inside the effect body.
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setEmote((prev) => {
        if (prev === pathMood) return prev;
        setBubble(labelFor(pathMood));
        if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
        bubbleTimer.current = window.setTimeout(() => setBubble(null), 2200);
        return pathMood;
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [location.pathname]);

  // Chat / bedroom events
  useEffect(() => {
    function clearReaction() {
      if (reactionTimer.current) {
        window.clearTimeout(reactionTimer.current);
        reactionTimer.current = null;
      }
    }

    function announce(next: ClawdEmoteId) {
      setBubble(labelFor(next));
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => setBubble(null), 2200);
    }

    function apply(next: ClawdEmoteId, announceChange: boolean) {
      setEmote((prev) => {
        if (prev === next) return prev;
        if (announceChange) announce(next);
        return next;
      });
    }

    function react(next: ClawdEmoteId, holdMs: number) {
      clearReaction();
      apply(next, true);
      reactionTimer.current = window.setTimeout(() => {
        reactionTimer.current = null;
        apply(baseRef.current, false);
      }, holdMs);
    }

    function onEvent(event: ClawdBusEvent) {
      if (event.type === 'user-send') {
        react('listening', WAITING_MS);
        return;
      }
      if (event.type === 'stream-start') {
        react(isRirichan(event.personaId) ? 'listening' : 'coding', WAITING_MS);
        return;
      }
      if (event.type === 'stream-end' || event.type === 'assistant-text') {
        const fromMsg = moodFromMessage(event.text);
        const next =
          fromMsg ??
          (isRirichan(event.personaId)
            ? defaultAssistantReaction(event.personaId)
            : baseRef.current);
        react(next, REACTION_MS);
      }
    }

    return subscribeClawd(onEvent);
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((p) => clampPos(p.x, p.y, 104));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!enabled || tuckedAway) return null;
  if (location.pathname.startsWith('/read/')) return null;

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      ox: e.clientX - pos.x,
      oy: e.clientY - pos.y,
      moved: false,
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const next = clampPos(e.clientX - drag.ox, e.clientY - drag.oy, 104);
    if (Math.abs(next.x - pos.x) + Math.abs(next.y - pos.y) > 3) {
      drag.moved = true;
    }
    setPos(next);
  }

  function onPointerUp(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const next = clampPos(pos.x, pos.y, 104);
    setPos(next);
    savePos(next);
    if (!drag.moved) {
      setBubble(labelFor(emote));
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => setBubble(null), 2200);
    }
  }

  function hideForAWhile() {
    const until = Date.now() + HIDE_MS;
    try {
      localStorage.setItem(HIDDEN_KEY, String(until));
    } catch {
      /* ignore */
    }
    setTuckedAway(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      try {
        localStorage.removeItem(HIDDEN_KEY);
      } catch {
        /* ignore */
      }
      setTuckedAway(false);
    }, HIDE_MS);
  }

  return (
    <div
      ref={rootRef}
      className="clawd-pet"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        hideForAWhile();
      }}
      role="img"
      aria-label={`Clawd 桌宠 · ${labelFor(emote)}`}
      title="Clawd · 拖动移动 · 右键暂藏 30 分钟"
    >
      {bubble && <div className="clawd-pet-bubble">{bubble}</div>}
      <div
        className="clawd-pet-stage"
        key={emote}
        dangerouslySetInnerHTML={{ __html: getClawdSvg(emote) }}
      />
    </div>
  );
}
