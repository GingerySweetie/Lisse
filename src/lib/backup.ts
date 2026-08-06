import { db, getSettings, saveSettings } from '../db';
import { rememberLastBackup } from './data-presence';
import { saveFile } from './save-file';
import {
  clearBackupFolder,
  getBackupFolder,
  getValidBackupFolder,
  isBackupFolderPickerAvailable,
  saveExportBlob,
  setBackupFolder,
} from './backup-location';
import FileSaver from './native/file-saver';
import type {
  AppSettings,
  Bill,
  Book,
  Bookmark,
  BrowserBookmark,
  BrowserScript,
  CirclePost,
  CircleReaction,
  Conversation,
  DiaryEntry,
  Endpoint,
  HealthComment,
  HealthDailySnapshot,
  McpServer,
  MemoryFact,
  Message,
  MusicCredentials,
  MusicHistoryEntry,
  Persona,
  PeriodEntry,
  TravelEvent,
  TravelHeldPush,
  TravelTrip,
  WeightEntry,
  WritingStyle,
} from '../types';
import type { HandoffJob } from './workshop/handoff-protocol';
import {
  makeProgress,
  throwIfAborted,
  yieldToUi,
  type ExportProgressCallback,
} from './export-progress';
import { formatStorageError } from './storage-guards';
import { beginActiveWork, endActiveWork } from './stream-activity';
import { noteBackupOnSentinel, touchDataSentinel } from './data-sentinel';
import { orderBackupTablesForIntegrity } from './backup-integrity';
import { repairConversationLeaves } from './backup-repair';

const LAST_BACKUP_AT_KEY = 'last_backup_at';

/** Binary chunk size when streaming UTF-8 to the native writer. */
const STREAM_CHUNK_BYTES = 192 * 1024;
/** Rows per Dexie page when streaming large tables. */
const TABLE_PAGE = 80;

export interface BackupExportOptions {
  signal?: AbortSignal;
  onProgress?: ExportProgressCallback;
}

export interface BackupBundle {
  /** Format identifier for sanity-checking. */
  __lisse: 'backup';
  /** Schema version of the bundle (not Dexie's). */
  version: 5;
  exportedAt: number;
  settings: AppSettings;
  endpoints: Endpoint[];
  personas: Persona[];
  conversations: Conversation[];
  messages: Message[];
  memoryFacts?: MemoryFact[];
  writingStyles?: WritingStyle[];
  books?: Book[];
  bookmarks?: Bookmark[];
  mcpServers?: McpServer[];
  /** Added in v5 — previously omitted from exports. */
  bills?: Bill[];
  periodEntries?: PeriodEntry[];
  weightEntries?: WeightEntry[];
  browserBookmarks?: BrowserBookmark[];
  browserScripts?: BrowserScript[];
  musicCredentials?: MusicCredentials[];
  musicHistory?: MusicHistoryEntry[];
  circlePosts?: CirclePost[];
  circleReactions?: CircleReaction[];
  healthComments?: HealthComment[];
  healthDaily?: HealthDailySnapshot[];
  handoffJobs?: HandoffJob[];
  travelTrips?: TravelTrip[];
  travelEvents?: TravelEvent[];
  travelHeldPushes?: TravelHeldPush[];
  diaryEntries?: DiaryEntry[];
}

type BackupTableName =
  | 'endpoints'
  | 'personas'
  | 'conversations'
  | 'messages'
  | 'memoryFacts'
  | 'writingStyles'
  | 'books'
  | 'bookmarks'
  | 'mcpServers'
  | 'bills'
  | 'periodEntries'
  | 'weightEntries'
  | 'browserBookmarks'
  | 'browserScripts'
  | 'musicCredentials'
  | 'musicHistory'
  | 'circlePosts'
  | 'circleReactions'
  | 'healthComments'
  | 'healthDaily'
  | 'handoffJobs'
  | 'travelTrips'
  | 'travelEvents'
  | 'travelHeldPushes'
  | 'diaryEntries';

const BACKUP_TABLES_RAW: BackupTableName[] = [
  'endpoints',
  'personas',
  'conversations',
  'messages',
  'memoryFacts',
  'writingStyles',
  'books',
  'bookmarks',
  'mcpServers',
  'bills',
  'periodEntries',
  'weightEntries',
  'browserBookmarks',
  'browserScripts',
  'musicCredentials',
  'musicHistory',
  'circlePosts',
  'circleReactions',
  'healthComments',
  'healthDaily',
  'handoffJobs',
  'travelTrips',
  'travelEvents',
  'travelHeldPushes',
  'diaryEntries',
];

/** messages before conversations — safer for stream import crashes. */
const BACKUP_TABLES: BackupTableName[] = orderBackupTablesForIntegrity(
  BACKUP_TABLES_RAW,
);

function tableRef(name: BackupTableName) {
  return db[name];
}

/** Keyset pagination — avoids skipping rows when the table mutates mid-export. */
async function readTablePage(
  name: BackupTableName,
  afterId: string | null,
): Promise<{ rows: Array<{ id: string }>; nextId: string | null }> {
  const table = tableRef(name);
  const rows = (
    afterId == null
      ? await table.orderBy('id').limit(TABLE_PAGE).toArray()
      : await table.where('id').above(afterId).limit(TABLE_PAGE).toArray()
  ) as Array<{ id: string }>;
  const nextId = rows.length ? rows[rows.length - 1]!.id : null;
  return { rows, nextId };
}

export async function exportBackup(): Promise<BackupBundle> {
  const [
    settings,
    endpoints,
    personas,
    conversations,
    messages,
    memoryFacts,
    writingStyles,
    books,
    bookmarks,
    mcpServers,
    bills,
    periodEntries,
    weightEntries,
    browserBookmarks,
    browserScripts,
    musicCredentials,
    musicHistory,
    circlePosts,
    circleReactions,
    healthComments,
    healthDaily,
    handoffJobs,
    travelTrips,
    travelEvents,
    travelHeldPushes,
    diaryEntries,
  ] = await Promise.all([
    getSettings(),
    db.endpoints.toArray(),
    db.personas.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memoryFacts.toArray(),
    db.writingStyles.toArray(),
    db.books.toArray(),
    db.bookmarks.toArray(),
    db.mcpServers.toArray(),
    db.bills.toArray(),
    db.periodEntries.toArray(),
    db.weightEntries.toArray(),
    db.browserBookmarks.toArray(),
    db.browserScripts.toArray(),
    db.musicCredentials.toArray(),
    db.musicHistory.toArray(),
    db.circlePosts.toArray(),
    db.circleReactions.toArray(),
    db.healthComments.toArray(),
    db.healthDaily.toArray(),
    db.handoffJobs.toArray(),
    db.travelTrips.toArray(),
    db.travelEvents.toArray(),
    db.travelHeldPushes.toArray(),
    db.diaryEntries.toArray(),
  ]);

  const now = Date.now();
  await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });
  noteBackupOnSentinel(now);
  touchDataSentinel({
    conversationCount: conversations.length,
    messageCount: messages.length,
    lastBackupAt: now,
  });

  return {
    __lisse: 'backup',
    version: 5,
    exportedAt: now,
    settings,
    endpoints,
    personas,
    // messages before conversations (same integrity rule as streamed export)
    messages,
    conversations,
    memoryFacts,
    writingStyles,
    books,
    bookmarks,
    mcpServers,
    bills,
    periodEntries,
    weightEntries,
    browserBookmarks,
    browserScripts,
    musicCredentials,
    musicHistory,
    circlePosts,
    circleReactions,
    healthComments,
    healthDaily,
    handoffJobs,
    travelTrips,
    travelEvents,
    travelHeldPushes,
    diaryEntries,
  };
}

/** Returns the Unix-ms timestamp of the last completed backup, or null. */
export async function getLastBackupAt(): Promise<number | null> {
  const row = await db.kv.get(LAST_BACKUP_AT_KEY);
  return row ? (row.value as number) : null;
}

export interface ImportBackupOptions {
  /** 'merge' upserts by id (updates existing). 'replace' wipes first. */
  mode: 'merge' | 'replace';
}

export interface ImportBackupResult {
  endpointsAdded: number;
  personasAdded: number;
  conversationsAdded: number;
  messagesAdded: number;
  memoryFactsAdded: number;
  writingStylesAdded: number;
  booksAdded: number;
  bookmarksAdded: number;
  mcpServersAdded: number;
  billsAdded: number;
  periodEntriesAdded: number;
  weightEntriesAdded: number;
  browserBookmarksAdded: number;
  browserScriptsAdded: number;
  musicCredentialsAdded: number;
  musicHistoryAdded: number;
  circlePostsAdded: number;
  circleReactionsAdded: number;
  healthCommentsAdded: number;
  healthDailyAdded: number;
  handoffJobsAdded: number;
  travelTripsAdded: number;
  travelEventsAdded: number;
  travelHeldPushesAdded: number;
  diaryEntriesAdded: number;
  settingsApplied: boolean;
}

const IMPORT_TABLES = [
  db.endpoints,
  db.personas,
  db.conversations,
  db.messages,
  db.memoryFacts,
  db.writingStyles,
  db.books,
  db.bookmarks,
  db.mcpServers,
  db.bills,
  db.periodEntries,
  db.weightEntries,
  db.browserBookmarks,
  db.browserScripts,
  db.musicCredentials,
  db.musicHistory,
  db.circlePosts,
  db.circleReactions,
  db.healthComments,
  db.healthDaily,
  db.handoffJobs,
  db.travelTrips,
  db.travelEvents,
  db.travelHeldPushes,
  db.diaryEntries,
  db.kv,
] as const;

export async function importBackup(
  fileText: string,
  opts: ImportBackupOptions,
): Promise<ImportBackupResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    throw new Error(
      `不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).__lisse !== 'backup'
  ) {
    throw new Error('不是 Lisse 的备份文件');
  }
  // Accept both the old v4 format and the new v5 format.
  const bundle = raw as BackupBundle & { version: 4 | 5 };

  // Keep the SAF backup-folder grant across replace wipes. Restored only
  // AFTER a successful atomic import so a failed replace never leaves an
  // empty DB with a half-applied grant rewrite.
  const preservedFolder =
    opts.mode === 'replace' ? await getBackupFolder() : null;

  const result: ImportBackupResult = {
    endpointsAdded: 0,
    personasAdded: 0,
    conversationsAdded: 0,
    messagesAdded: 0,
    memoryFactsAdded: 0,
    writingStylesAdded: 0,
    booksAdded: 0,
    bookmarksAdded: 0,
    mcpServersAdded: 0,
    billsAdded: 0,
    periodEntriesAdded: 0,
    weightEntriesAdded: 0,
    browserBookmarksAdded: 0,
    browserScriptsAdded: 0,
    musicCredentialsAdded: 0,
    musicHistoryAdded: 0,
    circlePostsAdded: 0,
    circleReactionsAdded: 0,
    healthCommentsAdded: 0,
    healthDailyAdded: 0,
    handoffJobsAdded: 0,
    travelTripsAdded: 0,
    travelEventsAdded: 0,
    travelHeldPushesAdded: 0,
    diaryEntriesAdded: 0,
    settingsApplied: false,
  };

  // CRITICAL: clear + write + settings must share ONE IndexedDB transaction.
  // The old path cleared in tx1 and wrote in tx2 — if tx2 failed (quota /
  // OOM / tab kill after a huge paste+import), the wipe had already
  // committed and the user lost everything.
  //
  // Only clear tables the backup actually includes. Clearing every table
  // (including ones absent from older/partial backups) wiped live data the
  // file never claimed to replace. Never clear kv when settings is missing.
  try {
    await db.transaction('rw', [...IMPORT_TABLES], async () => {
      async function replaceTable<T>(
        table: { clear: () => Promise<unknown>; bulkPut: (items: T[]) => Promise<unknown> },
        rows: T[] | undefined,
      ): Promise<number> {
        if (rows === undefined) return 0;
        if (opts.mode === 'replace') await table.clear();
        return upsertAll(table, rows);
      }

      // Upsert everything (merge updates existing ids; replace clears only
      // present arrays first). bulkPut keeps large conversation imports from
      // timing out row-by-row.
      result.endpointsAdded = await replaceTable(db.endpoints, bundle.endpoints);
      result.personasAdded = await replaceTable(db.personas, bundle.personas);
      // Messages before conversations so leaves never point at unwritten rows
      // if this transaction is somehow interrupted mid-flight.
      result.messagesAdded = await replaceTable(db.messages, bundle.messages);
      result.conversationsAdded = await replaceTable(
        db.conversations,
        bundle.conversations,
      );
      result.memoryFactsAdded = await replaceTable(
        db.memoryFacts,
        bundle.memoryFacts,
      );
      result.writingStylesAdded = await replaceTable(
        db.writingStyles,
        bundle.writingStyles,
      );
      result.booksAdded = await replaceTable(db.books, bundle.books);
      result.bookmarksAdded = await replaceTable(db.bookmarks, bundle.bookmarks);
      result.mcpServersAdded = await replaceTable(db.mcpServers, bundle.mcpServers);
      result.billsAdded = await replaceTable(db.bills, bundle.bills);
      result.periodEntriesAdded = await replaceTable(
        db.periodEntries,
        bundle.periodEntries,
      );
      result.weightEntriesAdded = await replaceTable(
        db.weightEntries,
        bundle.weightEntries,
      );
      result.browserBookmarksAdded = await replaceTable(
        db.browserBookmarks,
        bundle.browserBookmarks,
      );
      result.browserScriptsAdded = await replaceTable(
        db.browserScripts,
        bundle.browserScripts,
      );
      result.musicCredentialsAdded = await replaceTable(
        db.musicCredentials,
        bundle.musicCredentials,
      );
      result.musicHistoryAdded = await replaceTable(
        db.musicHistory,
        bundle.musicHistory,
      );
      result.circlePostsAdded = await replaceTable(
        db.circlePosts,
        bundle.circlePosts,
      );
      result.circleReactionsAdded = await replaceTable(
        db.circleReactions,
        bundle.circleReactions,
      );
      result.healthCommentsAdded = await replaceTable(
        db.healthComments,
        bundle.healthComments,
      );
      result.healthDailyAdded = await replaceTable(
        db.healthDaily,
        bundle.healthDaily,
      );
      result.handoffJobsAdded = await replaceTable(
        db.handoffJobs,
        bundle.handoffJobs,
      );
      result.travelTripsAdded = await replaceTable(
        db.travelTrips,
        bundle.travelTrips,
      );
      result.travelEventsAdded = await replaceTable(
        db.travelEvents,
        bundle.travelEvents,
      );
      result.travelHeldPushesAdded = await replaceTable(
        db.travelHeldPushes,
        bundle.travelHeldPushes,
      );
      result.diaryEntriesAdded = await replaceTable(
        db.diaryEntries,
        bundle.diaryEntries,
      );

      // Apply settings inside the same transaction. Do NOT kv.clear() when
      // settings is absent — that erased endpoints/wallpaper/backup grants.
      if (bundle.settings) {
        await saveSettings(bundle.settings);
        result.settingsApplied = true;
      }
    });
  } catch (err) {
    throw new Error(formatStorageError(err), { cause: err });
  }

  try {
    await repairConversationLeaves();
  } catch {
    // non-fatal
  }

  if (preservedFolder) {
    try {
      await setBackupFolder(preservedFolder);
    } catch {
      // Non-fatal: data restore already committed.
    }
  }

  return result;
}

async function upsertAll<T>(
  table: { bulkPut: (items: T[]) => Promise<unknown> },
  rows: T[] | undefined,
): Promise<number> {
  if (!rows?.length) return 0;
  // Chunk bulkPut so a huge messages[] doesn't blow the transaction.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await table.bulkPut(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

/**
 * Export the full backup and save it. On Android this streams JSON to the
 * native writer in small chunks (no giant base64 bridge payload). Elsewhere
 * it builds a compact Blob and uses the normal saveFile fallbacks.
 */
export interface BackupSaveResult {
  filename: string;
  path?: string;
}

export async function downloadBackup(
  filename: string,
  opts?: BackupExportOptions,
): Promise<BackupSaveResult> {
  beginActiveWork();
  try {
    if (isBackupFolderPickerAvailable()) {
      const folder = await getValidBackupFolder();
      try {
        const path = await streamBackupToNative(filename, folder?.uri, opts);
        const result = { filename, path };
        rememberLastBackup(result);
        noteBackupOnSentinel();
        return result;
      } catch (err) {
        throwIfAborted(opts?.signal);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('PERMISSION_LOST')) {
          await clearBackupFolder();
        }
        if (folder && !msg.includes('UNSUPPORTED_API_LEVEL')) {
          // Retry to Downloads without the SAF folder.
          try {
            const path = await streamBackupToNative(filename, undefined, opts);
            const result = { filename, path };
            rememberLastBackup(result);
            noteBackupOnSentinel();
            return result;
          } catch (retryErr) {
            throwIfAborted(opts?.signal);
            console.warn('[backup] native stream failed:', retryErr);
          }
        } else if (!msg.includes('UNSUPPORTED_API_LEVEL')) {
          console.warn('[backup] native stream failed:', msg);
        }
      }
    }

    const blob = await buildBackupBlob(opts);
    throwIfAborted(opts?.signal);
    opts?.onProgress?.(makeProgress(1, 1, '写入文件…', 'save'));
    await saveFile(blob, filename, 'JSON 备份文件');
    const result = { filename };
    rememberLastBackup(result);
    noteBackupOnSentinel();
    return result;
  } finally {
    endActiveWork();
  }
}

/** @deprecated Prefer downloadBackup — kept for callers that already have a bundle. */
export async function downloadJSON(data: unknown, filename: string): Promise<void> {
  // Compact JSON (no pretty-print) — pretty-print roughly doubles size/memory.
  const blob = new Blob([JSON.stringify(data)], {
    type: 'application/json',
  });
  await saveExportBlob(blob, filename, 'JSON 备份文件');
}

export function suggestedBackupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `lisse-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

// ── Streaming / blob builders ─────────────────────────────────────────────

async function countBackupRows(): Promise<number> {
  const counts = await Promise.all(
    BACKUP_TABLES.map((name) => tableRef(name).count()),
  );
  return counts.reduce((a, b) => a + b, 0);
}

async function streamBackupToNative(
  filename: string,
  folderUri?: string,
  opts?: BackupExportOptions,
): Promise<string | undefined> {
  opts?.onProgress?.(makeProgress(0, 1, '准备备份…', 'prepare'));
  const totalRows = await countBackupRows();
  // +1 for settings / header work so the bar isn't stuck at 0.
  const total = Math.max(totalRows + 1, 1);

  const { handle } = await FileSaver.beginSave({
    mimeType: 'application/json',
    suggestedName: filename,
    folderUri,
  });

  const out = createChunkedWriter(handle);

  try {
    throwIfAborted(opts?.signal);
    const now = Date.now();
    await out.write(`{"__lisse":"backup","version":5,"exportedAt":${now}`);

    const settings = await getSettings();
    await out.write(`,"settings":${JSON.stringify(settings)}`);
    let done = 1;
    opts?.onProgress?.(
      makeProgress(done, total, '写入设置…', 'settings'),
    );

    for (const name of BACKUP_TABLES) {
      throwIfAborted(opts?.signal);
      await out.write(`,"${name}":[`);
      let first = true;
      let afterId: string | null = null;
      for (;;) {
        throwIfAborted(opts?.signal);
        const { rows, nextId } = await readTablePage(name, afterId);
        if (rows.length === 0) break;
        for (const row of rows) {
          await out.write((first ? '' : ',') + JSON.stringify(row));
          first = false;
        }
        afterId = nextId;
        done += rows.length;
        opts?.onProgress?.(
          makeProgress(done, total, `导出 ${name}…`, name),
        );
        await yieldToUi();
      }
      await out.write(']');
    }

    throwIfAborted(opts?.signal);
    await out.write('}');
    await out.flush();
    opts?.onProgress?.(makeProgress(total, total, '完成写入…', 'save'));
    const ended = await FileSaver.endSave({ handle });
    await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });
    noteBackupOnSentinel(now);
    return ended?.path;
  } catch (err) {
    try {
      await FileSaver.abortSave({ handle });
    } catch {
      // ignore
    }
    throw err;
  }
}

/** Build a compact backup Blob without pretty-printing (browser / fallback). */
async function buildBackupBlob(opts?: BackupExportOptions): Promise<Blob> {
  opts?.onProgress?.(makeProgress(0, 1, '准备备份…', 'prepare'));
  const totalRows = await countBackupRows();
  const total = Math.max(totalRows + 1, 1);

  const parts: BlobPart[] = [];
  const now = Date.now();
  parts.push(`{"__lisse":"backup","version":5,"exportedAt":${now}`);

  const settings = await getSettings();
  parts.push(`,"settings":${JSON.stringify(settings)}`);
  let done = 1;
  opts?.onProgress?.(
    makeProgress(done, total, '写入设置…', 'settings'),
  );

  for (const name of BACKUP_TABLES) {
    throwIfAborted(opts?.signal);
    parts.push(`,"${name}":[`);
    let first = true;
    let afterId: string | null = null;
    for (;;) {
      throwIfAborted(opts?.signal);
      const { rows, nextId } = await readTablePage(name, afterId);
      if (rows.length === 0) break;
      for (const row of rows) {
        parts.push((first ? '' : ',') + JSON.stringify(row));
        first = false;
      }
      afterId = nextId;
      done += rows.length;
      opts?.onProgress?.(
        makeProgress(done, total, `导出 ${name}…`, name),
      );
      await yieldToUi();
    }
    parts.push(']');
  }

  parts.push('}');
  await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });
  noteBackupOnSentinel(now);
  return new Blob(parts, { type: 'application/json' });
}

function createChunkedWriter(handle: string) {
  const encoder = new TextEncoder();
  let pending = new Uint8Array(0);

  const concat = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  };

  const flushFullChunks = async (force = false) => {
    while (
      pending.length >= STREAM_CHUNK_BYTES ||
      (force && pending.length > 0)
    ) {
      const take = Math.min(pending.length, STREAM_CHUNK_BYTES);
      const slice = pending.subarray(0, take);
      pending = pending.subarray(take);
      await FileSaver.writeChunk({
        handle,
        data: uint8ToBase64(slice),
      });
    }
  };

  return {
    async write(text: string) {
      pending = concat(pending, encoder.encode(text));
      await flushFullChunks(false);
    },
    async flush() {
      await flushFullChunks(true);
    },
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
