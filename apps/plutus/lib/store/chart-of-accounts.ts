'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SourceFilter = 'all' | 'qbo' | 'lmb';

type ChartOfAccountsState = {
  search: string;
  sourceFilter: SourceFilter;
  selectedTypes: string[];
  selectedDetailTypes: string[];
  selectedCurrencies: string[];
  setSearch: (value: string) => void;
  setSourceFilter: (value: SourceFilter) => void;
  setSelectedTypes: (values: string[]) => void;
  setSelectedDetailTypes: (values: string[]) => void;
  setSelectedCurrencies: (values: string[]) => void;
  clearFilters: () => void;
};

const DEFAULT_STATE = {
  search: '',
  sourceFilter: 'all',
  selectedTypes: [],
  selectedDetailTypes: [],
  selectedCurrencies: [],
} satisfies Pick<
  ChartOfAccountsState,
  'search' | 'sourceFilter' | 'selectedTypes' | 'selectedDetailTypes' | 'selectedCurrencies'
>;

export const useChartOfAccountsStore = create<ChartOfAccountsState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setSearch: (search) => set({ search }),
      setSourceFilter: (sourceFilter) => set({ sourceFilter }),
      setSelectedTypes: (selectedTypes) => set({ selectedTypes }),
      setSelectedDetailTypes: (selectedDetailTypes) => set({ selectedDetailTypes }),
      setSelectedCurrencies: (selectedCurrencies) => set({ selectedCurrencies }),
      clearFilters: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: 'plutus-chart-of-accounts',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        search: state.search,
        sourceFilter: state.sourceFilter,
        selectedTypes: state.selectedTypes,
        selectedDetailTypes: state.selectedDetailTypes,
        selectedCurrencies: state.selectedCurrencies,
      }),
    },
  ),
);

