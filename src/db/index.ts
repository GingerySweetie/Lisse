import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Conversation,
  Endpoint,
  Message,
} from '../types';

interface KVRow {
  key: string;
  value: unknown;
}

class LisseDB extends Dexie {
  endpoints!: EntityTable<Endpoint, 'id'>;
  conversations!: EntityTable<Conversation, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  kv!: EntityTable<KVRow, 'key'>;

  constructor() {
    super('lisse');
    this.version(1).stores({
      endpoints: 'id, name, format, createdAt',
      conversations: 'id, updatedAt, createdAt, source',
      messages: 'id, conversationId, parentId, createdAt, [conversationId+createdAt]',
      kv: 'key',
    });
  }
}

export const db = new LisseDB();

const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  defaultEndpointId: null,
  defaultModel: null,
  theme: 'light',
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.kv.get(SETTINGS_KEY);
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...patch };
  await db.kv.put({ key: SETTINGS_KEY, value: next });
  return next;
}
