import { isReviewRequestMarketplaceEnabled } from "../../lib/amazon/policy";

type ConnectionLike = {
  marketplaceIds?: string[] | null;
} | null | undefined;

export function getBackfillMarketplaceIds(connection: ConnectionLike): string[] {
  if (!Array.isArray(connection?.marketplaceIds)) return [];
  return connection.marketplaceIds
    .map((marketplaceId) => marketplaceId.trim())
    .filter((marketplaceId) => marketplaceId.length > 0);
}

export function getBackfillReviewRequestSupport(connection: ConnectionLike) {
  const marketplaceIds = getBackfillMarketplaceIds(connection);
  const enabledMarketplaceIds = marketplaceIds.filter((marketplaceId) =>
    isReviewRequestMarketplaceEnabled(marketplaceId)
  );
  const disabledMarketplaceIds = marketplaceIds.filter(
    (marketplaceId) => !isReviewRequestMarketplaceEnabled(marketplaceId)
  );

  return {
    marketplaceIds,
    enabledMarketplaceIds,
    disabledMarketplaceIds,
    reviewRequestsEnabled: enabledMarketplaceIds.length > 0,
  };
}
