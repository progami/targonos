import type {
  AmazonConnection,
  Campaign,
  DispatchAttempt,
  Experiment,
  Template,
} from "@/lib/types";

export const connections: AmazonConnection[] = [
  {
    id: "conn_01",
    accountName: "TargonOS Demo Seller",
    region: "NA",
    marketplaceIds: ["ATVPDKIKX0DER"],
    sellerId: "A1DEMOSELLER",
    status: "connected",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  },
  {
    id: "conn_02",
    accountName: "UK Seller (Sandbox)",
    region: "EU",
    marketplaceIds: ["A1F83G8C2ARO7P"],
    sellerId: "A1EUDEMO",
    status: "needs_reauth",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  },
];

export const campaigns: Campaign[] = [
  {
    id: "camp_01",
    name: "Review Request • Default",
    channel: "amazon_solicitations",
    status: "live",
    connectionId: "conn_01",
    schedule: {
      delayDays: 7,
      timeWindow: {
        startHourLocal: 9,
        endHourLocal: 18,
        timeZone: "America/Los_Angeles",
      },
      sendTimeOptimization: "off",
      randomDelayMinutes: { minMinutes: 0, maxMinutes: 90 },
    },
    controlHoldoutPct: 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: "camp_02",
    name: "Review Request • Quiet Hours + STO",
    channel: "amazon_solicitations",
    status: "paused",
    connectionId: "conn_01",
    schedule: {
      delayDays: 10,
      timeWindow: {
        startHourLocal: 10,
        endHourLocal: 16,
        timeZone: "America/New_York",
      },
      sendTimeOptimization: "best_hour",
    },
    controlHoldoutPct: 10,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export const experiments: Experiment[] = [
  {
    id: "exp_01",
    name: "Delay Days Test (7 vs 10)",
    status: "running",
    campaignId: "camp_01",
    allocations: [
      { variantId: "delay_7", pct: 50 },
      { variantId: "delay_10", pct: 50 },
    ],
    primaryMetric: "amazon_review_submitted_rate",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
];

export const templates: Template[] = [
  {
    id: "tpl_01",
    name: "Amazon Request a Review",
    channel: "amazon_solicitations",
    editable: false,
    description:
      "Amazon-controlled template. Hermes controls timing/eligibility/experiments, not message copy.",
  },
];

export const dispatches: DispatchAttempt[] = [
  {
    id: "disp_01",
    campaignId: "camp_01",
    orderId: "112-1234567-1234567",
    marketplaceId: "ATVPDKIKX0DER",
    status: "sent",
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "disp_02",
    campaignId: "camp_01",
    orderId: "112-1111111-2222222",
    marketplaceId: "ATVPDKIKX0DER",
    status: "ineligible",
    reason: "Outside allowed window",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "disp_03",
    campaignId: "camp_02",
    orderId: "112-9999999-8888888",
    marketplaceId: "ATVPDKIKX0DER",
    status: "rate_limited",
    reason: "Amazon throttling",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];
