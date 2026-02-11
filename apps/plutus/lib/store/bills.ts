'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BillsState = {
  page: number;
  startDate: string;
  endDate: string;
  setPage: (page: number) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  clearDates: () => void;
};

const DEFAULT_STATE = {
  page: 1,
  startDate: '',
  endDate: '',
} satisfies Pick<BillsState, 'page' | 'startDate' | 'endDate'>;

export const useBillsStore = create<BillsState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setPage: (page) => set({ page }),
      setStartDate: (startDate) => set({ startDate }),
      setEndDate: (endDate) => set({ endDate }),
      clearDates: () => set({ startDate: '', endDate: '', page: 1 }),
    }),
    {
      name: 'plutus-bills',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        page: state.page,
        startDate: state.startDate,
        endDate: state.endDate,
      }),
    },
  ),
);
