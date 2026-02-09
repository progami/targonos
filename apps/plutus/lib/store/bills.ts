'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BillsTab = 'guide' | 'editor';

type BillsState = {
  tab: BillsTab;
  page: number;
  startDate: string;
  endDate: string;
  setTab: (tab: BillsTab) => void;
  setPage: (page: number) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  clearDates: () => void;
};

const DEFAULT_STATE = {
  tab: 'guide',
  page: 1,
  startDate: '',
  endDate: '',
} satisfies Pick<BillsState, 'tab' | 'page' | 'startDate' | 'endDate'>;

export const useBillsStore = create<BillsState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setTab: (tab) => set({ tab }),
      setPage: (page) => set({ page }),
      setStartDate: (startDate) => set({ startDate }),
      setEndDate: (endDate) => set({ endDate }),
      clearDates: () => set({ startDate: '', endDate: '', page: 1 }),
    }),
    {
      name: 'plutus-bills',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tab: state.tab,
        page: state.page,
        startDate: state.startDate,
        endDate: state.endDate,
      }),
    },
  ),
);
