// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { SpApiClient } from "./client";

/**
 * Orders API (v0)
 *
 * For Hermes we use this for:
 * - backfilling past orders
 * - computing delivery-based schedules (policy windows)
 * - analytics (orders synced, eligibility funnel)
 */

type GetOrdersParams = {
  client: SpApiClient;

  /** Required for the initial call (ignored when NextToken is used). */
  marketplaceIds: string[];

  /** ISO-8601. Required when NextToken is not used. */
  createdAfter?: string;
  createdBefore?: string;

  /** Alternative to CreatedAfter. ISO-8601. */
  lastUpdatedAfter?: string;
  lastUpdatedBefore?: string;

  /** Optional filters. */
  orderStatuses?: string[];
  fulfillmentChannels?: string[];

  /** Pagination token from a previous response. When provided, other params are ignored. */
  nextToken?: string;

  /** 1..100 (per Amazon docs). */
  maxResultsPerPage?: number;
};

function joinCsv(values?: string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(",");
}

export async function getOrders(params: GetOrdersParams) {
  const {
    client,
    marketplaceIds,
    createdAfter,
    createdBefore,
    lastUpdatedAfter,
    lastUpdatedBefore,
    orderStatuses,
    fulfillmentChannels,
    nextToken,
    maxResultsPerPage,
  } = params;

  const query: Record<string, string | undefined> = nextToken
    ? {
        NextToken: nextToken,
      }
    : {
        MarketplaceIds: joinCsv(marketplaceIds),
        CreatedAfter: createdAfter,
        CreatedBefore: createdBefore,
        LastUpdatedAfter: lastUpdatedAfter,
        LastUpdatedBefore: lastUpdatedBefore,
        OrderStatuses: joinCsv(orderStatuses),
        FulfillmentChannels: joinCsv(fulfillmentChannels),
        MaxResultsPerPage:
          typeof maxResultsPerPage === "number" ? String(maxResultsPerPage) : undefined,
      };

  return client.request({
    method: "GET",
    path: "/orders/v0/orders",
    query,
    // Default usage plan for this operation (Rate ~0.0167 rps, Burst 20)
    // SP-API may return dynamic rates via `x-amzn-RateLimit-Limit`.
    rateLimitKey: "orders.getOrders",
    defaultRateLimit: { ratePerSecond: 0.0167, burst: 20 },
  });
}
