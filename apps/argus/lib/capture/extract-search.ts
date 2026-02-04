import { load } from 'cheerio';

export type SearchTrackedResult = {
  asin: string;
  found: boolean;
  position?: number;
  sponsored?: boolean;
};

export type SearchExtracted = {
  results: string[];
  tracked: SearchTrackedResult[];
};

export function extractSearchResults(
  html: string,
  options: { trackedAsins: string[]; limit?: number },
): { raw: Record<string, unknown>; normalized: SearchExtracted } {
  const limit = options.limit ?? 48;
  const trackedAsins = options.trackedAsins.map((a) => a.toUpperCase());

  const $ = load(html);
  const results = $('[data-component-type="s-search-result"][data-asin]')
    .toArray()
    .map((el) => $(el).attr('data-asin')?.trim() || '')
    .filter((asin) => asin.length > 0)
    .map((asin) => asin.toUpperCase());

  const trimmedResults: string[] = [];
  for (const asin of results) {
    if (trimmedResults.length >= limit) break;
    if (trimmedResults.includes(asin)) continue;
    trimmedResults.push(asin);
  }

  const tracked: SearchTrackedResult[] = [];
  for (const asin of trackedAsins) {
    const idx = trimmedResults.indexOf(asin);
    if (idx === -1) {
      tracked.push({ asin, found: false });
      continue;
    }

    const position = idx + 1;
    const card = $(`[data-component-type="s-search-result"][data-asin="${asin}"]`).first();
    const cardText = card.text().toLowerCase();
    const sponsored = cardText.includes('sponsored');
    tracked.push({ asin, found: true, position, sponsored });
  }

  const raw: Record<string, unknown> = {
    results: trimmedResults,
    tracked,
  };

  const normalized: SearchExtracted = {
    results: trimmedResults,
    tracked,
  };

  return { raw, normalized };
}

