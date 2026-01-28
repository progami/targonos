/**
 * NOTE:
 * Amazon's "Request a Review" solicitation has strict eligibility rules.
 * Treat these constants as placeholders until you verify per-region policies and SP-API behavior.
 *
 * Hermes should:
 * - always validate eligibility before enqueueing
 * - be conservative when unsure (skip rather than risk policy violations)
 */

export const DEFAULT_EARLIEST_DAYS_AFTER_DELIVERY = 5;
export const DEFAULT_LATEST_DAYS_AFTER_DELIVERY = 30;

export function computeDefaultEligibilityWindow(deliveredAt: Date) {
  const earliest = new Date(deliveredAt);
  earliest.setDate(earliest.getDate() + DEFAULT_EARLIEST_DAYS_AFTER_DELIVERY);

  const latest = new Date(deliveredAt);
  latest.setDate(latest.getDate() + DEFAULT_LATEST_DAYS_AFTER_DELIVERY);

  return { earliest, latest };
}

export function isWithinWindow(now: Date, window: { earliest: Date; latest: Date }) {
  return now.getTime() >= window.earliest.getTime() && now.getTime() <= window.latest.getTime();
}
