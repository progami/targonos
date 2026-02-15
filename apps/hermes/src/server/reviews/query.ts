import { getPgPool } from "../db/pool";

export type ManualReviewRow = {
  id: string;
  connectionId: string;
  marketplaceId: string;
  sku: string;
  asin: string;
  reviewDate: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  importedAt: string;
};

export type ManualReviewInsights = {
  totalReviews: number;
  avgRating: number | null;
  fiveStarReviews: number;
  fiveStarRatePct: number | null;
  last30DaysReviews: number;
  previous30DaysReviews: number;
  changeLast30Pct: number | null;
  series: Array<{
    day: string;
    reviews: number;
    avgRating: number | null;
    fiveStarReviews: number;
  }>;
};

export async function listManualReviews(params: {
  connectionId: string;
  marketplaceId: string;
  sku: string;
  limit: number;
}): Promise<ManualReviewRow[]> {
  const pool = getPgPool();
  const limit = Math.max(1, Math.min(params.limit, 1000));
  const sku = params.sku.trim().toUpperCase();

  const res = await pool.query<{
    id: string;
    connection_id: string;
    marketplace_id: string;
    sku: string;
    asin: string;
    review_date: string | null;
    rating: number | null;
    title: string | null;
    body: string;
    imported_at: string;
  }>(
    `
    SELECT
      id,
      connection_id,
      marketplace_id,
      sku,
      asin,
      review_date::text,
      rating::double precision AS rating,
      title,
      body,
      imported_at::text
    FROM hermes_manual_reviews
    WHERE connection_id = $1
      AND marketplace_id = $2
      AND sku = $3
    ORDER BY COALESCE(review_date, imported_at) DESC, imported_at DESC
    LIMIT $4;
    `,
    [params.connectionId, params.marketplaceId, sku, limit]
  );

  return res.rows.map((row) => ({
    id: row.id,
    connectionId: row.connection_id,
    marketplaceId: row.marketplace_id,
    sku: row.sku,
    asin: row.asin,
    reviewDate: row.review_date,
    rating: row.rating,
    title: row.title,
    body: row.body,
    importedAt: row.imported_at,
  }));
}

export async function getManualReviewInsights(params: {
  connectionId: string;
  marketplaceId: string;
  sku: string;
}): Promise<ManualReviewInsights> {
  const pool = getPgPool();
  const sku = params.sku.trim().toUpperCase();

  const summaryRes = await pool.query<{
    total_reviews: number;
    avg_rating: number | null;
    five_star_reviews: number;
    last_30_days_reviews: number;
    previous_30_days_reviews: number;
  }>(
    `
    SELECT
      COUNT(*)::int AS total_reviews,
      AVG(rating)::double precision AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS five_star_reviews,
      COUNT(*) FILTER (
        WHERE COALESCE(review_date, imported_at) >= NOW() - INTERVAL '30 days'
      )::int AS last_30_days_reviews,
      COUNT(*) FILTER (
        WHERE COALESCE(review_date, imported_at) >= NOW() - INTERVAL '60 days'
          AND COALESCE(review_date, imported_at) < NOW() - INTERVAL '30 days'
      )::int AS previous_30_days_reviews
    FROM hermes_manual_reviews
    WHERE connection_id = $1
      AND marketplace_id = $2
      AND sku = $3;
    `,
    [params.connectionId, params.marketplaceId, sku]
  );

  const seriesRes = await pool.query<{
    day: string;
    reviews: number;
    avg_rating: number | null;
    five_star_reviews: number;
  }>(
    `
    SELECT
      date_trunc('day', COALESCE(review_date, imported_at))::date::text AS day,
      COUNT(*)::int AS reviews,
      AVG(rating)::double precision AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS five_star_reviews
    FROM hermes_manual_reviews
    WHERE connection_id = $1
      AND marketplace_id = $2
      AND sku = $3
      AND COALESCE(review_date, imported_at) >= NOW() - INTERVAL '90 days'
    GROUP BY 1
    ORDER BY 1 DESC;
    `,
    [params.connectionId, params.marketplaceId, sku]
  );

  const summary = summaryRes.rows[0];
  const totalReviews = summary?.total_reviews ?? 0;
  const avgRating = summary?.avg_rating ?? null;
  const fiveStarReviews = summary?.five_star_reviews ?? 0;
  const last30DaysReviews = summary?.last_30_days_reviews ?? 0;
  const previous30DaysReviews = summary?.previous_30_days_reviews ?? 0;

  const fiveStarRatePct =
    totalReviews > 0
      ? Number(((fiveStarReviews / totalReviews) * 100).toFixed(2))
      : null;
  const changeLast30Pct =
    previous30DaysReviews > 0
      ? Number((((last30DaysReviews - previous30DaysReviews) / previous30DaysReviews) * 100).toFixed(2))
      : null;

  return {
    totalReviews,
    avgRating,
    fiveStarReviews,
    fiveStarRatePct,
    last30DaysReviews,
    previous30DaysReviews,
    changeLast30Pct,
    series: seriesRes.rows.map((row) => ({
      day: row.day,
      reviews: row.reviews,
      avgRating: row.avg_rating,
      fiveStarReviews: row.five_star_reviews,
    })),
  };
}
