import { create } from "zustand";
import type { AmazonConnection } from "@/lib/types";
import { hermesApiUrl } from "@/lib/base-path";

type ConnectionsState = {
  connections: AmazonConnection[];
  loaded: boolean;
  loading: boolean;
  fetch: () => Promise<void>;
};

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  loaded: false,
  loading: false,
  async fetch() {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch(hermesApiUrl("/api/accounts"));
      const json = await res.json();
      set({ connections: json.accounts ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
}));
