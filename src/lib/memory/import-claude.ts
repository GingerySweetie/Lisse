/**
 * Persist parsed Claude memories into memoryFacts for a persona.
 */
import { embed } from '../../api/embedding';
import { db, getSettings } from '../../db';
import type { MemoryFact } from '../../types';
import { newId } from '../id';
import {
  parseClaudeMemoriesExport,
  type ClaudeMemoryAtom,
} from './claude-import';

export interface ImportClaudeMemoriesOpts {
  personaId: string;
  /** Parsed JSON (object or array). */
  raw: unknown;
  /** Pin imported instruction/personal atoms (default true for parser pins). */
  respectPinned?: boolean;
  /** Skip atoms whose text already exists (exact match, active facts). */
  skipExactDupes?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: {
    phase: 'parse' | 'embed' | 'write';
    done: number;
    total: number;
  }) => void;
}

export interface ImportClaudeMemoriesResult {
  parsed: number;
  added: number;
  skippedDupes: number;
  embedded: number;
  projectCount: number;
  accountUuid?: string;
}

export async function importClaudeMemories(
  opts: ImportClaudeMemoriesOpts,
): Promise<ImportClaudeMemoriesResult> {
  opts.onProgress?.({ phase: 'parse', done: 0, total: 1 });
  const parsed = parseClaudeMemoriesExport(opts.raw);
  let atoms = parsed.atoms;

  let skippedDupes = 0;
  if (opts.skipExactDupes !== false) {
    const existing = await db.memoryFacts
      .where({ personaId: opts.personaId })
      .filter((f) => !f.archived)
      .toArray();
    const texts = new Set(existing.map((f) => f.text.trim()));
    const kept: ClaudeMemoryAtom[] = [];
    for (const a of atoms) {
      if (texts.has(a.text.trim())) {
        skippedDupes += 1;
        continue;
      }
      kept.push(a);
      texts.add(a.text.trim());
    }
    atoms = kept;
  }

  opts.onProgress?.({ phase: 'embed', done: 0, total: atoms.length });

  const settings = await getSettings();
  const ep = settings.embeddingEndpointId
    ? await db.endpoints.get(settings.embeddingEndpointId)
    : undefined;
  const model = settings.embeddingModel;
  const canEmbed = !!(ep && model);

  const vectors: (number[] | null)[] = new Array(atoms.length).fill(null);
  let embedded = 0;
  if (canEmbed && atoms.length > 0) {
    const CHUNK = 32;
    for (let i = 0; i < atoms.length; i += CHUNK) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const slice = atoms.slice(i, i + CHUNK);
      try {
        const { vectors: vs } = await embed({
          endpoint: ep!,
          model: model!,
          inputs: slice.map((a) => a.text),
          signal: opts.signal,
        });
        for (let j = 0; j < vs.length; j++) {
          vectors[i + j] = vs[j] ?? null;
          if (vs[j]) embedded += 1;
        }
      } catch {
        // Keep empty embeddings — facts still import; retrieval needs re-embed later.
      }
      opts.onProgress?.({
        phase: 'embed',
        done: Math.min(i + CHUNK, atoms.length),
        total: atoms.length,
      });
    }
  }

  opts.onProgress?.({ phase: 'write', done: 0, total: atoms.length });
  const now = Date.now();
  const rows: MemoryFact[] = atoms.map((a, i) => ({
    id: newId(),
    personaId: opts.personaId,
    conversationId: 'claude-memory-import',
    messageId: a.source,
    text: a.text,
    category: a.category,
    embedding: vectors[i] ?? [],
    embeddingModel: vectors[i] ? model! : '',
    pinned: opts.respectPinned === false ? false : a.pinned,
    createdAt: now + i,
    updatedAt: now + i,
  }));

  const WRITE_CHUNK = 100;
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await db.memoryFacts.bulkAdd(rows.slice(i, i + WRITE_CHUNK));
    opts.onProgress?.({
      phase: 'write',
      done: Math.min(i + WRITE_CHUNK, rows.length),
      total: rows.length,
    });
  }

  return {
    parsed: parsed.atoms.length,
    added: rows.length,
    skippedDupes,
    embedded,
    projectCount: parsed.projectCount,
    accountUuid: parsed.accountUuid,
  };
}
