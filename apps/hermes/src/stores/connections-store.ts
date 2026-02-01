import { create } from "zustand";
import type { AmazonConnection } from "@/lib/types";
import { hermesApiUrl } from "@/lib/base-path";

type ConnectionsState = {
  connections: AmazonConnection[];
  loaded: boolean;
  loading: boolean;
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string) => void;
  fetch: () => Promise<void>;
};

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  loaded: false,
  loading: false,
  activeConnectionId: null,
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
      const nextActive = activeExists
        ? (active as string)
        : (nextConnections[0]?.id ?? null);

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
}));
