import { load } from 'cheerio';
import { parseFirstInt, parseFirstNumber } from './parse';

export type AsinExtracted = {
  title?: string;
  price?: number;
  rating?: number;
  reviewCount?: number;
  bullets: string[];
  imageUrls: string[];
};

function findProductJsonLd(html: string): Record<string, unknown> | null {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (const script of scripts.toArray()) {
    const text = $(script).html();
    if (!text) continue;

    const parsed = JSON.parse(text.trim());

    if (parsed['@type'] === 'Product') return parsed;

    if (Array.isArray(parsed)) {
      const product = parsed.find((item: Record<string, unknown>) => item['@type'] === 'Product');
      if (product) return product;
    }

    if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
      const product = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Product');
      if (product) return product;
    }
  }

  return null;
}

export function extractAsinFields(html: string): { raw: Record<string, unknown>; normalized: AsinExtracted } {
  const $ = load(html);
  const jsonLd = findProductJsonLd(html);

  // --- JSON-LD fields ---
  const titleText = typeof jsonLd?.name === 'string' ? (jsonLd.name as string).trim() : '';

  const offers = jsonLd?.offers;
  let priceText = '';
  if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
    priceText = String((offers as Record<string, unknown>).price ?? '');
  } else if (Array.isArray(offers) && offers.length > 0) {
    priceText = String((offers[0] as Record<string, unknown>).price ?? '');
  }

  const aggregateRating = jsonLd?.aggregateRating as Record<string, unknown> | undefined;
  const ratingText = aggregateRating ? String(aggregateRating.ratingValue ?? '') : '';
  const reviewCountText = aggregateRating
    ? String(aggregateRating.reviewCount ?? aggregateRating.ratingCount ?? '')
    : '';

  const jsonLdImage = jsonLd?.image;
  const imageUrls: string[] = [];
  if (typeof jsonLdImage === 'string' && jsonLdImage.trim()) {
    imageUrls.push(jsonLdImage.trim());
  } else if (Array.isArray(jsonLdImage)) {
    for (const img of jsonLdImage) {
      if (typeof img === 'string' && img.trim()) {
        imageUrls.push(img.trim());
      }
    }
  }

  // --- CSS selector fields (bullets only — no JSON-LD equivalent) ---
  const bullets = $('#feature-bullets ul li span.a-list-item')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((text) => text.length > 0);

  // --- Build raw and normalized ---
  const raw: Record<string, unknown> = {
    jsonLd: jsonLd ?? undefined,
    titleText: titleText || undefined,
    priceText: priceText || undefined,
    ratingText: ratingText || undefined,
    reviewCountText: reviewCountText || undefined,
    bullets,
    imageUrls,
  };

  const normalized: AsinExtracted = {
    bullets,
    imageUrls: Array.from(new Set(imageUrls)).sort(),
  };

  if (titleText) normalized.title = titleText;
  const price = priceText ? parseFirstNumber(priceText) : undefined;
  if (price !== undefined) normalized.price = price;
  const rating = ratingText ? parseFirstNumber(ratingText) : undefined;
  if (rating !== undefined) normalized.rating = rating;
  const reviewCount = reviewCountText ? parseFirstInt(reviewCountText) : undefined;
  if (reviewCount !== undefined) normalized.reviewCount = reviewCount;

  return { raw, normalized };
}
