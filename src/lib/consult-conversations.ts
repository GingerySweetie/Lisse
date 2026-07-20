import { db } from '../db';
import { CONSULT } from './consult-theme';
import { newId } from './id';
import type { Conversation } from '../types';

const ACTIVE_KEY = 'lisse.consult.activeConvId';

export function getActiveConsultConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveConsultConversationId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export async function listConsultConversations(): Promise<Conversation[]> {
  const rows = await db.conversations
    .where({ room: 'consult' })
    .sortBy('updatedAt');
  return rows.reverse();
}

export async function createConsultConversation(opts?: {
  title?: string;
  copyFrom?: Conversation | null;
}): Promise<Conversation> {
  const now = Date.now();
  const from = opts?.copyFrom;
  const conv: Conversation = {
    id: newId(),
    title: opts?.title ?? '新会谈',
    currentLeafId: null,
    room: 'consult',
    source: 'native',
    accentColor: from?.accentColor ?? CONSULT.accent,
    defaultEndpointId: from?.defaultEndpointId,
    defaultModel: from?.defaultModel,
    personaId: from?.personaId,
    styleId: from?.styleId,
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  setActiveConsultConversationId(conv.id);
  return conv;
}

/**
 * Resolve the active consult conversation: prefer persisted id, else most
 * recent, else create a fresh one. Always returns a valid conversation.
 */
export async function ensureActiveConsultConversation(): Promise<Conversation> {
  const preferred = getActiveConsultConversationId();
  if (preferred) {
    const hit = await db.conversations.get(preferred);
    if (hit?.room === 'consult') return hit;
  }
  const all = await listConsultConversations();
  if (all.length > 0) {
    setActiveConsultConversationId(all[0].id);
    return all[0];
  }
  return createConsultConversation({ title: '精神分析 · 咨询室' });
}

/** Derive a short title from the first user line (mirrors chat deriveTitle). */
export function deriveConsultTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim()) ?? text;
  const trimmed = firstLine.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed || '新会谈';
}

export function isDefaultConsultTitle(title: string): boolean {
  return title === '新会谈' || title === '精神分析 · 咨询室' || !title.trim();
}
