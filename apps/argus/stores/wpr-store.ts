'use client';

import { create } from 'zustand';

type WprStore = {
  selectedWeek: string | null;
  selectedClusterId: string | null;
  setSelectedWeek: (week: string) => void;
  setSelectedClusterId: (clusterId: string | null) => void;
};

export const useWprStore = create<WprStore>((set) => ({
  selectedWeek: null,
  selectedClusterId: null,
  setSelectedWeek: (selectedWeek) => {
    set({ selectedWeek });
  },
  setSelectedClusterId: (selectedClusterId) => {
    set({ selectedClusterId });
  },
}));
