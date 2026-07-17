/**
 * Read-only tool: find a real image on Wikimedia Commons (CORS-friendly).
 * Anti-AI-slop — we locate existing photos/artworks, never generate pixels.
 */

import type { Tool } from '../tools/index';

interface CommonsSearchResult {
  query?: {
    search?: { title: string; pageid: number }[];
  };
}

interface CommonsImageInfo {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: {
          url?: string;
          descriptionurl?: string;
          user?: string;
          extmetadata?: {
            Artist?: { value?: string };
            LicenseShortName?: { value?: string };
            ImageDescription?: { value?: string };
          };
        }[];
      }
    >;
  };
}

async function commonsSearch(query: string, limit = 5): Promise<
  { title: string; url: string; descriptionUrl: string; credit: string }[]
> {
  const searchUrl =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: '6', // File:
      srlimit: String(limit),
      format: 'json',
      origin: '*',
    });

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`Commons search HTTP ${searchRes.status}`);
  }
  const searchJson = (await searchRes.json()) as CommonsSearchResult;
  const hits = searchJson.query?.search ?? [];
  if (hits.length === 0) return [];

  const titles = hits.map((h) => h.title).join('|');
  const infoUrl =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      titles,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|user',
      format: 'json',
      origin: '*',
    });

  const infoRes = await fetch(infoUrl);
  if (!infoRes.ok) {
    throw new Error(`Commons imageinfo HTTP ${infoRes.status}`);
  }
  const infoJson = (await infoRes.json()) as CommonsImageInfo;
  const pages = infoJson.query?.pages ?? {};
  const out: {
    title: string;
    url: string;
    descriptionUrl: string;
    credit: string;
  }[] = [];

  for (const page of Object.values(pages)) {
    const ii = page.imageinfo?.[0];
    if (!ii?.url) continue;
    // Skip non-image files (pdf, djvu, etc.)
    if (!/\.(jpe?g|png|gif|webp|tif|tiff)$/i.test(ii.url)) continue;
    const artist = stripHtml(ii.extmetadata?.Artist?.value ?? ii.user ?? '');
    const license = stripHtml(ii.extmetadata?.LicenseShortName?.value ?? '');
    const credit = [page.title, artist, license, ii.descriptionurl]
      .filter(Boolean)
      .join(' · ');
    out.push({
      title: page.title ?? 'File',
      url: ii.url,
      descriptionUrl: ii.descriptionurl ?? '',
      credit,
    });
  }
  return out;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function travelImageTools(): Tool[] {
  return [
    {
      def: {
        name: 'find_real_image',
        description:
          'Search Wikimedia Commons for a real photograph or historical artwork. Returns direct image URLs with provenance. Never invent URLs.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query in English preferred, e.g. "Kyoto Fushimi Inari torii" or "Hokusai Great Wave"',
            },
          },
          required: ['query'],
        },
      },
      handler: async (input) => {
        const query =
          input &&
          typeof input === 'object' &&
          typeof (input as { query?: unknown }).query === 'string'
            ? (input as { query: string }).query.trim()
            : '';
        if (!query) return { error: 'query required' };
        try {
          const results = await commonsSearch(query, 5);
          if (results.length === 0) {
            return { results: [], note: 'No Commons hits; try a simpler English query.' };
          }
          return {
            results: results.map((r) => ({
              title: r.title,
              imageUrl: r.url,
              pageUrl: r.descriptionUrl,
              source: r.credit,
            })),
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : String(e),
          };
        }
      },
    },
  ];
}
