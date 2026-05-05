import type { Endpoint } from '../types';

export interface EmbeddingRequest {
  endpoint: Endpoint;
  model: string;
  inputs: string[];
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  /** One vector per input, in the same order. */
  vectors: number[][];
  model: string;
  /** Tokens used (if reported). */
  tokens?: number;
}

/**
 * OpenAI-compatible /v1/embeddings call.
 * Most relays (AIHubMix, SiliconFlow, OpenAI itself) speak this exact format.
 * Anthropic native does NOT have an embeddings endpoint, so format=anthropic
 * endpoints can't serve embeddings.
 */
export async function embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
  if (req.endpoint.format !== 'openai') {
    throw new Error(
      `endpoint "${req.endpoint.name}" is anthropic format; embeddings only supported on OpenAI-compatible endpoints`,
    );
  }

  const url = joinUrl(req.endpoint.baseUrl, '/embeddings');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (req.endpoint.authStyle === 'x-api-key') {
    headers['x-api-key'] = req.endpoint.apiKey;
  } else {
    headers.Authorization = `Bearer ${req.endpoint.apiKey}`;
  }

  const body = {
    model: req.model,
    input: req.inputs,
    encoding_format: 'float',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${response.status} ${response.statusText}${text ? `: ${truncate(text, 400)}` : ''}`,
    );
  }
  const json = (await response.json()) as EmbeddingResponse;
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('unexpected embeddings response: missing "data"');
  }
  // Sort by index to be safe; some relays return out of order.
  const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = sorted.map((d) => normalize(toNumberArray(d.embedding)));
  return {
    vectors,
    model: json.model ?? req.model,
    tokens: json.usage?.total_tokens,
  };
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[] | string; index?: number }>;
  model?: string;
  usage?: { total_tokens?: number };
}

function toNumberArray(v: number[] | string): number[] {
  if (Array.isArray(v)) return v;
  // Some providers return base64; not supporting that path for now.
  throw new Error(
    'embedding returned in non-array format (likely base64); set encoding_format=float',
  );
}

/** L2-normalize so we can use plain dot-product as cosine similarity later. */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v.slice();
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
