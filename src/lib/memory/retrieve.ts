import { db, getSettings } from '../../db';
import type { Endpoint, MemoryFact } from '../../types';
import { embed } from '../../api/embedding';

export interface RetrievedFact {
  fact: MemoryFact;
  score: number;
  /** Pinned facts always retrieved with score=1; flagged for transparency. */
  pinned: boolean;
}

export interface RetrieveOptions {
  /** Max non-pinned facts to return; pinned facts are always included on top. */
  topK?: number;
  /** Minimum cosine similarity (0..1); below this is dropped. */
  threshold?: number;
}

/**
 * Retrieve relevant facts for the given query, scoped to a persona.
 * If embeddings aren't configured, returns only pinned facts.
 */
export async function retrieveFacts(
  personaId: string,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedFact[]> {
  const settings = await getSettings();
  const topK = opts.topK ?? settings.retrievalTopK;
  const threshold = opts.threshold ?? settings.retrievalThreshold;

  const allFacts = await db.memoryFacts
    .where({ personaId })
    .filter((f) => !f.archived)
    .toArray();

  if (allFacts.length === 0) return [];

  const pinned = allFacts.filter((f) => f.pinned);
  const candidates = allFacts.filter((f) => !f.pinned);

  const scored: RetrievedFact[] = pinned.map((f) => ({
    fact: f,
    score: 1,
    pinned: true,
  }));

  // If we don't have an embedding endpoint configured, return only pinned.
  const ep = settings.embeddingEndpointId
    ? await db.endpoints.get(settings.embeddingEndpointId)
    : undefined;
  const model = settings.embeddingModel;
  if (!ep || !model || candidates.length === 0) return scored;

  // Embed the query.
  let queryVec: number[];
  try {
    const result = await embed({ endpoint: ep, model, inputs: [query] });
    queryVec = result.vectors[0];
  } catch {
    // Embedding failed: degrade gracefully to pinned-only.
    return scored;
  }

  const ranked = candidates
    .map((f) => {
      // Only score facts whose embedding matches the configured model.
      if (f.embeddingModel !== model) return { fact: f, score: -1, pinned: false };
      const score = dot(queryVec, f.embedding);
      return { fact: f, score, pinned: false };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return [...scored, ...ranked];
}

/** Dot product; assumes both vectors are L2-normalized (so dot == cosine). */
function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Format retrieved facts into a string block to inject into the system prompt.
 */
export function formatFactsBlock(facts: RetrievedFact[]): string {
  if (facts.length === 0) return '';
  const lines = facts.map((f) => {
    const tag = f.pinned ? '📌' : '';
    return `- ${tag}${f.fact.text}`;
  });
  return `# 你已经知道的事（关于她，关于你们）\n${lines.join('\n')}\n\n这些是你之前积累的记忆，不是现在新听到的。请自然地用，不要刻意复述。`;
}

/**
 * Fetch a persona's pinned facts (long-term memory) with DETERMINISTIC
 * ordering. Pinned facts change only when the user pins/unpins, so they are
 * stable enough to live in a cached system block — but the cache prefix is
 * matched byte-for-byte, so the ordering must be identical on every request.
 * We sort by createdAt then id; DB iteration order alone is not guaranteed.
 */
export async function getPinnedFacts(personaId: string): Promise<MemoryFact[]> {
  const pinned = await db.memoryFacts
    .where({ personaId })
    .filter((f) => !!f.pinned && !f.archived)
    .toArray();
  pinned.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return pinned;
}

/**
 * Format pinned facts as the stable "long-term memory" system layer.
 * (The tutorial puts 长期记忆 inside BP1 — cached, not re-sent uncached.)
 */
export function formatPinnedFactsBlock(facts: MemoryFact[]): string {
  if (facts.length === 0) return '';
  const lines = facts.map((f) => `- ${f.text}`);
  return `# 长期记忆（关于她，关于你们，一直记得的事）\n${lines.join('\n')}\n\n这些是你长期积累、反复确认过的记忆。请自然地用，不要刻意复述。`;
}

export async function checkEndpointSupportsEmbedding(ep: Endpoint): Promise<boolean> {
  return ep.format === 'openai';
}
