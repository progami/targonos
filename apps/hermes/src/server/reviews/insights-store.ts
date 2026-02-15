import { getPgPool } from "../db/pool";

export type AsinReviewInsightsSnapshot = {
  connectionId: string;
  marketplaceId: string;
  asin: string;
  itemName: string | null;
  countryCode: string | null;
  topicsMentions: unknown;
  topicsStarRatingImpact: unknown;
  reviewTrends: unknown;
  topicsDateStart: string | null;
  topicsDateEnd: string | null;
  trendsDateStart: string | null;
  trendsDateEnd: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function cleanDateIso(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function extractDateRange(body: unknown): { start: string | null; end: string | null } {
  if (!body || typeof body !== "object") {
    return { start: null, end: null };
  }

  const maybeDateRange = (body as Record<string, unknown>).dateRange;
  if (!maybeDateRange || typeof maybeDateRange !== "object") {
    return { start: null, end: null };
  }

  const range = maybeDateRange as Record<string, unknown>;
  return {
    start: cleanDateIso(range.startDate),
    end: cleanDateIso(range.endDate),
  };
}

export function pickItemName(...values: unknown[]): string | null {
  for (const value of values) {
    const itemName = cleanText(value);
    if (itemName) return itemName;
  }
  return null;
}

export function pickCountryCode(...values: unknown[]): string | null {
  for (const value of values) {
    const countryCode = cleanText(value);
    if (countryCode) return countryCode;
  }
  return null;
}

export async function upsertAsinReviewInsightsSnapshot(
  snapshot: AsinReviewInsightsSnapshot
): Promise<void> {
  const pool = getPgPool();

  await pool.query(
    `
    INSERT INTO hermes_asin_review_insights (
      connection_id, marketplace_id, asin,
      item_name, country_code,
      topics_mentions, topics_star_rating_impact, review_trends,
      topics_date_start, topics_date_end, trends_date_start, trends_date_end,
      last_sync_error, last_sync_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3,
      $4, $5,
      $6::jsonb, $7::jsonb, $8::jsonb,
      $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz,
      NULL, NOW(), NOW(), NOW()
    )
    ON CONFLICT (connection_id, marketplace_id, asin) DO UPDATE
      SET item_name = EXCLUDED.item_name,
          country_code = EXCLUDED.country_code,
          topics_mentions = EXCLUDED.topics_mentions,
          topics_star_rating_impact = EXCLUDED.topics_star_rating_impact,
          review_trends = EXCLUDED.review_trends,
          topics_date_start = EXCLUDED.topics_date_start,
          topics_date_end = EXCLUDED.topics_date_end,
          trends_date_start = EXCLUDED.trends_date_start,
          trends_date_end = EXCLUDED.trends_date_end,
          last_sync_error = NULL,
          last_sync_at = NOW(),
          updated_at = NOW();
    `,
    [
      snapshot.connectionId,
      snapshot.marketplaceId,
      snapshot.asin.trim().toUpperCase(),
      snapshot.itemName,
      snapshot.countryCode,
      snapshot.topicsMentions === null ? null : JSON.stringify(snapshot.topicsMentions),
      snapshot.topicsStarRatingImpact === null ? null : JSON.stringify(snapshot.topicsStarRatingImpact),
      snapshot.reviewTrends === null ? null : JSON.stringify(snapshot.reviewTrends),
      snapshot.topicsDateStart,
      snapshot.topicsDateEnd,
      snapshot.trendsDateStart,
      snapshot.trendsDateEnd,
    ]
  );
}

export async function markAsinReviewInsightsSyncError(params: {
  connectionId: string;
  marketplaceId: string;
  asin: string;
  error: string;
}): Promise<void> {
  const pool = getPgPool();

  await pool.query(
    `
    INSERT INTO hermes_asin_review_insights (
      connection_id, marketplace_id, asin,
      last_sync_error, last_sync_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3,
      $4, NOW(), NOW(), NOW()
    )
    ON CONFLICT (connection_id, marketplace_id, asin) DO UPDATE
      SET last_sync_error = EXCLUDED.last_sync_error,
          last_sync_at = NOW(),
          updated_at = NOW();
    `,
    [params.connectionId, params.marketplaceId, params.asin.trim().toUpperCase(), params.error]
  );
}
