import { db } from '../db';
import type { Artifact, ArtifactCollection, SavedArtifact } from '../types';
import { newId } from './id';

const DEFAULT_COLORS = [
  '#5c3d7a',
  '#6b4a8a',
  '#4a3a6a',
  '#7a5588',
  '#554070',
];

export async function listCollections(): Promise<ArtifactCollection[]> {
  return db.artifactCollections.orderBy('updatedAt').reverse().toArray();
}

export async function createCollection(opts: {
  name: string;
  note?: string;
  color?: string;
}): Promise<ArtifactCollection> {
  const name = opts.name.trim();
  if (!name) throw new Error('合集名字不能为空');
  const now = Date.now();
  const count = await db.artifactCollections.count();
  const row: ArtifactCollection = {
    id: newId(),
    name,
    note: opts.note?.trim() || undefined,
    color: opts.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length],
    createdAt: now,
    updatedAt: now,
  };
  await db.artifactCollections.add(row);
  return row;
}

export async function renameCollection(
  id: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('合集名字不能为空');
  await db.artifactCollections.update(id, {
    name: trimmed,
    updatedAt: Date.now(),
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction('rw', db.artifactCollections, db.savedArtifacts, async () => {
    await db.savedArtifacts.where({ collectionId: id }).delete();
    await db.artifactCollections.delete(id);
  });
}

export async function listSavedInCollection(
  collectionId: string,
): Promise<SavedArtifact[]> {
  const rows = await db.savedArtifacts.where({ collectionId }).toArray();
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

export async function countInCollection(collectionId: string): Promise<number> {
  return db.savedArtifacts.where({ collectionId }).count();
}

export async function isArtifactInCollection(
  collectionId: string,
  artifactId: string,
): Promise<boolean> {
  const hit = await db.savedArtifacts
    .where('[collectionId+artifactId]')
    .equals([collectionId, artifactId])
    .first();
  return !!hit;
}

export async function saveArtifactToCollection(opts: {
  collectionId: string;
  artifact: Artifact;
  sourceConversationId?: string;
  sourceMessageId?: string;
  note?: string;
}): Promise<SavedArtifact> {
  const existing = await db.savedArtifacts
    .where('[collectionId+artifactId]')
    .equals([opts.collectionId, opts.artifact.id])
    .first();
  if (existing) return existing;

  const now = Date.now();
  const row: SavedArtifact = {
    id: newId(),
    collectionId: opts.collectionId,
    artifactId: opts.artifact.id,
    name: opts.artifact.name,
    content: opts.artifact.content,
    mimeType: opts.artifact.mimeType,
    sourceConversationId: opts.sourceConversationId,
    sourceMessageId: opts.sourceMessageId,
    note: opts.note?.trim() || undefined,
    createdAt: now,
  };
  await db.transaction('rw', db.savedArtifacts, db.artifactCollections, async () => {
    await db.savedArtifacts.add(row);
    await db.artifactCollections.update(opts.collectionId, { updatedAt: now });
  });
  return row;
}

export async function removeSavedArtifact(id: string): Promise<void> {
  const row = await db.savedArtifacts.get(id);
  if (!row) return;
  await db.transaction('rw', db.savedArtifacts, db.artifactCollections, async () => {
    await db.savedArtifacts.delete(id);
    await db.artifactCollections.update(row.collectionId, {
      updatedAt: Date.now(),
    });
  });
}

/** Which collection ids already contain this artifact. */
export async function collectionsContaining(
  artifactId: string,
): Promise<string[]> {
  const rows = await db.savedArtifacts.where({ artifactId }).toArray();
  return rows.map((r) => r.collectionId);
}
