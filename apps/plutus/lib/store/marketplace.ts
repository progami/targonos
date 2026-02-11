'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Marketplace = 'all' | 'US' | 'UK';

type MarketplaceState = {
  marketplace: Marketplace;
  setMarketplace: (marketplace: Marketplace) => void;
};

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set) => ({
      marketplace: 'all',
      setMarketplace: (marketplace) => set({ marketplace }),
    }),
    {
      name: 'plutus-marketplace',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        marketplace: state.marketplace,
      }),
    },
  ),
);
