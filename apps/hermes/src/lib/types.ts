export type AmazonRegion = "NA" | "EU" | "FE";

export type Channel = "amazon_solicitations";

export type CampaignStatus = "draft" | "live" | "paused" | "archived";

export type ExperimentStatus = "draft" | "running" | "stopped";

export type DispatchStatus =
  | "queued"
  | "skipped"
  | "sent"
  | "failed"
  | "rate_limited"
  | "ineligible";

export type TimeWindow = {
  /** 0-23 */
  startHourLocal: number;
  /** 0-23 */
  endHourLocal: number;
  /** IANA tz like 'America/Los_Angeles' */
  timeZone: string;
};

export type QuietHours = {
  enabled: boolean;
  startHourLocal: number;
  endHourLocal: number;
  timeZone: string;
};

export type RandomDelay = {
  /** Spread calls across time to avoid rate-limit bursts */
  minMinutes: number;
  maxMinutes: number;
};

export type ReviewRequestSchedule = {
  /** e.g. send 7 days after delivery */
  delayDays: number;
  /** Optional time window constraints */
  timeWindow?: TimeWindow;
  /** Optional random spread (jitter) applied before sending */
  randomDelayMinutes?: RandomDelay;
  /** If enabled, Hermes picks an allowed hour based on past engagement (future lever) */
  sendTimeOptimization: "off" | "best_hour";
};

export type Campaign = {
  id: string;
  name: string;
  channel: Channel;
  status: CampaignStatus;
  connectionId: string;
  schedule: ReviewRequestSchedule;

  /**
   * Experiment controls:
   * - controlHoldoutPct: percent of eligible orders that will NOT be contacted, used for lift measurement.
   */
  controlHoldoutPct: number;

  createdAt: string;
  updatedAt: string;
};

export type Experiment = {
  id: string;
  name: string;
  status: ExperimentStatus;
  campaignId: string;

  /** Randomized allocation for variants */
  allocations: Array<{
    variantId: string;
    pct: number;
  }>;

  /** Which metric decides the winner (future) */
  primaryMetric:
    | "amazon_review_submitted_rate"
    | "amazon_star_rating_avg"
    | "amazon_return_rate";

  startedAt?: string;
  endedAt?: string;
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  channel: Channel;
  /**
   * For Amazon solicitations (Request a Review), content is not editable.
   * We keep Template here as a product abstraction for future channels.
   */
  editable: boolean;
};

export type AmazonConnection = {
  id: string;
  accountName: string;
  region: AmazonRegion;
  marketplaceIds: string[];
  sellerId: string;
  status: "connected" | "needs_reauth" | "disconnected";
  createdAt: string;
};

export type DispatchAttempt = {
  id: string;
  campaignId: string;
  orderId: string;
  marketplaceId: string;
  status: DispatchStatus;
  reason?: string;
  createdAt: string;
};
