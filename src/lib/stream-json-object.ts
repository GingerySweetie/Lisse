/**
 * Streaming top-level JSON object walker for Lisse backup files.
 *
 * Backup shape is always one object whose values are scalars, a settings
 * object, or arrays of row objects. This parser never materializes the full
 * document — it yields complete values / row batches as bytes arrive.
 */

export type JsonObjectStreamEvent =
  | { type: 'start' }
  | { type: 'key'; key: string }
  | { type: 'value'; key: string; value: unknown }
  | {
      type: 'array-start';
      key: string;
    }
  | {
      type: 'array-items';
      key: string;
      items: unknown[];
    }
  | {
      type: 'array-end';
      key: string;
      count: number;
    }
  | { type: 'end' };

export interface ParseJsonObjectStreamOptions {
  /** Emit array rows in batches of this size (default 50). */
  arrayBatchSize?: number;
}

/**
 * Extract one complete JSON value starting at `start` in `text`.
 * Returns the end index (exclusive) or -1 if the value is incomplete.
 */
export function findJsonValueEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && isWs(text.charCodeAt(i))) i++;
  if (i >= text.length) return -1;

  const c = text.charCodeAt(i);
  // string
  if (c === 34 /* " */) {
    i++;
    while (i < text.length) {
      const ch = text.charCodeAt(i);
      if (ch === 92 /* \ */) {
        i += 2;
        continue;
      }
      if (ch === 34) return i + 1;
      i++;
    }
    return -1;
  }

  // object / array
  if (c === 123 /* { */ || c === 91 /* [ */) {
    const open = c;
    const close = c === 123 ? 125 /* } */ : 93 /* ] */;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === 92) {
          esc = true;
          continue;
        }
        if (ch === 34) inStr = false;
        continue;
      }
      if (ch === 34) {
        inStr = true;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }

  // number / literal (true|false|null)
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (
      ch === 44 /* , */ ||
      ch === 125 /* } */ ||
      ch === 93 /* ] */ ||
      isWs(ch)
    ) {
      break;
    }
    i++;
  }
  return i > start ? i : -1;
}

function isWs(ch: number): boolean {
  return ch === 32 || ch === 9 || ch === 10 || ch === 13;
}

function skipWs(text: string, i: number): number {
  while (i < text.length && isWs(text.charCodeAt(i))) i++;
  return i;
}

/**
 * Walk a top-level JSON object from async text chunks.
 * Array-valued keys are emitted as batched items; other keys as a single value.
 */
export async function* parseJsonObjectStream(
  chunks: AsyncIterable<string>,
  opts: ParseJsonObjectStreamOptions = {},
): AsyncGenerator<JsonObjectStreamEvent> {
  const batchSize = Math.max(1, opts.arrayBatchSize ?? 50);
  let buf = '';
  let pos = 0;
  let eof = false;

  const compact = () => {
    if (pos > 64 * 1024) {
      buf = buf.slice(pos);
      pos = 0;
    }
  };

  const pull = chunks[Symbol.asyncIterator]();

  const fill = async (): Promise<boolean> => {
    if (eof) return false;
    const next = await pull.next();
    if (next.done) {
      eof = true;
      return false;
    }
    buf += next.value;
    return true;
  };

  const peekNonWs = async (): Promise<number> => {
    for (;;) {
      pos = skipWs(buf, pos);
      if (pos < buf.length) return buf.charCodeAt(pos);
      if (!(await fill())) return -1;
    }
  };

  const expectChar = async (code: number, label: string): Promise<void> => {
    const ch = await peekNonWs();
    if (ch !== code) {
      throw new Error(`备份 JSON 格式不对：期望 ${label}`);
    }
    pos++;
  };

  const readString = async (): Promise<string> => {
    await expectChar(34, '"');
    const start = pos;
    for (;;) {
      while (pos < buf.length) {
        const ch = buf.charCodeAt(pos);
        if (ch === 92) {
          pos += 2;
          continue;
        }
        if (ch === 34) {
          const raw = buf.slice(start - 1, pos + 1);
          pos++;
          return JSON.parse(raw) as string;
        }
        pos++;
      }
      if (!(await fill())) {
        throw new Error('备份 JSON 不完整：字符串未结束');
      }
    }
  };

  const readValue = async (): Promise<unknown> => {
    for (;;) {
      pos = skipWs(buf, pos);
      const end = findJsonValueEnd(buf, pos);
      if (end >= 0) {
        const raw = buf.slice(pos, end);
        pos = end;
        compact();
        return JSON.parse(raw) as unknown;
      }
      if (!(await fill())) {
        throw new Error('备份 JSON 不完整：值未结束');
      }
    }
  };

  // Open object
  await expectChar(123, '{');
  yield { type: 'start' };

  let first = true;
  for (;;) {
    const next = await peekNonWs();
    if (next === 125 /* } */) {
      pos++;
      yield { type: 'end' };
      return;
    }
    if (next < 0) {
      throw new Error('备份 JSON 不完整：对象未结束');
    }
    if (!first) {
      await expectChar(44, ',');
    }
    first = false;

    const key = await readString();
    yield { type: 'key', key };
    await expectChar(58, ':');

    const valueStart = await peekNonWs();
    if (valueStart === 91 /* [ */) {
      // Stream array items one JSON value at a time.
      pos++; // consume '['
      yield { type: 'array-start', key };
      let count = 0;
      let batch: unknown[] = [];
      let arrayFirst = true;

      for (;;) {
        const ch = await peekNonWs();
        if (ch === 93 /* ] */) {
          pos++;
          if (batch.length) {
            yield { type: 'array-items', key, items: batch };
            batch = [];
          }
          yield { type: 'array-end', key, count };
          compact();
          break;
        }
        if (ch < 0) {
          throw new Error(`备份 JSON 不完整：数组 ${key} 未结束`);
        }
        if (!arrayFirst) {
          await expectChar(44, ',');
        }
        arrayFirst = false;
        const item = await readValue();
        batch.push(item);
        count++;
        if (batch.length >= batchSize) {
          yield { type: 'array-items', key, items: batch };
          batch = [];
          compact();
        }
      }
    } else {
      const value = await readValue();
      yield { type: 'value', key, value };
      compact();
    }
  }
}

export type JsonArrayStreamEvent =
  | { type: 'start' }
  | { type: 'items'; items: unknown[] }
  | { type: 'end'; count: number };

/**
 * Walk a top-level JSON array from async text chunks.
 * Used for ChatGPT / Claude `conversations.json` exports (flat `[...]`).
 * Never materializes the full array — emits batched items as bytes arrive.
 */
export async function* parseJsonArrayStream(
  chunks: AsyncIterable<string>,
  opts: ParseJsonObjectStreamOptions = {},
): AsyncGenerator<JsonArrayStreamEvent> {
  const batchSize = Math.max(1, opts.arrayBatchSize ?? 50);
  let buf = '';
  let pos = 0;
  let eof = false;

  const compact = () => {
    if (pos > 64 * 1024) {
      buf = buf.slice(pos);
      pos = 0;
    }
  };

  const pull = chunks[Symbol.asyncIterator]();

  const fill = async (): Promise<boolean> => {
    if (eof) return false;
    const next = await pull.next();
    if (next.done) {
      eof = true;
      return false;
    }
    buf += next.value;
    return true;
  };

  const peekNonWs = async (): Promise<number> => {
    for (;;) {
      pos = skipWs(buf, pos);
      if (pos < buf.length) return buf.charCodeAt(pos);
      if (!(await fill())) return -1;
    }
  };

  const expectChar = async (code: number, label: string): Promise<void> => {
    const ch = await peekNonWs();
    if (ch !== code) {
      throw new Error(`导出 JSON 格式不对：期望 ${label}`);
    }
    pos++;
  };

  const readValue = async (): Promise<unknown> => {
    for (;;) {
      pos = skipWs(buf, pos);
      const end = findJsonValueEnd(buf, pos);
      if (end >= 0) {
        const raw = buf.slice(pos, end);
        pos = end;
        compact();
        return JSON.parse(raw) as unknown;
      }
      if (!(await fill())) {
        throw new Error('导出 JSON 不完整：值未结束');
      }
    }
  };

  await expectChar(91, '[');
  yield { type: 'start' };

  let count = 0;
  let batch: unknown[] = [];
  let first = true;

  for (;;) {
    const ch = await peekNonWs();
    if (ch === 93 /* ] */) {
      pos++;
      if (batch.length) {
        yield { type: 'items', items: batch };
        batch = [];
      }
      yield { type: 'end', count };
      return;
    }
    if (ch < 0) {
      throw new Error('导出 JSON 不完整：数组未结束');
    }
    if (!first) {
      await expectChar(44, ',');
    }
    first = false;
    const item = await readValue();
    batch.push(item);
    count++;
    if (batch.length >= batchSize) {
      yield { type: 'items', items: batch };
      batch = [];
      compact();
    }
  }
}

/** Peek the first non-whitespace char of a chunk stream (consumes that char). */
export async function peekJsonRootKind(
  chunks: AsyncIterable<string>,
): Promise<{
  kind: 'array' | 'object' | 'other';
  rest: AsyncIterable<string>;
}> {
  const pull = chunks[Symbol.asyncIterator]();
  let prefix = '';
  for (;;) {
    const next = await pull.next();
    if (next.done) break;
    prefix += next.value;
    const trimmed = prefix.trimStart();
    if (!trimmed) continue;
    const ch = trimmed.charCodeAt(0);
    const kind: 'array' | 'object' | 'other' =
      ch === 91 ? 'array' : ch === 123 ? 'object' : 'other';
    // Rebuild a stream that starts with the leftover prefix (including
    // leading whitespace) so the real parser can re-read the root char.
    async function* rest(): AsyncGenerator<string> {
      if (prefix) yield prefix;
      for (;;) {
        const n = await pull.next();
        if (n.done) return;
        yield n.value;
      }
    }
    return { kind, rest: rest() };
  }
  return { kind: 'other', rest: (async function* () {})() };
}

/** Turn a string into an async iterable of chunks (for tests / in-memory). */
export async function* stringChunks(
  text: string,
  chunkSize = 64 * 1024,
): AsyncGenerator<string> {
  if (!text) {
    yield '';
    return;
  }
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}
