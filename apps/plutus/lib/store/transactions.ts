'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TransactionsTab = 'journalEntry' | 'bill' | 'purchase';

type TransactionsState = {
  tab: TransactionsTab;
  searchInput: string;
  search: string;
  startDate: string;
  endDate: string;
  page: number;
  setTab: (tab: TransactionsTab) => void;
  setSearchInput: (value: string) => void;
  setSearch: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setPage: (page: number) => void;
  clear: () => void;
};

const DEFAULT_STATE = {
  tab: 'journalEntry',
  searchInput: '',
  search: '',
  startDate: '',
  endDate: '',
  page: 1,
} satisfies Pick<TransactionsState, 'tab' | 'searchInput' | 'search' | 'startDate' | 'endDate' | 'page'>;

export const useTransactionsStore = create<TransactionsState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setTab: (tab) => set({ tab }),
      setSearchInput: (searchInput) => set({ searchInput }),
      setSearch: (search) => set({ search }),
      setStartDate: (startDate) => set({ startDate }),
      setEndDate: (endDate) => set({ endDate }),
      setPage: (page) => set({ page }),
      clear: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: 'plutus-transactions',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tab: state.tab,
        searchInput: state.searchInput,
        search: state.search,
        startDate: state.startDate,
        endDate: state.endDate,
        page: state.page,
      }),
    },
  ),
);

