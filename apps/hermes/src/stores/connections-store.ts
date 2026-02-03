"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AmazonConnection } from "@/lib/types";
import { getHermesBasePath, hermesApiUrl } from "@/lib/base-path";

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
