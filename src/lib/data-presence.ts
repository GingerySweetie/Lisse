/**
 * Track whether this install ever had conversations, so an empty IndexedDB
 * after an update can be distinguished from a brand-new install.
 *
 * Android WebViews may silently evict non-persisted IDB under storage
 * pressure; the bubble-transparency CSS update cannot wipe data, but an
 * update reload often coincides with eviction. When we detect "had data,
 * now empty", surface recovery UI immediately.
 */

const HAD_CONVERSATIONS_KEY = 'lisse.hadConversations';
const LAST_CONV_COUNT_KEY = 'lisse.lastKnownConvCount';
const DISMISS_WIPE_KEY = 'lisse.wipeBannerDismissedAt';

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

/** Call whenever we successfully observe conversations in IndexedDB. */
export function rememberConversationPresence(count: number): void {
  if (count <= 0) return;
  lsSet(HAD_CONVERSATIONS_KEY, '1');
  lsSet(LAST_CONV_COUNT_KEY, String(count));
  // Fresh data — clear any prior wipe dismiss so a later wipe can warn again.
  try {
    localStorage.removeItem(DISMISS_WIPE_KEY);
  } catch {
    /* ignore */
  }
}

export function hadConversationsBefore(): boolean {
  return lsGet(HAD_CONVERSATIONS_KEY) === '1';
}

export function lastKnownConversationCount(): number {
  const n = Number(lsGet(LAST_CONV_COUNT_KEY) ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function dismissWipeBanner(): void {
  lsSet(DISMISS_WIPE_KEY, String(Date.now()));
}

export function isWipeBannerDismissed(): boolean {
  const raw = lsGet(DISMISS_WIPE_KEY);
  if (!raw) return false;
  const at = Number(raw);
  // Re-show after 12h so a dismissed banner doesn't hide forever while
  // the user is still trying to recover.
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < 12 * 60 * 60 * 1000;
}

/**
 * True when the DB looks wiped: zero conversations now, but this browser
 * previously recorded having some (or still has endpoint config / consult
 * session crumbs that only exist after real use).
 */
export async function looksLikeDataWipe(opts: {
  conversationCount: number;
  messageCount?: number;
  endpointCount?: number;
  hasDefaultEndpoint?: boolean;
}): Promise<boolean> {
  if (opts.conversationCount > 0) return false;
  if (opts.messageCount !== undefined && opts.messageCount > 0) return false;

  if (hadConversationsBefore()) return true;

  // Heuristics for installs that never wrote the presence flag (older builds).
  try {
    if (localStorage.getItem('lisse.consult.activeConvId')) return true;
  } catch {
    /* ignore */
  }
  if (opts.endpointCount && opts.endpointCount > 0) return true;
  if (opts.hasDefaultEndpoint) return true;

  return false;
}
