"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getHermesBasePath } from "@/lib/base-path";

export type OrdersPreferences = {
  pageSize: number;
  filterOrderId: string;
  filterMarketplaceId: string;
  filterDelivery: "any" | "has" | "missing";
  filterOrderStatus: string;
  filterReviewState: "any" | "not_queued" | "queued" | "sending" | "sent" | "failed" | "skipped";
};

export type InsightsPreferences = {
  rangeDays: 7 | 30 | 90;
};

export type LogsPreferences = {
  type: "any" | "request_review" | "buyer_message";
  status: "any" | "sent" | "ineligible" | "throttled" | "failed";
  orderIdQuery: string;
};

export type MessagingPreferences = {
  tab: "orders" | "history";
  ordersOrderIdQuery: string;
  historyOrderIdQuery: string;
  historyState: "any" | "queued" | "sending" | "sent" | "failed" | "skipped";
};

function scopedStorageKey(key: string): string {
  if (typeof document === "undefined") return key;
  return `${key}:${getHermesBasePath()}`;
}

function migrateLegacyLocalStorageKey(params: { legacy: string; next: string }): void {
  if (typeof localStorage === "undefined") return;
  if (params.legacy === params.next) return;

  const hasNext = localStorage.getItem(params.next) !== null;
  if (hasNext) return;

  const legacyValue = localStorage.getItem(params.legacy);
  if (legacyValue === null) return;

  localStorage.setItem(params.next, legacyValue);
}

type HermesUiPreferencesState = {
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;

  orders: OrdersPreferences;
  setOrdersPreferences: (next: Partial<OrdersPreferences>) => void;

  insights: InsightsPreferences;
  setInsightsPreferences: (next: Partial<InsightsPreferences>) => void;

  logs: LogsPreferences;
  setLogsPreferences: (next: Partial<LogsPreferences>) => void;

  messaging: MessagingPreferences;
  setMessagingPreferences: (next: Partial<MessagingPreferences>) => void;
};

const DEFAULT_ORDERS: OrdersPreferences = {
  pageSize: 500,
  filterOrderId: "",
  filterMarketplaceId: "any",
  filterDelivery: "any",
  filterOrderStatus: "any",
  filterReviewState: "any",
};

const DEFAULT_INSIGHTS: InsightsPreferences = {
  rangeDays: 30,
};

const DEFAULT_LOGS: LogsPreferences = {
  type: "request_review",
  status: "any",
  orderIdQuery: "",
};

const DEFAULT_MESSAGING: MessagingPreferences = {
  tab: "orders",
  ordersOrderIdQuery: "",
  historyOrderIdQuery: "",
  historyState: "any",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parsePageSize(raw: unknown): OrdersPreferences["pageSize"] {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_ORDERS.pageSize;
  const n = Math.trunc(raw);
  if (n === 25) return 25;
  if (n === 50) return 50;
  if (n === 100) return 100;
  if (n === 200) return 200;
  if (n === 500) return 500;
  return DEFAULT_ORDERS.pageSize;
}

function parseOrdersPreferences(raw: unknown): OrdersPreferences {
  const v = isRecord(raw) ? raw : {};

  const filterDeliveryRaw = v.filterDelivery;
  const filterDelivery: OrdersPreferences["filterDelivery"] =
    filterDeliveryRaw === "any" || filterDeliveryRaw === "has" || filterDeliveryRaw === "missing"
      ? filterDeliveryRaw
      : DEFAULT_ORDERS.filterDelivery;

  const filterReviewStateRaw = v.filterReviewState;
  const filterReviewState: OrdersPreferences["filterReviewState"] =
    filterReviewStateRaw === "any" ||
    filterReviewStateRaw === "not_queued" ||
    filterReviewStateRaw === "queued" ||
    filterReviewStateRaw === "sending" ||
    filterReviewStateRaw === "sent" ||
    filterReviewStateRaw === "failed" ||
    filterReviewStateRaw === "skipped"
      ? filterReviewStateRaw
      : DEFAULT_ORDERS.filterReviewState;

  return {
    pageSize: parsePageSize(v.pageSize),
    filterOrderId: typeof v.filterOrderId === "string" ? v.filterOrderId : DEFAULT_ORDERS.filterOrderId,
    filterMarketplaceId:
      typeof v.filterMarketplaceId === "string"
        ? v.filterMarketplaceId
        : DEFAULT_ORDERS.filterMarketplaceId,
    filterDelivery,
    filterOrderStatus: typeof v.filterOrderStatus === "string" ? v.filterOrderStatus : DEFAULT_ORDERS.filterOrderStatus,
    filterReviewState,
  };
}

function parseInsightsPreferences(raw: unknown): InsightsPreferences {
  const v = isRecord(raw) ? raw : {};

  const rangeDaysRaw = v.rangeDays;
  const rangeDays: InsightsPreferences["rangeDays"] =
    rangeDaysRaw === 7 || rangeDaysRaw === 30 || rangeDaysRaw === 90
      ? rangeDaysRaw
      : DEFAULT_INSIGHTS.rangeDays;

  return { rangeDays };
}

function parseLogsPreferences(raw: unknown): LogsPreferences {
  const v = isRecord(raw) ? raw : {};

  const typeRaw = v.type;
  const type: LogsPreferences["type"] =
    typeRaw === "any" || typeRaw === "request_review" || typeRaw === "buyer_message"
      ? typeRaw
      : DEFAULT_LOGS.type;

  const statusRaw = v.status;
  const status: LogsPreferences["status"] =
    statusRaw === "any" ||
    statusRaw === "sent" ||
    statusRaw === "ineligible" ||
    statusRaw === "throttled" ||
    statusRaw === "failed"
      ? statusRaw
      : DEFAULT_LOGS.status;

  return {
    type,
    status,
    orderIdQuery: typeof v.orderIdQuery === "string" ? v.orderIdQuery : DEFAULT_LOGS.orderIdQuery,
  };
}

function parseMessagingPreferences(raw: unknown): MessagingPreferences {
  const v = isRecord(raw) ? raw : {};

  const tabRaw = v.tab;
  const tab: MessagingPreferences["tab"] =
    tabRaw === "orders" || tabRaw === "history" ? tabRaw : DEFAULT_MESSAGING.tab;

  const historyStateRaw = v.historyState;
  const historyState: MessagingPreferences["historyState"] =
    historyStateRaw === "any" ||
    historyStateRaw === "queued" ||
    historyStateRaw === "sending" ||
    historyStateRaw === "sent" ||
    historyStateRaw === "failed" ||
    historyStateRaw === "skipped"
      ? historyStateRaw
      : DEFAULT_MESSAGING.historyState;

  const legacyOrderIdQuery = typeof v.orderIdQuery === "string" ? v.orderIdQuery : null;
  const legacyHistoryOrderIdQuery = typeof v.historyOrderQuery === "string" ? v.historyOrderQuery : null;

  return {
    tab,
    ordersOrderIdQuery:
      typeof v.ordersOrderIdQuery === "string"
        ? v.ordersOrderIdQuery
        : legacyOrderIdQuery ?? DEFAULT_MESSAGING.ordersOrderIdQuery,
    historyOrderIdQuery:
      typeof v.historyOrderIdQuery === "string"
        ? v.historyOrderIdQuery
        : legacyHistoryOrderIdQuery ?? DEFAULT_MESSAGING.historyOrderIdQuery,
    historyState,
  };
}

const STORAGE_KEY = scopedStorageKey("hermes.ui-preferences");
migrateLegacyLocalStorageKey({ legacy: "hermes.ui-preferences", next: STORAGE_KEY });
migrateLegacyLocalStorageKey({ legacy: "hermes.ui-preferences:", next: STORAGE_KEY });

export const useHermesUiPreferencesStore = create<HermesUiPreferencesState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      setHasHydrated(hydrated) {
        set({ hasHydrated: hydrated });
      },

      orders: DEFAULT_ORDERS,
      setOrdersPreferences(next) {
        set((state) => ({ orders: { ...state.orders, ...next } }));
      },

      insights: DEFAULT_INSIGHTS,
      setInsightsPreferences(next) {
        set((state) => ({ insights: { ...state.insights, ...next } }));
      },

      logs: DEFAULT_LOGS,
      setLogsPreferences(next) {
        set((state) => ({ logs: { ...state.logs, ...next } }));
      },

      messaging: DEFAULT_MESSAGING,
      setMessagingPreferences(next) {
        set((state) => ({ messaging: { ...state.messaging, ...next } }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        orders: state.orders,
        insights: state.insights,
        logs: state.logs,
        messaging: state.messaging,
      }),
      merge: (persisted, current) => {
        const raw = persisted as { state?: unknown } | null;
        const persistedState = raw && typeof raw === "object" && "state" in raw ? (raw as any).state : null;
        const persistedObj = isRecord(persistedState) ? persistedState : {};

        const orders = parseOrdersPreferences(persistedObj.orders);
        const insights = parseInsightsPreferences(persistedObj.insights);
        const logs = parseLogsPreferences(persistedObj.logs);
        const messaging = parseMessagingPreferences(persistedObj.messaging);

        return { ...current, orders, insights, logs, messaging };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
