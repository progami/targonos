"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getHermesBasePath } from "@/lib/base-path";

export type OrdersPreferences = {
  pageSize: number;
  filterMarketplaceId: string;
  filterDelivery: "any" | "has" | "missing";
  filterOrderStatus: string;
  filterReviewState: "any" | "not_queued" | "queued" | "sending" | "sent" | "failed" | "skipped";
};

export type InsightsPreferences = {
  rangeDays: 7 | 30 | 90;
};

function scopedStorageKey(key: string): string {
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
};

const DEFAULT_ORDERS: OrdersPreferences = {
  pageSize: 50,
  filterMarketplaceId: "any",
  filterDelivery: "any",
  filterOrderStatus: "any",
  filterReviewState: "any",
};

const DEFAULT_INSIGHTS: InsightsPreferences = {
  rangeDays: 30,
};

const STORAGE_KEY = scopedStorageKey("hermes.ui-preferences");
migrateLegacyLocalStorageKey({ legacy: "hermes.ui-preferences", next: STORAGE_KEY });

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
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        orders: state.orders,
        insights: state.insights,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
