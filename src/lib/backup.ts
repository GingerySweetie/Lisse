import { db, getSettings, saveSettings } from '../db';
import type {
  AppSettings,
  Conversation,
  Endpoint,
  Message,
  Persona,
} from '../types';

export interface BackupBundle {
  /** Format identifier for sanity-checking. */
  __lisse: 'backup';
  /** Schema version of the bundle (not Dexie's). */
  version: 1;
  exportedAt: number;
  settings: AppSettings;
  endpoints: Endpoint[];
  personas: Persona[];
  conversations: Conversation[];
  messages: Message[];
}

export async function exportBackup(): Promise<BackupBundle> {
  const [settings, endpoints, personas, conversations, messages] =
    await Promise.all([
      getSettings(),
      db.endpoints.toArray(),
      db.personas.toArray(),
      db.conversations.toArray(),
      db.messages.toArray(),
    ]);
  return {
    __lisse: 'backup',
    version: 1,
    exportedAt: Date.now(),
    settings,
    endpoints,
    personas,
    conversations,
    messages,
  };
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
  const bundle = raw as BackupBundle;

  if (opts.mode === 'replace') {
    await db.transaction(
      'rw',
      [db.endpoints, db.personas, db.conversations, db.messages, db.kv],
      async () => {
        await db.endpoints.clear();
        await db.personas.clear();
        await db.conversations.clear();
        await db.messages.clear();
        await db.kv.clear();
      },
    );
  }

  const result: ImportBackupResult = {
    endpointsAdded: 0,
    personasAdded: 0,
    conversationsAdded: 0,
    messagesAdded: 0,
    settingsApplied: false,
  };

  await db.transaction(
    'rw',
    [db.endpoints, db.personas, db.conversations, db.messages],
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
