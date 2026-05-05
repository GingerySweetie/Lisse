/**
 * Parse a fetch stream as Server-Sent Events.
 * Yields the `data` payloads (one per `data:` line group).
 * Does not yield `[DONE]` sentinels — caller handles them.
 */
export async function* parseSSE(
  response: Response,
): AsyncGenerator<string, void, void> {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by \n\n (or \r\n\r\n). Process complete events.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = extractData(raw);
        if (data !== null) yield data;
      }
    }
    // flush trailing
    if (buffer.trim()) {
      const data = extractData(buffer);
      if (data !== null) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function extractData(raw: string): string | null {
  const lines = raw.split('\n');
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}
