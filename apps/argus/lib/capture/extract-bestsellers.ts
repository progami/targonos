import { load } from 'cheerio';

export type BestsellersTrackedResult = {
  asin: string;
  found: boolean;
  position?: number;
};

export type BestsellersExtracted = {
  topAsins: string[];
  tracked: BestsellersTrackedResult[];
};

export function extractBestsellers(
  html: string,
  options: { trackedAsins: string[]; limit?: number },
): { raw: Record<string, unknown>; normalized: BestsellersExtracted } {
  const limit = options.limit ?? 100;
  const trackedAsins = options.trackedAsins.map((a) => a.toUpperCase());

  const $ = load(html);

  const candidates = $('#zg-ordered-list [data-asin]')
    .toArray()
    .map((el) => $(el).attr('data-asin')?.trim() || '')
    .filter((asin) => asin.length > 0)
    .map((asin) => asin.toUpperCase());

  const topAsins: string[] = [];
  for (const asin of candidates) {
    if (topAsins.length >= limit) break;
    if (topAsins.includes(asin)) continue;
    topAsins.push(asin);
  }

  const tracked: BestsellersTrackedResult[] = [];
  for (const asin of trackedAsins) {
    const idx = topAsins.indexOf(asin);
    if (idx === -1) {
      tracked.push({ asin, found: false });
      continue;
    }
    tracked.push({ asin, found: true, position: idx + 1 });
  }

  const raw: Record<string, unknown> = { topAsins, tracked };
  const normalized: BestsellersExtracted = { topAsins, tracked };
  return { raw, normalized };
}

