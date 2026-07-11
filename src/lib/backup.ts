import { db, getSettings, saveSettings } from '../db';
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

const LAST_BACKUP_AT_KEY = 'last_backup_at';

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
  ]);

  const now = Date.now();
  // Record the time of this export so the UI can show "last backed up N ago".
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
  };
}

/** Returns the Unix-ms timestamp of the last completed backup, or null. */
export async function getLastBackupAt(): Promise<number | null> {
  const row = await db.kv.get(LAST_BACKUP_AT_KEY);
  return row ? (row.value as number) : null;
}

export interface ImportBackupOptions {
  /** 'merge' keeps existing data and skips duplicates by id. 'replace' wipes first. */
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
        await db.kv.clear();
      },
    );
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
    settingsApplied: false,
  };

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
    ],
    async () => {
      for (const e of bundle.endpoints ?? []) {
        const exists = await db.endpoints.get(e.id);
        if (exists && opts.mode === 'merge') continue;
        await db.endpoints.put(e);
        result.endpointsAdded++;
      }
      for (const p of bundle.personas ?? []) {
        const exists = await db.personas.get(p.id);
        if (exists && opts.mode === 'merge') continue;
        await db.personas.put(p);
        result.personasAdded++;
      }
      for (const c of bundle.conversations ?? []) {
        const exists = await db.conversations.get(c.id);
        if (exists && opts.mode === 'merge') continue;
        await db.conversations.put(c);
        result.conversationsAdded++;
      }
      for (const m of bundle.messages ?? []) {
        const exists = await db.messages.get(m.id);
        if (exists && opts.mode === 'merge') continue;
        await db.messages.put(m);
        result.messagesAdded++;
      }
      for (const f of bundle.memoryFacts ?? []) {
        const exists = await db.memoryFacts.get(f.id);
        if (exists && opts.mode === 'merge') continue;
        await db.memoryFacts.put(f);
        result.memoryFactsAdded++;
      }
      for (const s of bundle.writingStyles ?? []) {
        const exists = await db.writingStyles.get(s.id);
        if (exists && opts.mode === 'merge') continue;
        await db.writingStyles.put(s);
        result.writingStylesAdded++;
      }
      for (const b of bundle.books ?? []) {
        const exists = await db.books.get(b.id);
        if (exists && opts.mode === 'merge') continue;
        await db.books.put(b);
        result.booksAdded++;
      }
      for (const bm of bundle.bookmarks ?? []) {
        const exists = await db.bookmarks.get(bm.id);
        if (exists && opts.mode === 'merge') continue;
        await db.bookmarks.put(bm);
        result.bookmarksAdded++;
      }
      for (const mcp of bundle.mcpServers ?? []) {
        const exists = await db.mcpServers.get(mcp.id);
        if (exists && opts.mode === 'merge') continue;
        await db.mcpServers.put(mcp);
        result.mcpServersAdded++;
      }
      for (const bill of bundle.bills ?? []) {
        const exists = await db.bills.get(bill.id);
        if (exists && opts.mode === 'merge') continue;
        await db.bills.put(bill);
        result.billsAdded++;
      }
      for (const pe of bundle.periodEntries ?? []) {
        const exists = await db.periodEntries.get(pe.id);
        if (exists && opts.mode === 'merge') continue;
        await db.periodEntries.put(pe);
        result.periodEntriesAdded++;
      }
      for (const we of bundle.weightEntries ?? []) {
        const exists = await db.weightEntries.get(we.id);
        if (exists && opts.mode === 'merge') continue;
        await db.weightEntries.put(we);
        result.weightEntriesAdded++;
      }
      for (const bb of bundle.browserBookmarks ?? []) {
        const exists = await db.browserBookmarks.get(bb.id);
        if (exists && opts.mode === 'merge') continue;
        await db.browserBookmarks.put(bb);
        result.browserBookmarksAdded++;
      }
      for (const bs of bundle.browserScripts ?? []) {
        const exists = await db.browserScripts.get(bs.id);
        if (exists && opts.mode === 'merge') continue;
        await db.browserScripts.put(bs);
        result.browserScriptsAdded++;
      }
      for (const mc of bundle.musicCredentials ?? []) {
        const exists = await db.musicCredentials.get(mc.id);
        if (exists && opts.mode === 'merge') continue;
        await db.musicCredentials.put(mc);
        result.musicCredentialsAdded++;
      }
      for (const mh of bundle.musicHistory ?? []) {
        const exists = await db.musicHistory.get(mh.id);
        if (exists && opts.mode === 'merge') continue;
        await db.musicHistory.put(mh);
        result.musicHistoryAdded++;
      }
      for (const cp of bundle.circlePosts ?? []) {
        const exists = await db.circlePosts.get(cp.id);
        if (exists && opts.mode === 'merge') continue;
        await db.circlePosts.put(cp);
        result.circlePostsAdded++;
      }
      for (const cr of bundle.circleReactions ?? []) {
        const exists = await db.circleReactions.get(cr.id);
        if (exists && opts.mode === 'merge') continue;
        await db.circleReactions.put(cr);
        result.circleReactionsAdded++;
      }
      for (const hc of bundle.healthComments ?? []) {
        const exists = await db.healthComments.get(hc.id);
        if (exists && opts.mode === 'merge') continue;
        await db.healthComments.put(hc);
        result.healthCommentsAdded++;
      }
      for (const hd of bundle.healthDaily ?? []) {
        const exists = await db.healthDaily.get(hd.id);
        if (exists && opts.mode === 'merge') continue;
        await db.healthDaily.put(hd);
        result.healthDailyAdded++;
      }
    },
  );

  if (bundle.settings) {
    await saveSettings(bundle.settings);
    result.settingsApplied = true;
  }

  return result;
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestedBackupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `lisse-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}
