/**
 * Lightweight text relevance when embeddings aren't available.
 * Pure — no imports — so node --test can load it directly.
 */

/** Tokenize a query for keyword matching (CJK bigrams + latin words). */
export function tokenizeForMemory(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens: string[] = [];
  const latin = q.match(/[a-z0-9_]{2,}/g);
  if (latin) tokens.push(...latin);
  // CJK / other non-space runs → overlapping bigrams
  const runs = q.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{2,}/g);
  if (runs) {
    for (const run of runs) {
      if (run.length === 2) tokens.push(run);
      else {
        for (let i = 0; i < run.length - 1; i++) {
          tokens.push(run.slice(i, i + 2));
        }
      }
    }
  }
  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Score how well `text` matches `query` in [0, 1].
 * Exact/substring containment scores high; otherwise token hit ratio.
 */
export function keywordMemoryScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.trim().toLowerCase();
  if (!q || !t) return 0;
  if (t.includes(q) || q.includes(t)) return 1;
  const tokens = tokenizeForMemory(q);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hits += 1;
  }
  return hits / tokens.length;
}
