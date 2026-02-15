import crypto from "crypto";

import { getPgPool } from "../db/pool";

export type ManualReviewInput = {
  externalReviewId?: string;
  reviewDate?: string;
  rating?: number;
  title?: string;
  body: string;
  raw?: unknown;
};

export type ReviewAsinTarget = {
  marketplaceId: string;
  asin: string;
};

function newId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function cleanDateIso(input: string | null | undefined): string | null {
  const value = cleanText(input);
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function cleanRating(input: number | null | undefined): number | null {
  if (typeof input !== "number") return null;
  if (!Number.isFinite(input)) return null;
  if (input < 0 || input > 5) return null;
  return input;
}

function normalizeAsin(asin: string): string {
  return asin.trim().toUpperCase();
}

function computeReviewHash(params: {
  asin: string;
  externalReviewId: string | null;
  reviewDate: string | null;
  rating: number | null;
  title: string | null;
  body: string;
}): string {
  const canonical = JSON.stringify({
    asin: params.asin,
    externalReviewId: params.externalReviewId,
    reviewDate: params.reviewDate,
    rating: params.rating,
    title: params.title,
    body: params.body,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function splitRawReviewBlocks(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const byMarker = normalized
    .split(/\n-{3,}\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  if (byMarker.length > 1) return byMarker;

  return normalized
    .split(/\n\s*\n\s*\n+/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function parseRatingPrefix(block: string): { rating: number | undefined; body: string } {
  const match = block.match(/^([0-5](?:\.\d+)?)\s*(?:\/\s*5|stars?)\s*[:\-–]?\s*/i);
  if (!match) return { rating: undefined, body: block };

  const rating = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(rating)) return { rating: undefined, body: block };
  if (rating < 0 || rating > 5) return { rating: undefined, body: block };

  const body = block.slice(match[0].length).trim();
  return { rating, body };
}

export function parseManualReviewText(rawText: string): ManualReviewInput[] {
  const blocks = splitRawReviewBlocks(rawText);
  const out: ManualReviewInput[] = [];

  for (const block of blocks) {
    const parsed = parseRatingPrefix(block);
    const body = cleanText(parsed.body);
    if (!body) continue;

    out.push({
      rating: parsed.rating,
      body,
      raw: { importedFrom: "raw_text", block },
    });
  }

  return out;
}

export async function importManualReviews(params: {
  connectionId: string;
  marketplaceId: string;
  asin: string;
  source: string;
  reviews: ManualReviewInput[];
}): Promise<{ requested: number; inserted: number; deduplicated: number }> {
  const pool = getPgPool();
  const asin = normalizeAsin(params.asin);

  const rows = params.reviews
    .map((review) => {
      const body = cleanText(review.body);
      if (!body) return null;

      const externalReviewId = cleanText(review.externalReviewId);
      const reviewDate = cleanDateIso(review.reviewDate);
      const rating = cleanRating(review.rating);
      const title = cleanText(review.title);

      const reviewHash = computeReviewHash({
        asin,
        externalReviewId,
        reviewDate,
        rating,
        title,
        body,
      });

      return {
        id: newId(),
        external_review_id: externalReviewId,
        review_date: reviewDate,
        rating,
        title,
        body,
        review_hash: reviewHash,
        raw: review.raw ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return {
      requested: params.reviews.length,
      inserted: 0,
      deduplicated: params.reviews.length,
    };
  }

  const insert = await pool.query(
    `
    INSERT INTO hermes_manual_reviews (
      id, connection_id, marketplace_id, asin,
      source, external_review_id, review_date, rating, title, body, review_hash, raw,
      imported_at, updated_at
    )
    SELECT
      x.id,
      $1,
      $2,
      $3,
      $4,
      x.external_review_id,
      x.review_date::timestamptz,
      x.rating::numeric,
      x.title,
      x.body,
      x.review_hash,
      x.raw::jsonb,
      NOW(),
      NOW()
    FROM jsonb_to_recordset($5::jsonb) AS x(
      id text,
      external_review_id text,
      review_date text,
      rating numeric,
      title text,
      body text,
      review_hash text,
      raw jsonb
    )
    ON CONFLICT (connection_id, marketplace_id, asin, review_hash) DO NOTHING;
    `,
    [params.connectionId, params.marketplaceId, asin, params.source, JSON.stringify(rows)]
  );

  const inserted = insert.rowCount ?? 0;

  return {
    requested: params.reviews.length,
    inserted,
    deduplicated: params.reviews.length - inserted,
  };
}

export async function listReviewAsinTargets(params: {
  connectionId: string;
  marketplaceIds: string[];
  limit: number;
}): Promise<ReviewAsinTarget[]> {
  if (params.marketplaceIds.length === 0) return [];

  const pool = getPgPool();
  const limit = Number.isFinite(params.limit) ? Math.max(1, Math.floor(params.limit)) : 200;

  const res = await pool.query<{
    marketplace_id: string;
    asin: string;
  }>(
    `
    SELECT
      r.marketplace_id,
      r.asin
    FROM hermes_manual_reviews r
    WHERE r.connection_id = $1
      AND r.marketplace_id = ANY($2::text[])
    GROUP BY r.marketplace_id, r.asin
    ORDER BY MAX(r.imported_at) DESC
    LIMIT $3;
    `,
    [params.connectionId, params.marketplaceIds, limit]
  );

  return res.rows.map((row) => ({
    marketplaceId: row.marketplace_id,
    asin: row.asin,
  }));
}
