// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { SpApiClient } from "./client";

/**
 * Messaging API (Buyer-Seller Messaging)
 *
 * Typical flow:
 * 1) GET /messaging/v1/orders/{amazonOrderId}?marketplaceIds=... (actions available)
 * 2) POST one of the allowed message operations under /messaging/v1/orders/{amazonOrderId}/messages/...
 *
 * IMPORTANT:
 * - Amazon enforces what messages are allowed per order (use the actions endpoint).
 * - Content restrictions apply (no marketing, no incentivized reviews, etc.).
 */

export const MESSAGING_KINDS = [
  "confirmCustomizationDetails",
  "confirmDeliveryDetails",
  "legalDisclosure",
  "negativeFeedbackRemoval",
  "confirmOrderDetails",
  "confirmServiceDetails",
  "amazonMotors",
  "warranty",
  "digitalAccessKey",
  "unexpectedProblem",
  "invoice",
] as const;

export type MessagingKind = (typeof MESSAGING_KINDS)[number];

export async function getMessagingActionsForOrder(params: {
  client: SpApiClient;
  orderId: string;
  marketplaceId: string;
}) {
  const { client, orderId, marketplaceId } = params;

  return client.request({
    method: "GET",
    path: `/messaging/v1/orders/${encodeURIComponent(orderId)}`,
    query: { marketplaceIds: marketplaceId },
    rateLimitKey: "messaging.getMessagingActionsForOrder",
    defaultRateLimit: { ratePerSecond: 1, burst: 5 },
  });
}

export async function getMessagingOrderAttributes(params: {
  client: SpApiClient;
  orderId: string;
  marketplaceId: string;
}) {
  const { client, orderId, marketplaceId } = params;

  return client.request({
    method: "GET",
    path: `/messaging/v1/orders/${encodeURIComponent(orderId)}/attributes`,
    query: { marketplaceIds: marketplaceId },
    rateLimitKey: "messaging.getAttributes",
    defaultRateLimit: { ratePerSecond: 1, burst: 5 },
  });
}

/**
 * Send a Buyer-Seller message using one of the Messaging API operations.
 *
 * Hermes deliberately keeps this thin: the request body is passed through as-is.
 * Validate the allowed actions for the order first (getMessagingActionsForOrder).
 */
export async function sendMessagingMessage(params: {
  client: SpApiClient;
  orderId: string;
  marketplaceId: string;
  kind: MessagingKind;
  body?: any;
}) {
  const { client, orderId, marketplaceId, kind, body } = params;

  return client.request({
    method: "POST",
    path: `/messaging/v1/orders/${encodeURIComponent(orderId)}/messages/${encodeURIComponent(kind)}`,
    query: { marketplaceIds: marketplaceId },
    body,
    rateLimitKey: `messaging.${kind}`,
    defaultRateLimit: { ratePerSecond: 1, burst: 5 },
  });
}
