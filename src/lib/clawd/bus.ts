/**
 * Lightweight event bus so Chat / BedroomChat can nudge the desk pet
 * without importing the UI component.
 */

export type ClawdBusEvent =
  | { type: 'user-send'; personaId?: string | null }
  | { type: 'stream-start'; personaId?: string | null }
  | { type: 'stream-end'; personaId?: string | null; text: string }
  | { type: 'assistant-text'; personaId?: string | null; text: string };

type Listener = (event: ClawdBusEvent) => void;

const listeners = new Set<Listener>();

export function emitClawd(event: ClawdBusEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (e) {
      console.error('[clawd] listener failed', e);
    }
  }
}

export function subscribeClawd(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
