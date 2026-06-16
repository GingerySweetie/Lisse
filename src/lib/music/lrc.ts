/**
 * Minimal LRC parser. Output is a list of {ms, text} pairs sorted by
 * timestamp. Multiple timestamps on one line are duplicated. Lines
 * without timestamps (metadata like [ar:..]) are dropped.
 */
export interface LrcLine {
  ms: number;
  text: string;
}

const STAMP = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(lrc: string): LrcLine[] {
  if (!lrc) return [];
  const out: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    STAMP.lastIndex = 0;
    while ((m = STAMP.exec(raw)) !== null) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const frac = m[3]
        ? parseInt(m[3], 10) / (m[3].length === 2 ? 100 : 1000)
        : 0;
      stamps.push(Math.round((mins * 60 + secs + frac) * 1000));
    }
    if (stamps.length === 0) continue;
    const text = raw.replace(STAMP, '').trim();
    if (!text) continue;
    for (const ms of stamps) out.push({ ms, text });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

/** Find the index of the line that should be highlighted at `ms`. */
export function activeLineIndex(lines: LrcLine[], ms: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].ms <= ms) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
