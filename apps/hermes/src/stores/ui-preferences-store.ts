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
  pageSize: 50,
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

        const orders = {
          ...DEFAULT_ORDERS,
          ...(persistedState && typeof persistedState === "object" ? (persistedState as any).orders : null),
        };
        const insights = {
          ...DEFAULT_INSIGHTS,
          ...(persistedState && typeof persistedState === "object" ? (persistedState as any).insights : null),
        };
        const logs = {
          ...DEFAULT_LOGS,
          ...(persistedState && typeof persistedState === "object" ? (persistedState as any).logs : null),
        };
        const messaging = {
          ...DEFAULT_MESSAGING,
          ...(persistedState && typeof persistedState === "object" ? (persistedState as any).messaging : null),
        };

        return { ...current, ...(persistedState as any), orders, insights, logs, messaging };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
