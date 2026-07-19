/**
 * In-memory flag for an active chat/completion stream.
 *
 * Used by UpdateBanner to defer service-worker reloads until the write path
 * finishes — reloading mid-stream left empty `status: 'streaming'` assistant
 * rows that looked like wiped messages. Avoids scanning IndexedDB (status is
 * not an indexed key on messages).
 */

let activeStreams = 0;

export function beginChatStream(): void {
  activeStreams += 1;
}

export function endChatStream(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}

export function hasActiveChatStream(): boolean {
  return activeStreams > 0;
}
