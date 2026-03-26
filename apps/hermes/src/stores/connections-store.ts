"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AmazonConnection } from "@/lib/types";
import { getHermesBasePath, hermesApiUrl } from "@/lib/base-path";

function scopedStorageKey(key: string): string {
  if (typeof document === "undefined") return key;
  return `${key}:${getHermesBasePath()}`;
}

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage?.getItem !== "function") return null;
  if (typeof window.localStorage?.setItem !== "function") return null;
  return window.localStorage;
}

function migrateLegacyLocalStorageKey(params: { legacy: string; next: string }): void {
  const storage = getBrowserLocalStorage();
  if (storage === null) return;
  if (params.legacy === params.next) return;

  const hasNext = storage.getItem(params.next) !== null;
  if (hasNext) return;

  const legacyValue = storage.getItem(params.legacy);
  if (legacyValue === null) return;

  storage.setItem(params.next, legacyValue);
}

type ConnectionsState = {
  connections: AmazonConnection[];
  loaded: boolean;
  loading: boolean;
  hasHydrated: boolean;
  activeConnectionId: string | null;
  setHasHydrated: (hydrated: boolean) => void;
  setActiveConnectionId: (id: string) => void;
  fetch: () => Promise<void>;
};

const STORAGE_KEY = scopedStorageKey("hermes.connections");
migrateLegacyLocalStorageKey({ legacy: "hermes.connections", next: STORAGE_KEY });
migrateLegacyLocalStorageKey({ legacy: "hermes.connections:", next: STORAGE_KEY });

export const useConnectionsStore = create<ConnectionsState>()(
  persist(
    (set, get) => ({
      connections: [],
      loaded: false,
      loading: false,
      hasHydrated: false,
      activeConnectionId: null,
      setHasHydrated(hydrated) {
        set({ hasHydrated: hydrated });
      },
      setActiveConnectionId(id) {
        set({ activeConnectionId: id });
      },
      async fetch() {
        if (get().loaded || get().loading) return;
        set({ loading: true });
        try {
          const res = await fetch(hermesApiUrl("/api/accounts"));
          const json = await res.json();
          const nextConnections = Array.isArray(json?.accounts) ? (json.accounts as AmazonConnection[]) : [];

          const active = get().activeConnectionId;
          const activeExists = typeof active === "string" && nextConnections.some((c) => c.id === active);
          const nextActive = activeExists ? (active as string) : (nextConnections[0]?.id ?? null);

          set({
            connections: nextConnections,
            activeConnectionId: nextActive,
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeConnectionId: state.activeConnectionId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
