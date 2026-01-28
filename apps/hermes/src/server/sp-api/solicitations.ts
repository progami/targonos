// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { SpApiClient } from "./client";

/**
 * Solicitations API (Request a Review)
 *
 * Typical flow:
 * 1) GET /solicitations/v1/orders/{orderId} (actions available)
 * 2) POST /solicitations/v1/orders/{orderId}/solicitations/productReviewAndSellerFeedback
 *
 * IMPORTANT:
 * - Amazon allows only one solicitation per order.
 * - Eligibility is limited to a post-delivery window (validate before calling).
 */
export async function getSolicitationActionsForOrder(params: {
  client: SpApiClient;
  orderId: string;
  marketplaceId: string;
}) {
  const { client, orderId, marketplaceId } = params;

  return client.request({
    method: "GET",
    path: `/solicitations/v1/orders/${encodeURIComponent(orderId)}`,
    query: { marketplaceIds: marketplaceId },
    // Default usage plan for this operation (Rate 1, Burst 5).
    // SP-API can return dynamic rates via `x-amzn-RateLimit-Limit`.
    rateLimitKey: "solicitations.getSolicitationActionsForOrder",
    defaultRateLimit: { ratePerSecond: 1, burst: 5 },
  });
}

export async function createProductReviewAndSellerFeedbackSolicitation(params: {
  client: SpApiClient;
  orderId: string;
  marketplaceId: string;
}) {
  const { client, orderId, marketplaceId } = params;

  return client.request({
    method: "POST",
    path: `/solicitations/v1/orders/${encodeURIComponent(orderId)}/solicitations/productReviewAndSellerFeedback`,
    query: { marketplaceIds: marketplaceId },
    // Default usage plan for this operation (Rate 1, Burst 5).
    // IMPORTANT: send only one solicitation per order.
    rateLimitKey: "solicitations.createProductReviewAndSellerFeedbackSolicitation",
    defaultRateLimit: { ratePerSecond: 1, burst: 5 },
  });
}
