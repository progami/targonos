import { SpApiClient } from "./client";

export type ItemReviewTopicsSortBy = "MENTIONS" | "STAR_RATING_IMPACT";

export async function getItemReviewTopics(params: {
  client: SpApiClient;
  asin: string;
  marketplaceId: string;
  sortBy: ItemReviewTopicsSortBy;
}) {
  return params.client.request({
    method: "GET",
    path: `/customerFeedback/2024-06-01/items/${encodeURIComponent(params.asin)}/reviews/topics`,
    query: {
      marketplaceId: params.marketplaceId,
      sortBy: params.sortBy,
    },
    rateLimitKey: `customerFeedback.getItemReviewTopics.${params.sortBy}`,
    defaultRateLimit: { ratePerSecond: 0.5, burst: 1 },
  });
}

export async function getItemReviewTrends(params: {
  client: SpApiClient;
  asin: string;
  marketplaceId: string;
}) {
  return params.client.request({
    method: "GET",
    path: `/customerFeedback/2024-06-01/items/${encodeURIComponent(params.asin)}/reviews/trends`,
    query: {
      marketplaceId: params.marketplaceId,
    },
    rateLimitKey: "customerFeedback.getItemReviewTrends",
    defaultRateLimit: { ratePerSecond: 0.5, burst: 1 },
  });
}
