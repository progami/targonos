type ReviewEligibilityOrder = {
  orderStatus?: string | null;
  raw?: unknown;
};

const SIGNAL_KEY_TOKENS = ["status", "state", "reason", "type", "event", "action", "result", "outcome", "flag"];
const NEGATIVE_SIGNAL_VALUES = new Set(["", "0", "false", "no", "none", "null", "na", "n/a", "unknown"]);
const TRUTHY_SIGNAL_VALUES = new Set(["1", "true", "yes", "y"]);
const RETURN_REFUND_BOOLEAN_KEYS = new Set([
  "isreturned",
  "returned",
  "wasreturned",
  "hasreturned",
  "hasreturn",
  "returnrequested",
  "isreturnrequested",
  "wasreturnrequested",
  "isrefunded",
  "refunded",
  "wasrefunded",
  "hasrefunded",
  "hasrefund",
  "refundrequested",
  "isrefundrequested",
  "wasrefundrequested",
]);
const RETURN_REFUND_STATUS_VALUES = new Set([
  "returned",
  "returnrequested",
  "returninitiated",
  "returnreceived",
  "returncompleted",
  "returnedtoseller",
  "refunded",
  "refundrequested",
  "refundinitiated",
  "refundissued",
  "partiallyrefunded",
]);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasReturnOrRefundTerm(normalizedValue: string): boolean {
  if (normalizedValue.includes("notreturned") || normalizedValue.includes("notrefunded")) return false;
  if (normalizedValue.includes("noreturn") || normalizedValue.includes("norefund")) return false;
  if (normalizedValue.includes("return")) return true;
  if (normalizedValue.includes("refund")) return true;
  return false;
}

function isSignalKey(normalizedKey: string): boolean {
  return SIGNAL_KEY_TOKENS.some((token) => normalizedKey.includes(token));
}

function isCountLikeKey(normalizedKey: string): boolean {
  if (normalizedKey.includes("count")) return true;
  if (normalizedKey.includes("qty")) return true;
  if (normalizedKey.includes("quantity")) return true;
  if (normalizedKey.includes("amount")) return true;
  return false;
}

function stringSignalsRefundOrReturn(value: string): boolean {
  const normalizedValue = normalizeToken(value);
  if (!normalizedValue) return false;
  if (RETURN_REFUND_STATUS_VALUES.has(normalizedValue)) return true;
  return hasReturnOrRefundTerm(normalizedValue);
}

export function isOrderRefundedOrReturned(order: ReviewEligibilityOrder): boolean {
  if (typeof order.orderStatus === "string" && stringSignalsRefundOrReturn(order.orderStatus)) {
    return true;
  }

  const root = order.raw;
  if (!root || typeof root !== "object") return false;

  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  let scannedNodes = 0;
  const maxNodes = 2000;

  while (stack.length > 0 && scannedNodes < maxNodes) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const entries: Array<[string, unknown]> = Array.isArray(current)
      ? current.map((value, index) => [String(index), value])
      : Object.entries(current as Record<string, unknown>);

    for (const [key, value] of entries) {
      scannedNodes += 1;
      if (scannedNodes > maxNodes) break;

      const normalizedKey = normalizeToken(key);
      const keyHasReturnOrRefund =
        normalizedKey.includes("return") || normalizedKey.includes("refund");
      const keyIsSignal = isSignalKey(normalizedKey);

      if (typeof value === "boolean") {
        if (value && RETURN_REFUND_BOOLEAN_KEYS.has(normalizedKey)) return true;
        continue;
      }

      if (typeof value === "number") {
        if (value > 0 && keyHasReturnOrRefund && isCountLikeKey(normalizedKey)) return true;
        continue;
      }

      if (typeof value === "string") {
        const normalizedValue = normalizeToken(value);
        if (!normalizedValue) continue;

        if (keyIsSignal && hasReturnOrRefundTerm(normalizedValue)) return true;

        if (keyHasReturnOrRefund && keyIsSignal) {
          if (NEGATIVE_SIGNAL_VALUES.has(normalizedValue)) continue;
          if (TRUTHY_SIGNAL_VALUES.has(normalizedValue)) return true;
          if (hasReturnOrRefundTerm(normalizedValue)) return true;
        }
        continue;
      }

      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return false;
}
