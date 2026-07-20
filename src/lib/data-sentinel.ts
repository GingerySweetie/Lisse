/**
 * Lightweight "had data" marker outside IndexedDB.
 *
 * If Android WebView evicts IDB (or an APK reinstall wipes app-private
 * storage), Dexie opens a fresh empty DB and `on('populate')` only seeds
 * built-ins — looking exactly like "更新后对话全没了". IndexedDB cannot
 * remember that the user once had data; localStorage often still can
 * (and is cheap to check on every boot).
 */

const SENTINEL_KEY = 'wisteria_data_sentinel_v1';
const BACKUP_FOLDER_MIRROR_KEY = 'wisteria_backup_folder_mirror_v1';

export interface DataSentinel {
  /** Wall-clock ms when we last saw non-empty conversation data. */
  updatedAt: number;
  conversationCount: number;
  messageCount: number;
  /** Last known successful backup timestamp (ms), if any. */
  lastBackupAt: number | null;
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota / private mode — ignore.
  }
}

export function readDataSentinel(): DataSentinel | null {
  const raw = readRaw(SENTINEL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DataSentinel>;
    if (
      typeof parsed.updatedAt !== 'number' ||
      typeof parsed.conversationCount !== 'number' ||
      typeof parsed.messageCount !== 'number'
    ) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt,
      conversationCount: parsed.conversationCount,
      messageCount: parsed.messageCount,
      lastBackupAt:
        typeof parsed.lastBackupAt === 'number' ? parsed.lastBackupAt : null,
    };
  } catch {
    return null;
  }
}

/** Record that the live DB currently holds (or held) user conversations. */
export function touchDataSentinel(patch: {
  conversationCount: number;
  messageCount: number;
  lastBackupAt?: number | null;
}): void {
  if (patch.conversationCount <= 0 && patch.messageCount <= 0) return;
  const prev = readDataSentinel();
  const next: DataSentinel = {
    updatedAt: Date.now(),
    conversationCount: Math.max(
      patch.conversationCount,
      prev?.conversationCount ?? 0,
    ),
    messageCount: Math.max(patch.messageCount, prev?.messageCount ?? 0),
    lastBackupAt:
      patch.lastBackupAt !== undefined
        ? patch.lastBackupAt
        : (prev?.lastBackupAt ?? null),
  };
  writeRaw(SENTINEL_KEY, JSON.stringify(next));
}

/** Mark a successful backup time on the sentinel (even if counts unknown). */
export function noteBackupOnSentinel(at = Date.now()): void {
  const prev = readDataSentinel();
  const next: DataSentinel = {
    updatedAt: prev?.updatedAt ?? at,
    conversationCount: prev?.conversationCount ?? 0,
    messageCount: prev?.messageCount ?? 0,
    lastBackupAt: at,
  };
  // Keep a breadcrumb even when we never counted conversations yet.
  writeRaw(SENTINEL_KEY, JSON.stringify(next));
}

export function clearDataSentinel(): void {
  try {
    localStorage.removeItem(SENTINEL_KEY);
  } catch {
    // ignore
  }
}

export interface BackupFolderMirror {
  uri: string;
  label: string;
}

/** Mirror SAF folder out of IDB so recover still works after an IDB wipe. */
export function mirrorBackupFolder(folder: BackupFolderMirror | null): void {
  if (!folder) {
    try {
      localStorage.removeItem(BACKUP_FOLDER_MIRROR_KEY);
    } catch {
      // ignore
    }
    return;
  }
  writeRaw(BACKUP_FOLDER_MIRROR_KEY, JSON.stringify(folder));
}

export function readMirroredBackupFolder(): BackupFolderMirror | null {
  const raw = readRaw(BACKUP_FOLDER_MIRROR_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BackupFolderMirror>;
    if (typeof parsed.uri !== 'string' || !parsed.uri) return null;
    return {
      uri: parsed.uri,
      label: typeof parsed.label === 'string' ? parsed.label : '已选目录',
    };
  } catch {
    return null;
  }
}

/**
 * True when localStorage remembers prior data but IndexedDB currently has
 * zero conversations — the classic post-eviction / post-reinstall footprint.
 */
export function looksLikeSilentDataLoss(liveConversationCount: number): boolean {
  if (liveConversationCount > 0) return false;
  const s = readDataSentinel();
  if (!s) return false;
  return s.conversationCount > 0 || s.messageCount > 0;
}
