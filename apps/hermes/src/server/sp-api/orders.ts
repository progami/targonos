// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { SpApiClient } from "./client";

/**
 * Orders API (v2026-01-01)
 *
 * For Hermes we use this for:
 * - backfilling past orders
 * - computing delivery-based schedules (policy windows)
 * - analytics (orders synced, eligibility funnel)
 */

type GetOrdersParams = {
  client: SpApiClient;

  /** Required for the initial call (kept across pagination). */
  marketplaceIds: string[];

  /** ISO-8601. Required when paginationToken is not used. */
  createdAfter?: string;
  createdBefore?: string;

  /** Alternative to createdAfter. ISO-8601. */
  lastUpdatedAfter?: string;
  lastUpdatedBefore?: string;

  /** Optional filters. */
  orderStatuses?: string[];
  fulfillmentChannels?: string[];

  /** Pagination token from a previous response. */
  nextToken?: string;

  /** 1..100 (per Amazon docs). */
  maxResultsPerPage?: number;

  /**
   * Optional bound for the in-process limiter wait. Useful for user-facing API routes
   * that sit behind a gateway with timeouts.
   */
  maxLimiterWaitMs?: number;
};

function joinCsv(values?: string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(",");
}

function normalizeStatusForV2026(status: string): string {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "PARTIALLYSHIPPED") return "PARTIALLY_SHIPPED";
  if (normalized === "CANCELED") return "CANCELLED";
  return normalized;
}

function normalizeFulfilledByForV2026(channel: string): string {
  const normalized = channel.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "AFN") return "AMAZON";
  if (normalized === "MFN") return "MERCHANT";
  return normalized;
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
    maxLimiterWaitMs,
  } = params;

  const query: Record<string, string | undefined> = {
    marketplaceIds: joinCsv(marketplaceIds),
    createdAfter: createdAfter,
    createdBefore: createdBefore,
    lastUpdatedAfter: lastUpdatedAfter,
    lastUpdatedBefore: lastUpdatedBefore,
    fulfillmentStatuses: joinCsv(orderStatuses?.map(normalizeStatusForV2026)),
    fulfilledBy: joinCsv(fulfillmentChannels?.map(normalizeFulfilledByForV2026)),
    paginationToken: nextToken,
    maxResultsPerPage:
      typeof maxResultsPerPage === "number" ? String(maxResultsPerPage) : undefined,
    includedData: "FULFILLMENT",
  };

  return client.request({
    method: "GET",
    path: "/orders/2026-01-01/orders",
    query,
    // Default usage plan for this operation (Rate ~0.0167 rps, Burst 20)
    // SP-API may return dynamic rates via `x-amzn-RateLimit-Limit`.
    rateLimitKey: "orders.searchOrders",
    defaultRateLimit: { ratePerSecond: 0.0167, burst: 20 },
    maxLimiterWaitMs,
  });
}
