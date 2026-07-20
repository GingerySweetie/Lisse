/**
 * In-memory counters for work that must not be interrupted by a service-worker
 * reload (chat streams, backup import/export). Reloading mid-write left empty
 * assistant rows or half-imported DBs that looked like wiped data.
 */

let activeStreams = 0;
let activeWork = 0;

export function beginChatStream(): void {
  activeStreams += 1;
}

export function endChatStream(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}

export function hasActiveChatStream(): boolean {
  return activeStreams > 0;
}

/** Long-running import / export / other durable writes. */
export function beginActiveWork(): void {
  activeWork += 1;
}

export function endActiveWork(): void {
  activeWork = Math.max(0, activeWork - 1);
}

export function hasActiveWork(): boolean {
  return activeWork > 0 || activeStreams > 0;
}
