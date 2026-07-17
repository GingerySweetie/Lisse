/**
 * Pure JSON parse for travel agent output — no DB / network deps
 * (keeps unit tests runnable under node --experimental-strip-types).
 */

export interface TravelJsonResult {
  monologue: string;
  trip: {
    location: string;
    era: string;
    feeling: string;
    imageUrl: string;
    imageSource: string;
    gift: string;
  };
  invite: boolean;
  message: string;
  emotionalScore: number;
}

export function parseTravelJson(text: string): TravelJsonResult | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const tripRaw = o.trip;
  if (!tripRaw || typeof tripRaw !== 'object') return null;
  const t = tripRaw as Record<string, unknown>;

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const location = str(t.location);
  const gift = str(t.gift);
  if (!location || !gift) return null;

  let emotionalScore = 0;
  if (typeof o.emotionalScore === 'number' && Number.isFinite(o.emotionalScore)) {
    emotionalScore = Math.max(0, Math.min(1, o.emotionalScore));
  }

  return {
    monologue: str(o.monologue) || `在${location}走了一圈。`,
    trip: {
      location,
      era: str(t.era) || '当代',
      feeling: str(t.feeling) || '',
      imageUrl: str(t.imageUrl),
      imageSource: str(t.imageSource),
      gift,
    },
    invite: o.invite === true,
    message: str(o.message),
    emotionalScore,
  };
}
