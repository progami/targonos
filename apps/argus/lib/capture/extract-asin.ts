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

function decodeHtmlEntities(value: string): string {
  // Amazon frequently encodes JSON in attributes with &quot;.
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&amp;', '&');
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function isVideoPlaceholderUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('play-button');
}

function upgradeAmazonImageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('media-amazon.com')) return url;
  if (!parsed.pathname.includes('/images/I/')) return url;

  const parts = parsed.pathname.split('/');
  const file = parts[parts.length - 1];
  if (!file) return url;

  const firstDot = file.indexOf('.');
  const lastDot = file.lastIndexOf('.');
  if (firstDot <= 0 || lastDot <= firstDot) return url;

  const imageId = file.slice(0, firstDot);
  const extRaw = file.slice(lastDot + 1).toLowerCase();
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
  if (ext !== 'jpg' && ext !== 'png' && ext !== 'webp') return url;

  parts[parts.length - 1] = `${imageId}._AC_SL1500_.${ext}`;
  parsed.pathname = parts.join('/');
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString();
}

function normalizeListingImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (isVideoPlaceholderUrl(url)) return null;
  return upgradeAmazonImageUrl(url);
}

function pickBestDynamicImageUrl(input: string): string | null {
  const decoded = decodeHtmlEntities(input.trim());
  if (!decoded.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  let bestUrl: string | null = null;
  let bestScore = 0;
  for (const [url, dims] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(dims) || dims.length < 2) continue;
    const w = dims[0];
    const h = dims[1];
    if (typeof w !== 'number' || typeof h !== 'number') continue;
    const score = w * h;
    if (score <= bestScore) continue;
    bestScore = score;
    bestUrl = url;
  }

  return normalizeUrl(bestUrl ?? undefined);
}

function bestImageUrlFromImg($img: ReturnType<ReturnType<typeof load>>): string | null {
  const oldHires = normalizeUrl($img.attr('data-old-hires'));
  if (oldHires) return normalizeListingImageUrl(oldHires);

  const dynamic = normalizeUrl($img.attr('data-a-dynamic-image'));
  if (dynamic) {
    const best = pickBestDynamicImageUrl(dynamic);
    if (best) return normalizeListingImageUrl(best);
  }

  const src = normalizeUrl($img.attr('src'));
  if (src) return normalizeListingImageUrl(src);

  const dataSrc = normalizeUrl($img.attr('data-src'));
  if (dataSrc) return normalizeListingImageUrl(dataSrc);

  return null;
}

function dedupePreserveOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function extractAsinFields(html: string): { raw: Record<string, unknown>; normalized: AsinExtracted } {
  const $ = load(html);

  const titleText = $('#productTitle').text().trim();

  const priceText =
    $('#corePriceDisplay_desktop_feature_div span.a-offscreen').first().text().trim() ||
    $('#priceblock_ourprice').first().text().trim() ||
    $('#priceblock_dealprice').first().text().trim() ||
    $('#priceblock_saleprice').first().text().trim();

  const ratingText =
    $('span[data-hook="rating-out-of-text"]').first().text().trim() || $('#acrPopover').attr('title')?.trim() || '';

  const reviewCountText =
    $('#acrCustomerReviewText').first().text().trim() || $('span[data-hook="total-review-count"]').first().text().trim();

  const bullets = $('#feature-bullets ul li span.a-list-item')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((text) => text.length > 0);

  const imageUrls: string[] = [];

  const landingUrl = bestImageUrlFromImg($('#landingImage').first());
  if (landingUrl) {
    imageUrls.push(landingUrl);
  }

  for (const img of $('#altImages img').toArray()) {
    const url = bestImageUrlFromImg($(img));
    if (url) imageUrls.push(url);
  }

  const raw: Record<string, unknown> = {
    titleText: titleText || undefined,
    priceText: priceText || undefined,
    ratingText: ratingText || undefined,
    reviewCountText: reviewCountText || undefined,
    bullets,
    imageUrls,
  };

  const normalized: AsinExtracted = {
    bullets,
    imageUrls: dedupePreserveOrder(imageUrls).slice(0, 9),
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
