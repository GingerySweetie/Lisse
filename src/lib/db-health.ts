/**
 * Dexie open / blocked / versionchange health.
 *
 * After a service-worker update, another tab (or a stale connection) can
 * block the schema upgrade. Without handlers, useLiveQuery stays at its
 * initial value and the UI looks like every conversation vanished.
 */

export type DbHealthKind =
  | 'ok'
  | 'opening'
  | 'blocked'
  | 'versionchange'
  | 'error';

export interface DbHealth {
  kind: DbHealthKind;
  message: string | null;
  detail: string | null;
  updatedAt: number;
}

type Listener = (h: DbHealth) => void;

let health: DbHealth = {
  kind: 'opening',
  message: null,
  detail: null,
  updatedAt: Date.now(),
};

const listeners = new Set<Listener>();

function emit(next: DbHealth): void {
  health = next;
  for (const fn of listeners) {
    try {
      fn(health);
    } catch {
      // ignore listener errors
    }
  }
}

export function getDbHealth(): DbHealth {
  return health;
}

export function subscribeDbHealth(fn: Listener): () => void {
  listeners.add(fn);
  fn(health);
  return () => {
    listeners.delete(fn);
  };
}

export function setDbHealth(
  kind: DbHealthKind,
  message: string | null = null,
  detail: string | null = null,
): void {
  emit({ kind, message, detail, updatedAt: Date.now() });
}

/** Wire Dexie lifecycle hooks once. Safe to call multiple times. */
let wired = false;
export function wireDbHealthHandlers(db: {
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  close: () => void;
  open: () => Promise<unknown>;
  isOpen: () => boolean;
}): void {
  if (wired) return;
  wired = true;

  db.on('blocked', () => {
    setDbHealth(
      'blocked',
      '数据库被另一个标签页占用，对话列表可能暂时显示为空。',
      '请关掉其他 Wisteria / Lisse 标签页，然后点下方「重试打开」。数据还在，不要做替换导入。',
    );
  });

  db.on('versionchange', () => {
    setDbHealth(
      'versionchange',
      '检测到数据库升级，正在关闭旧连接…',
      '页面将自动重载以加载新版本。若没有自动刷新，请手动刷新一次。',
    );
    try {
      db.close();
    } catch {
      // ignore
    }
    // Give other tabs a beat, then reload this one.
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    }, 400);
  });
}

export async function ensureDbOpen(db: {
  isOpen: () => boolean;
  open: () => Promise<unknown>;
}): Promise<void> {
  if (db.isOpen()) {
    if (health.kind === 'opening' || health.kind === 'blocked') {
      setDbHealth('ok');
    }
    return;
  }
  setDbHealth('opening', '正在打开本地数据库…');
  try {
    await db.open();
    setDbHealth('ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setDbHealth(
      'error',
      '本地数据库打不开，对话列表可能显示为空。',
      msg || '未知错误。请先到「导入 / 导出」尝试手动找回，不要新建对话覆盖。',
    );
    throw err;
  }
}
