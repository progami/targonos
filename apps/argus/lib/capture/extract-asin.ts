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
  const landing = $('#landingImage').attr('src');
  if (landing && landing.trim()) {
    imageUrls.push(landing.trim());
  }
  for (const img of $('#altImages img').toArray()) {
    const src = $(img).attr('src');
    if (src && src.trim()) imageUrls.push(src.trim());
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
