/**
 * UTF-8 text chunk iterators for streaming vendor / backup imports.
 */

/** UTF-8 text chunks from a browser File (streaming when supported). */
export async function* fileTextChunks(file: File): AsyncGenerator<string> {
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          const tail = decoder.decode();
          if (tail) yield tail;
          break;
        }
        yield decoder.decode(value, { stream: true });
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
    return;
  }
  // Rare fallback — still one shot, but only used when stream() is missing.
  yield await file.text();
}
