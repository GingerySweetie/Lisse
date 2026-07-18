/**
 * Lightweight ambient state inference. Two sources:
 *
 *   1. Page Visibility timestamps — we know when Lisse was last open / hidden.
 *      Gaps between sessions reveal a rough sleep window, time-of-day pattern,
 *      cadence of app use.
 *
 *   2. Manual 1-tap state chips — the user pokes a chip ('累' / '经期' / ...)
 *      which sets a state with a 6h TTL. Pure manual but minimal effort.
 *
 * The output is a small natural-language block injected into the system
 * prompt at chat time. We never POST any of this anywhere — pure local.
 */

const LS_LAST_VISIBLE = 'lisse:lastVisible';
const LS_LAST_HIDDEN = 'lisse:lastHidden';
const LS_TYPING_RECENT = 'lisse:typingMs';
const LS_QUICK_STATE = 'lisse:quickState';

export type QuickStateKey =
  | 'tired'
  | 'period'
  | 'hungry'
  | 'energetic'
  | 'wired'
  | 'sad';

export interface QuickStateEntry {
  key: QuickStateKey;
  /** Set time (ms since epoch). */
  setAt: number;
  /** TTL in seconds; defaults to 6h. */
  ttlSeconds: number;
}

export const QUICK_STATE_TTL_SECONDS = 6 * 60 * 60;

export const QUICK_STATES: Record<
  QuickStateKey,
  { label: string; injectionPhrase: string }
> = {
  tired: { label: '累', injectionPhrase: '她说她累' },
  period: { label: '经期', injectionPhrase: '她在经期里' },
  hungry: { label: '饿', injectionPhrase: '她饿了一阵了' },
  energetic: { label: '满血', injectionPhrase: '她状态很好' },
  wired: { label: '睡不着', injectionPhrase: '她说自己睡不着 / 兴奋着' },
  sad: { label: '低气压', injectionPhrase: '她在低气压里' },
};

export function setQuickState(key: QuickStateKey): void {
  const entry: QuickStateEntry = {
    key,
    setAt: Date.now(),
    ttlSeconds: QUICK_STATE_TTL_SECONDS,
  };
  try {
    localStorage.setItem(LS_QUICK_STATE, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable in private mode; silently skip.
  }
}

export function clearQuickState(): void {
  try {
    localStorage.removeItem(LS_QUICK_STATE);
  } catch {
    /* ignore */
  }
}

export function getActiveQuickState(): QuickStateEntry | null {
  try {
    const raw = localStorage.getItem(LS_QUICK_STATE);
    if (!raw) return null;
    const entry = JSON.parse(raw) as QuickStateEntry;
    const age = (Date.now() - entry.setAt) / 1000;
    if (age > entry.ttlSeconds) {
      localStorage.removeItem(LS_QUICK_STATE);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/** Hook called on every visibilitychange to keep the timestamps fresh. */
export function recordVisibilityChange(): void {
  try {
    const now = Date.now();
    if (document.visibilityState === 'visible') {
      localStorage.setItem(LS_LAST_VISIBLE, String(now));
    } else {
      localStorage.setItem(LS_LAST_HIDDEN, String(now));
    }
  } catch {
    /* ignore */
  }
}

/** Initialize timestamps on app boot. */
export function bootstrapBehavior(): void {
  try {
    const now = Date.now();
    if (!localStorage.getItem(LS_LAST_VISIBLE)) {
      localStorage.setItem(LS_LAST_VISIBLE, String(now));
    }
  } catch {
    /* ignore */
  }
}

/** Note that the user typed N characters over D ms. Cheap moving average. */
export function recordTyping(typedChars: number, durationMs: number): void {
  if (durationMs < 500 || typedChars < 5) return;
  try {
    const cps = typedChars / (durationMs / 1000);
    const raw = localStorage.getItem(LS_TYPING_RECENT);
    const prev = raw ? Number(raw) : NaN;
    const next = Number.isFinite(prev) ? prev * 0.7 + cps * 0.3 : cps;
    localStorage.setItem(LS_TYPING_RECENT, String(next));
  } catch {
    /* ignore */
  }
}

interface InferredStatus {
  /** Plain-text summary lines to inject into the system prompt. */
  lines: string[];
  /** True when we have at least one meaningful signal. */
  hasSignal: boolean;
}

export function inferStatus(): InferredStatus {
  const lines: string[] = [];
  let hasSignal = false;

  // Gap since the app was last hidden (last "logged off")
  const lastHiddenRaw = safeRead(LS_LAST_HIDDEN);
  const lastVisibleRaw = safeRead(LS_LAST_VISIBLE);
  const now = Date.now();
  const lastHidden = lastHiddenRaw ? Number(lastHiddenRaw) : NaN;
  const lastVisible = lastVisibleRaw ? Number(lastVisibleRaw) : NaN;

  // Sleep / absence inference: gap between last hide and current visible.
  if (Number.isFinite(lastHidden) && Number.isFinite(lastVisible)) {
    const gapH = (lastVisible - lastHidden) / (1000 * 60 * 60);
    const sinceVisibleMin = (now - lastVisible) / (1000 * 60);
    if (gapH > 5 && gapH < 12 && sinceVisibleMin < 30) {
      lines.push(
        `她刚回到 app 不久（距离上次关掉大约 ${gapH.toFixed(1)} 小时） —— 大概率刚睡醒。`,
      );
      hasSignal = true;
    } else if (gapH >= 12 && sinceVisibleMin < 30) {
      lines.push(
        `她有 ${gapH.toFixed(0)} 小时没打开 app —— 上班 / 出门 / 睡懒觉后回来。`,
      );
      hasSignal = true;
    } else if (gapH > 0.3 && gapH < 5 && sinceVisibleMin < 30) {
      lines.push(`距离上次关掉 app ${(gapH * 60).toFixed(0)} 分钟，刚回来。`);
      hasSignal = true;
    }
  }

  // Time-of-day — coarse label ONLY when another signal already fired.
  // A minute-precision clock was always-on (~40 uncached toks every turn)
  // and busted any hope of reusing the volatile string within the hour.
  const hour = new Date().getHours();
  const tod = labelTimeOfDay(hour);
  if (tod && hasSignal) {
    lines.push(`现在是${tod}。`);
  }

  // Typing cadence
  const typing = safeRead(LS_TYPING_RECENT);
  if (typing) {
    const cps = Number(typing);
    if (Number.isFinite(cps)) {
      if (cps < 1.2) {
        lines.push('最近打字明显比平时慢，可能累或在思考。');
        hasSignal = true;
      } else if (cps > 4.5) {
        lines.push('最近打字很快，情绪 / 思路在往外冲。');
        hasSignal = true;
      }
    }
  }

  // Manual quick-state
  const quick = getActiveQuickState();
  if (quick) {
    const def = QUICK_STATES[quick.key];
    if (def) {
      lines.push(`${def.injectionPhrase}（她大约 ${minutesAgo(quick.setAt)} 分钟前打的标签）。`);
      hasSignal = true;
    }
  }

  return { lines, hasSignal };
}

/** Build a system-prompt block from the inferred status. Empty when nothing useful. */
export function formatStatusBlock(): string {
  const { lines, hasSignal } = inferStatus();
  if (!hasSignal) return '';
  return [
    '# さざなみ的此刻（自动推断，不一定准）',
    ...lines.map((l) => `- ${l}`),
    '',
    '把这些当作背景温度，不要直接复述，也不要假装没看到。',
  ].join('\n');
}

function safeRead(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function minutesAgo(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

function labelTimeOfDay(hour: number): string | null {
  if (hour >= 0 && hour < 6) return '深夜';
  if (hour >= 6 && hour < 9) return '清早';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 14) return '中午';
  if (hour >= 14 && hour < 18) return '下午（上班时段）';
  if (hour >= 18 && hour < 23) return '晚上（上班 / 下班路上）';
  if (hour >= 23) return '深夜（睡前）';
  return null;
}
