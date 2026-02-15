import { getPgPool } from "../db/pool";

export type ManualReviewRow = {
  id: string;
  connectionId: string;
  marketplaceId: string;
  asin: string;
  source: string;
  externalReviewId: string | null;
  reviewDate: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  raw: unknown;
  importedAt: string;
  updatedAt: string;
};

export type AsinReviewInsightRow = {
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
  lastSyncError: string | null;
  lastSyncAt: string;
  updatedAt: string;
};

export async function listManualReviews(params: {
  connectionId: string;
  marketplaceId?: string | null;
  asin?: string | null;
  limit: number;
}): Promise<ManualReviewRow[]> {
  const pool = getPgPool();
  const limit = Math.max(1, Math.min(params.limit, 500));

  const values: Array<string | number> = [params.connectionId];
  const where: string[] = ["connection_id = $1"];

  if (params.marketplaceId) {
    values.push(params.marketplaceId);
    where.push(`marketplace_id = $${values.length}`);
  }

  if (params.asin) {
    values.push(params.asin.trim().toUpperCase());
    where.push(`asin = $${values.length}`);
  }

  values.push(limit);
  const limitParam = `$${values.length}`;

  const res = await pool.query<{
    id: string;
    connection_id: string;
    marketplace_id: string;
    asin: string;
    source: string;
    external_review_id: string | null;
    review_date: string | null;
    rating: number | null;
    title: string | null;
    body: string;
    raw: unknown;
    imported_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      id,
      connection_id,
      marketplace_id,
      asin,
      source,
      external_review_id,
      review_date::text,
      rating::double precision AS rating,
      title,
      body,
      raw,
      imported_at::text,
      updated_at::text
    FROM hermes_manual_reviews
    WHERE ${where.join("\n      AND ")}
    ORDER BY imported_at DESC
    LIMIT ${limitParam};
    `,
    values
  );

  return res.rows.map((row) => ({
    id: row.id,
    connectionId: row.connection_id,
    marketplaceId: row.marketplace_id,
    asin: row.asin,
    source: row.source,
    externalReviewId: row.external_review_id,
    reviewDate: row.review_date,
    rating: row.rating,
    title: row.title,
    body: row.body,
    raw: row.raw,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  }));
}

export async function listAsinReviewInsights(params: {
  connectionId: string;
  marketplaceId?: string | null;
  asin?: string | null;
  limit: number;
}): Promise<AsinReviewInsightRow[]> {
  const pool = getPgPool();
  const limit = Math.max(1, Math.min(params.limit, 500));

  const values: Array<string | number> = [params.connectionId];
  const where: string[] = ["connection_id = $1"];

  if (params.marketplaceId) {
    values.push(params.marketplaceId);
    where.push(`marketplace_id = $${values.length}`);
  }

  if (params.asin) {
    values.push(params.asin.trim().toUpperCase());
    where.push(`asin = $${values.length}`);
  }

  values.push(limit);
  const limitParam = `$${values.length}`;

  const res = await pool.query<{
    connection_id: string;
    marketplace_id: string;
    asin: string;
    item_name: string | null;
    country_code: string | null;
    topics_mentions: unknown;
    topics_star_rating_impact: unknown;
    review_trends: unknown;
    topics_date_start: string | null;
    topics_date_end: string | null;
    trends_date_start: string | null;
    trends_date_end: string | null;
    last_sync_error: string | null;
    last_sync_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      connection_id,
      marketplace_id,
      asin,
      item_name,
      country_code,
      topics_mentions,
      topics_star_rating_impact,
      review_trends,
      topics_date_start::text,
      topics_date_end::text,
      trends_date_start::text,
      trends_date_end::text,
      last_sync_error,
      last_sync_at::text,
      updated_at::text
    FROM hermes_asin_review_insights
    WHERE ${where.join("\n      AND ")}
    ORDER BY last_sync_at DESC
    LIMIT ${limitParam};
    `,
    values
  );

  return res.rows.map((row) => ({
    connectionId: row.connection_id,
    marketplaceId: row.marketplace_id,
    asin: row.asin,
    itemName: row.item_name,
    countryCode: row.country_code,
    topicsMentions: row.topics_mentions,
    topicsStarRatingImpact: row.topics_star_rating_impact,
    reviewTrends: row.review_trends,
    topicsDateStart: row.topics_date_start,
    topicsDateEnd: row.topics_date_end,
    trendsDateStart: row.trends_date_start,
    trendsDateEnd: row.trends_date_end,
    lastSyncError: row.last_sync_error,
    lastSyncAt: row.last_sync_at,
    updatedAt: row.updated_at,
  }));
}
