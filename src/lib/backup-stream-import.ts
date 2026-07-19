/**
 * Stream a Lisse full-backup JSON into IndexedDB without holding the whole
 * file (or parsed object graph) in memory. Used for large backups that would
 * OOM FileReader.readAsText + JSON.parse on mobile WebViews.
 */

import { db, saveSettings } from '../db';
import type { AppSettings } from '../types';
import { getBackupFolder, setBackupFolder } from './backup-location';
import FileSaver from './native/file-saver';
import {
  parseJsonObjectStream,
  stringChunks,
} from './stream-json-object';
import { formatStorageError } from './storage-guards';
import { yieldToUi } from './export-progress';
import type { ImportBackupOptions, ImportBackupResult } from './backup';

const UPSERT_CHUNK = 200;

/** Tables that appear as top-level arrays in a backup bundle. */
const BACKUP_TABLE_KEYS = [
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
] as const;

type BackupTableKey = (typeof BACKUP_TABLE_KEYS)[number];

const TABLE_KEY_SET = new Set<string>(BACKUP_TABLE_KEYS);

const RESULT_FIELD: Record<BackupTableKey, keyof ImportBackupResult> = {
  endpoints: 'endpointsAdded',
  personas: 'personasAdded',
  conversations: 'conversationsAdded',
  messages: 'messagesAdded',
  memoryFacts: 'memoryFactsAdded',
  writingStyles: 'writingStylesAdded',
  books: 'booksAdded',
  bookmarks: 'bookmarksAdded',
  mcpServers: 'mcpServersAdded',
  bills: 'billsAdded',
  periodEntries: 'periodEntriesAdded',
  weightEntries: 'weightEntriesAdded',
  browserBookmarks: 'browserBookmarksAdded',
  browserScripts: 'browserScriptsAdded',
  musicCredentials: 'musicCredentialsAdded',
  musicHistory: 'musicHistoryAdded',
  circlePosts: 'circlePostsAdded',
  circleReactions: 'circleReactionsAdded',
  healthComments: 'healthCommentsAdded',
  healthDaily: 'healthDailyAdded',
  handoffJobs: 'handoffJobsAdded',
  travelTrips: 'travelTripsAdded',
  travelEvents: 'travelEventsAdded',
  travelHeldPushes: 'travelHeldPushesAdded',
  diaryEntries: 'diaryEntriesAdded',
};

function emptyResult(): ImportBackupResult {
  return {
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
}

function tableRef(name: BackupTableKey) {
  return db[name];
}

function rowId(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}

type AnyTable = {
  bulkPut: (items: unknown[]) => Promise<unknown>;
  bulkDelete: (keys: string[]) => Promise<unknown>;
  clear: () => Promise<unknown>;
  toCollection: () => { primaryKeys: () => Promise<unknown[]> };
};

function asTable(name: BackupTableKey): AnyTable {
  return tableRef(name) as unknown as AnyTable;
}

async function upsertRows(
  name: BackupTableKey,
  rows: unknown[],
): Promise<number> {
  if (!rows.length) return 0;
  const table = asTable(name);
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await table.bulkPut(rows.slice(i, i + UPSERT_CHUNK));
  }
  return rows.length;
}

/** Delete primary keys not present in `keep`. */
async function pruneTable(name: BackupTableKey, keep: Set<string>): Promise<void> {
  const table = asTable(name);
  const keys = (await table.toCollection().primaryKeys()) as string[];
  const drop: string[] = [];
  for (const key of keys) {
    if (!keep.has(String(key))) drop.push(String(key));
  }
  for (let i = 0; i < drop.length; i += UPSERT_CHUNK) {
    await table.bulkDelete(drop.slice(i, i + UPSERT_CHUNK));
  }
}

export type BackupImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'uri'; uri: string }
  | { kind: 'text'; text: string };

export interface StreamImportBackupOptions extends ImportBackupOptions {
  onProgress?: (label: string) => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** UTF-8 text chunks from a browser File (streaming when supported). */
export async function* fileTextChunks(file: File): AsyncGenerator<string> {
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          const tail = decoder.decode();
          if (tail) yield tail;
          break;
        }
        yield decoder.decode(value, { stream: true });
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
    return;
  }
  // Rare fallback — still one shot, but only used when stream() is missing.
  yield await file.text();
}

/** UTF-8 text chunks from a native content URI via FileSaver.readChunk. */
export async function* uriTextChunks(uri: string): AsyncGenerator<string> {
  const { handle } = await FileSaver.beginRead({ uri });
  const decoder = new TextDecoder('utf-8');
  try {
    for (;;) {
      const { data, done } = await FileSaver.readChunk({ handle });
      if (data) {
        yield decoder.decode(base64ToBytes(data), { stream: !done });
      }
      if (done) {
        const tail = decoder.decode();
        if (tail) yield tail;
        break;
      }
    }
  } finally {
    try {
      await FileSaver.endRead({ handle });
    } catch {
      // ignore
    }
  }
}

async function chunksForSource(
  source: BackupImportSource,
): Promise<AsyncIterable<string>> {
  if (source.kind === 'file') return fileTextChunks(source.file);
  if (source.kind === 'uri') return uriTextChunks(source.uri);
  return stringChunks(source.text, 256 * 1024);
}

/**
 * Stream-import a backup. Merge upserts by id. Replace upserts then prunes
 * each table down to imported ids (and clears empty/missing tables), so a
 * mid-import crash never leaves a wiped-empty DB the way clear-then-write did.
 */
export async function importBackupStream(
  source: BackupImportSource,
  opts: StreamImportBackupOptions,
): Promise<ImportBackupResult> {
  const result = emptyResult();
  const preservedFolder =
    opts.mode === 'replace' ? await getBackupFolder() : null;

  let marker: string | null = null;
  let version: number | null = null;
  let settings: AppSettings | null = null;
  const seenTables = new Set<BackupTableKey>();
  const keepIds = new Map<BackupTableKey, Set<string>>();

  const report = (label: string) => {
    opts.onProgress?.(label);
  };

  try {
    report('正在解析备份…');
    const chunks = await chunksForSource(source);

    for await (const ev of parseJsonObjectStream(chunks, {
      arrayBatchSize: 50,
    })) {
      if (ev.type === 'value') {
        if (ev.key === '__lisse') {
          marker = typeof ev.value === 'string' ? ev.value : null;
          if (marker !== 'backup') {
            throw new Error('不是 Lisse 的备份文件');
          }
        } else if (ev.key === 'version') {
          version = typeof ev.value === 'number' ? ev.value : null;
        } else if (ev.key === 'settings') {
          if (ev.value && typeof ev.value === 'object') {
            settings = ev.value as AppSettings;
          }
        }
        // exportedAt and unknown scalars ignored
        continue;
      }

      if (ev.type === 'array-start') {
        if (!TABLE_KEY_SET.has(ev.key)) continue;
        const name = ev.key as BackupTableKey;
        seenTables.add(name);
        if (!keepIds.has(name)) keepIds.set(name, new Set());
        report(`导入 ${name}…`);
        continue;
      }

      if (ev.type === 'array-items') {
        if (!TABLE_KEY_SET.has(ev.key)) continue;
        const name = ev.key as BackupTableKey;
        const keep = keepIds.get(name) ?? new Set<string>();
        keepIds.set(name, keep);
        for (const row of ev.items) {
          const id = rowId(row);
          if (id) keep.add(id);
        }
        const n = await upsertRows(name, ev.items);
        const field = RESULT_FIELD[name];
        if (field !== 'settingsApplied') {
          (result[field] as number) += n;
        }
        report(`导入 ${name}…已写入 ${result[field]} 条`);
        await yieldToUi();
        continue;
      }
    }

    if (marker !== 'backup') {
      throw new Error('不是 Lisse 的备份文件');
    }
    if (version != null && version !== 4 && version !== 5) {
      throw new Error(`不支持的备份版本：${version}`);
    }

    if (opts.mode === 'replace') {
      report('清理未包含在备份中的旧数据…');
      for (const name of BACKUP_TABLE_KEYS) {
        if (!seenTables.has(name)) {
          await asTable(name).clear();
          continue;
        }
        const keep = keepIds.get(name);
        if (!keep || keep.size === 0) {
          await asTable(name).clear();
        } else {
          await pruneTable(name, keep);
        }
        await yieldToUi();
      }

      // Match legacy replace: wipe kv then re-apply settings from the bundle.
      await db.kv.clear();
      if (settings) {
        await saveSettings(settings);
        result.settingsApplied = true;
      }
    } else if (settings) {
      await saveSettings(settings);
      result.settingsApplied = true;
    }
  } catch (err) {
    // If replace wiped kv mid-way, try to put the folder grant back.
    if (preservedFolder) {
      try {
        await setBackupFolder(preservedFolder);
      } catch {
        // ignore
      }
    }
    throw new Error(formatStorageError(err), { cause: err });
  }

  if (preservedFolder) {
    try {
      await setBackupFolder(preservedFolder);
    } catch {
      // Non-fatal: data restore already committed.
    }
  }

  report('导入完成');
  return result;
}
