'use client';

import { create } from 'zustand';
import {
  createInitialDashboardState,
  toggleSetMember,
  type WprBrWowVisible,
  type WprCompWowVisible,
  type WprCompareOrganicMode,
  type WprDashboardState,
  type WprScpWowVisible,
  type WprSortState,
  type WprSqpWowVisible,
  type WprTab,
} from '@/lib/wpr/dashboard-state';
import type { WeekLabel } from '@/lib/wpr/types';

type WprStore = WprDashboardState & {
  replaceState: (nextState: Partial<WprDashboardState>) => void;
  setActiveTab: (activeTab: WprTab) => void;
  setSelectedWeek: (selectedWeek: WeekLabel) => void;
  setSelectedClusterId: (selectedClusterId: string | null) => void;
  toggleSelectedSqpRootId: (rootId: string) => void;
  toggleSelectedSqpTermId: (termId: string) => void;
  toggleExpandedSqpRootId: (rootId: string) => void;
  setHasInitializedSqpSelection: (value: boolean) => void;
  toggleSelectedScpAsinId: (asinId: string) => void;
  setSelectedScpAsinIds: (asinIds: string[]) => void;
  setHasInitializedScpSelection: (value: boolean) => void;
  toggleSelectedBusinessReportAsinId: (asinId: string) => void;
  setSelectedBusinessReportAsinIds: (asinIds: string[]) => void;
  setHasInitializedBusinessReportSelection: (value: boolean) => void;
  toggleSelectedCompetitorRootId: (rootId: string) => void;
  toggleSelectedCompetitorTermId: (termId: string) => void;
  toggleExpandedCompetitorRootId: (rootId: string) => void;
  setHasInitializedCompetitorSelection: (value: boolean) => void;
  setCompareOrganicMode: (compareOrganicMode: WprCompareOrganicMode) => void;
  setSqpTableSort: (sqpTableSort: WprSortState) => void;
  setScpTableSort: (scpTableSort: WprSortState) => void;
  setBrTableSort: (brTableSort: WprSortState) => void;
  setCompetitorTableSort: (competitorTableSort: WprSortState) => void;
  setSqpWowVisible: (sqpWowVisible: WprSqpWowVisible) => void;
  setScpWowVisible: (scpWowVisible: WprScpWowVisible) => void;
  setBrWowVisible: (brWowVisible: WprBrWowVisible) => void;
  setCompWowVisible: (compWowVisible: WprCompWowVisible) => void;
};

export const useWprStore = create<WprStore>((set) => ({
  ...createInitialDashboardState(null),
  replaceState: (nextState) => {
    set(nextState);
  },
  setActiveTab: (activeTab) => {
    set({ activeTab });
  },
  setSelectedWeek: (selectedWeek) => {
    set({ selectedWeek });
  },
  setSelectedClusterId: (selectedClusterId) => {
    set({ selectedClusterId });
  },
  toggleSelectedSqpRootId: (rootId) => {
    set((state) => ({
      selectedSqpRootIds: toggleSetMember(state.selectedSqpRootIds, rootId),
    }));
  },
  toggleSelectedSqpTermId: (termId) => {
    set((state) => ({
      selectedSqpTermIds: toggleSetMember(state.selectedSqpTermIds, termId),
    }));
  },
  toggleExpandedSqpRootId: (rootId) => {
    set((state) => ({
      expandedSqpRootIds: toggleSetMember(state.expandedSqpRootIds, rootId),
    }));
  },
  setHasInitializedSqpSelection: (value) => {
    set({ hasInitializedSqpSelection: value });
  },
  toggleSelectedScpAsinId: (asinId) => {
    set((state) => ({
      selectedScpAsinIds: toggleSetMember(state.selectedScpAsinIds, asinId),
    }));
  },
  setSelectedScpAsinIds: (asinIds) => {
    set({ selectedScpAsinIds: new Set(asinIds) });
  },
  setHasInitializedScpSelection: (value) => {
    set({ hasInitializedScpSelection: value });
  },
  toggleSelectedBusinessReportAsinId: (asinId) => {
    set((state) => ({
      selectedBusinessReportAsinIds: toggleSetMember(state.selectedBusinessReportAsinIds, asinId),
    }));
  },
  setSelectedBusinessReportAsinIds: (asinIds) => {
    set({ selectedBusinessReportAsinIds: new Set(asinIds) });
  },
  setHasInitializedBusinessReportSelection: (value) => {
    set({ hasInitializedBusinessReportSelection: value });
  },
  toggleSelectedCompetitorRootId: (rootId) => {
    set((state) => ({
      selectedCompetitorRootIds: toggleSetMember(state.selectedCompetitorRootIds, rootId),
    }));
  },
  toggleSelectedCompetitorTermId: (termId) => {
    set((state) => ({
      selectedCompetitorTermIds: toggleSetMember(state.selectedCompetitorTermIds, termId),
    }));
  },
  toggleExpandedCompetitorRootId: (rootId) => {
    set((state) => ({
      expandedCompetitorRootIds: toggleSetMember(state.expandedCompetitorRootIds, rootId),
    }));
  },
  setHasInitializedCompetitorSelection: (value) => {
    set({ hasInitializedCompetitorSelection: value });
  },
  setCompareOrganicMode: (compareOrganicMode) => {
    set({ compareOrganicMode });
  },
  setSqpTableSort: (sqpTableSort) => {
    set({ sqpTableSort });
  },
  setScpTableSort: (scpTableSort) => {
    set({ scpTableSort });
  },
  setBrTableSort: (brTableSort) => {
    set({ brTableSort });
  },
  setCompetitorTableSort: (competitorTableSort) => {
    set({ competitorTableSort });
  },
  setSqpWowVisible: (sqpWowVisible) => {
    set({ sqpWowVisible });
  },
  setScpWowVisible: (scpWowVisible) => {
    set({ scpWowVisible });
  },
  setBrWowVisible: (brWowVisible) => {
    set({ brWowVisible });
  },
  setCompWowVisible: (compWowVisible) => {
    set({ compWowVisible });
  },
}));
