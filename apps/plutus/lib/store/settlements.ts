'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettlementsListState = {
  searchInput: string;
  search: string;
  startDate: string;
  endDate: string;
  page: number;
  setSearchInput: (value: string) => void;
  setSearch: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setPage: (page: number) => void;
  clear: () => void;
};

const DEFAULT_STATE = {
  searchInput: '',
  search: '',
  startDate: '',
  endDate: '',
  page: 1,
} satisfies Pick<SettlementsListState, 'searchInput' | 'search' | 'startDate' | 'endDate' | 'page'>;

export const useSettlementsListStore = create<SettlementsListState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setSearchInput: (searchInput) => set({ searchInput }),
      setSearch: (search) => set({ search }),
      setStartDate: (startDate) => set({ startDate }),
      setEndDate: (endDate) => set({ endDate }),
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
        page: state.page,
      }),
    },
  ),
);

