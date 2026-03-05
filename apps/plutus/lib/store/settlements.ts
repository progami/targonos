'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const SETTLEMENT_LIST_STATUSES = ['Pending', 'Processed', 'RolledBack'] as const;

export type SettlementListStatus = (typeof SETTLEMENT_LIST_STATUSES)[number];

type SettlementsListState = {
  searchInput: string;
  search: string;
  startDate: string;
  endDate: string;
  statusFilter: SettlementListStatus[];
  totalMin: string;
  totalMax: string;
  page: number;
  setSearchInput: (value: string) => void;
  setSearch: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setStatusFilter: (value: SettlementListStatus[]) => void;
  setTotalMin: (value: string) => void;
  setTotalMax: (value: string) => void;
  setPage: (page: number) => void;
  clear: () => void;
};

const DEFAULT_STATE = {
  searchInput: '',
  search: '',
  startDate: '',
  endDate: '',
  statusFilter: [] as SettlementListStatus[],
  totalMin: '',
  totalMax: '',
  page: 1,
} satisfies Pick<SettlementsListState, 'searchInput' | 'search' | 'startDate' | 'endDate' | 'statusFilter' | 'totalMin' | 'totalMax' | 'page'>;

export const useSettlementsListStore = create<SettlementsListState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setSearchInput: (searchInput) => set({ searchInput }),
      setSearch: (search) => set({ search }),
      setStartDate: (startDate) => set({ startDate }),
      setEndDate: (endDate) => set({ endDate }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setTotalMin: (totalMin) => set({ totalMin }),
      setTotalMax: (totalMax) => set({ totalMax }),
      setPage: (page) => set({ page }),
      clear: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: 'plutus-settlements-list',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        searchInput: state.searchInput,
        search: state.search,
        startDate: state.startDate,
        endDate: state.endDate,
        statusFilter: state.statusFilter,
        totalMin: state.totalMin,
        totalMax: state.totalMax,
        page: state.page,
      }),
    },
  ),
);
