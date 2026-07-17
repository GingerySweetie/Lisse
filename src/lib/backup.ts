import { db, getSettings, saveSettings } from '../db';
import { saveFile } from './save-file';
import {
  clearBackupFolder,
  getBackupFolder,
  getValidBackupFolder,
  isBackupFolderPickerAvailable,
  setBackupFolder,
} from './backup-location';
import FileSaver from './native/file-saver';
import { saveBlobNativeChunked } from './native-chunked-save';
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
  WeightEntry,
  WritingStyle,
} from '../types';
import type { HandoffJob } from './workshop/handoff-protocol';

const LAST_BACKUP_AT_KEY = 'last_backup_at';

/** Binary chunk size when streaming UTF-8 to the native writer. */
const STREAM_CHUNK_BYTES = 192 * 1024;
/** Rows per Dexie page when streaming large tables. */
const TABLE_PAGE = 80;

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
  | 'handoffJobs';

const BACKUP_TABLES: BackupTableName[] = [
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
];

function tableRef(name: BackupTableName) {
  return db[name];
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
  ]);

  const now = Date.now();
  await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });

  return {
    __lisse: 'backup',
    version: 5,
    exportedAt: now,
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
  settingsApplied: boolean;
}

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

  // Keep the SAF backup-folder grant across replace wipes.
  const preservedFolder =
    opts.mode === 'replace' ? await getBackupFolder() : null;

  if (opts.mode === 'replace') {
    await db.transaction(
      'rw',
      [
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
        db.kv,
      ],
      async () => {
        await db.endpoints.clear();
        await db.personas.clear();
        await db.conversations.clear();
        await db.messages.clear();
        await db.memoryFacts.clear();
        await db.writingStyles.clear();
        await db.books.clear();
        await db.bookmarks.clear();
        await db.mcpServers.clear();
        await db.bills.clear();
        await db.periodEntries.clear();
        await db.weightEntries.clear();
        await db.browserBookmarks.clear();
        await db.browserScripts.clear();
        await db.musicCredentials.clear();
        await db.musicHistory.clear();
        await db.circlePosts.clear();
        await db.circleReactions.clear();
        await db.healthComments.clear();
        await db.healthDaily.clear();
        await db.handoffJobs.clear();
        await db.kv.clear();
      },
    );
    if (preservedFolder) {
      await setBackupFolder(preservedFolder);
    }
  }

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
    settingsApplied: false,
  };

  // Upsert everything (merge updates existing ids; replace already cleared).
  // bulkPut keeps large conversation imports from timing out row-by-row.
  await db.transaction(
    'rw',
    [
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
    ],
    async () => {
      result.endpointsAdded = await upsertAll(db.endpoints, bundle.endpoints);
      result.personasAdded = await upsertAll(db.personas, bundle.personas);
      result.conversationsAdded = await upsertAll(
        db.conversations,
        bundle.conversations,
      );
      result.messagesAdded = await upsertAll(db.messages, bundle.messages);
      result.memoryFactsAdded = await upsertAll(
        db.memoryFacts,
        bundle.memoryFacts,
      );
      result.writingStylesAdded = await upsertAll(
        db.writingStyles,
        bundle.writingStyles,
      );
      result.booksAdded = await upsertAll(db.books, bundle.books);
      result.bookmarksAdded = await upsertAll(db.bookmarks, bundle.bookmarks);
      result.mcpServersAdded = await upsertAll(db.mcpServers, bundle.mcpServers);
      result.billsAdded = await upsertAll(db.bills, bundle.bills);
      result.periodEntriesAdded = await upsertAll(
        db.periodEntries,
        bundle.periodEntries,
      );
      result.weightEntriesAdded = await upsertAll(
        db.weightEntries,
        bundle.weightEntries,
      );
      result.browserBookmarksAdded = await upsertAll(
        db.browserBookmarks,
        bundle.browserBookmarks,
      );
      result.browserScriptsAdded = await upsertAll(
        db.browserScripts,
        bundle.browserScripts,
      );
      result.musicCredentialsAdded = await upsertAll(
        db.musicCredentials,
        bundle.musicCredentials,
      );
      result.musicHistoryAdded = await upsertAll(
        db.musicHistory,
        bundle.musicHistory,
      );
      result.circlePostsAdded = await upsertAll(
        db.circlePosts,
        bundle.circlePosts,
      );
      result.circleReactionsAdded = await upsertAll(
        db.circleReactions,
        bundle.circleReactions,
      );
      result.healthCommentsAdded = await upsertAll(
        db.healthComments,
        bundle.healthComments,
      );
      result.healthDailyAdded = await upsertAll(
        db.healthDaily,
        bundle.healthDaily,
      );
      result.handoffJobsAdded = await upsertAll(
        db.handoffJobs,
        bundle.handoffJobs,
      );
    },
  );

  // Always apply settings so default endpoint / persona / style / API-related
  // prefs land in the Settings UI after import.
  if (bundle.settings) {
    await saveSettings(bundle.settings);
    result.settingsApplied = true;
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
export async function downloadBackup(filename: string): Promise<void> {
  if (isBackupFolderPickerAvailable()) {
    const folder = await getValidBackupFolder();
    try {
      await streamBackupToNative(filename, folder?.uri);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('PERMISSION_LOST')) {
        await clearBackupFolder();
      }
      if (folder && !msg.includes('UNSUPPORTED_API_LEVEL')) {
        // Retry to Downloads without the SAF folder.
        try {
          await streamBackupToNative(filename);
          return;
        } catch (retryErr) {
          console.warn('[backup] native stream failed:', retryErr);
        }
      } else if (!msg.includes('UNSUPPORTED_API_LEVEL')) {
        console.warn('[backup] native stream failed:', msg);
      }
    }
  }

  const blob = await buildBackupBlob();
  await saveFile(blob, filename, 'JSON 备份文件');
}

/** @deprecated Prefer downloadBackup — kept for callers that already have a bundle. */
export async function downloadJSON(data: unknown, filename: string): Promise<void> {
  // Compact JSON (no pretty-print) — pretty-print roughly doubles size/memory.
  const blob = new Blob([JSON.stringify(data)], {
    type: 'application/json',
  });

  if (isBackupFolderPickerAvailable()) {
    const folder = await getValidBackupFolder();
    if (folder) {
      try {
        await saveBlobNativeChunked(blob, filename, { folderUri: folder.uri });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('PERMISSION_LOST')) {
          await clearBackupFolder();
        } else {
          throw err;
        }
      }
    }
    try {
      await saveBlobNativeChunked(blob, filename);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('UNSUPPORTED_API_LEVEL')) {
        console.warn('[backup] chunked save failed:', msg);
      }
    }
  }

  await saveFile(blob, filename, 'JSON 备份文件');
}

export function suggestedBackupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `lisse-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

// ── Streaming / blob builders ─────────────────────────────────────────────

async function streamBackupToNative(
  filename: string,
  folderUri?: string,
): Promise<void> {
  const { handle } = await FileSaver.beginSave({
    mimeType: 'application/json',
    suggestedName: filename,
    folderUri,
  });

  const out = createChunkedWriter(handle);

  try {
    const now = Date.now();
    await out.write(`{"__lisse":"backup","version":5,"exportedAt":${now}`);

    const settings = await getSettings();
    await out.write(`,"settings":${JSON.stringify(settings)}`);

    for (const name of BACKUP_TABLES) {
      await out.write(`,"${name}":[`);
      let first = true;
      let offset = 0;
      for (;;) {
        const batch = await tableRef(name).offset(offset).limit(TABLE_PAGE).toArray();
        if (batch.length === 0) break;
        for (const row of batch) {
          await out.write((first ? '' : ',') + JSON.stringify(row));
          first = false;
        }
        offset += batch.length;
        await yieldToUi();
      }
      await out.write(']');
    }

    await out.write('}');
    await out.flush();
    await FileSaver.endSave({ handle });
    await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });
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
async function buildBackupBlob(): Promise<Blob> {
  const parts: BlobPart[] = [];
  const now = Date.now();
  parts.push(`{"__lisse":"backup","version":5,"exportedAt":${now}`);

  const settings = await getSettings();
  parts.push(`,"settings":${JSON.stringify(settings)}`);

  for (const name of BACKUP_TABLES) {
    parts.push(`,"${name}":[`);
    let first = true;
    let offset = 0;
    for (;;) {
      const batch = await tableRef(name).offset(offset).limit(TABLE_PAGE).toArray();
      if (batch.length === 0) break;
      for (const row of batch) {
        parts.push((first ? '' : ',') + JSON.stringify(row));
        first = false;
      }
      offset += batch.length;
      await yieldToUi();
    }
    parts.push(']');
  }

  parts.push('}');
  await db.kv.put({ key: LAST_BACKUP_AT_KEY, value: now });
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

function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
