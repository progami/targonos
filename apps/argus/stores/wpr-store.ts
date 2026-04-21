'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  applyWeekScopedPatch,
  captureWeekScopedState,
  createInitialDashboardState,
  switchDashboardWeek,
  toggleSetMember,
  wprStateReplacer,
  wprStateReviver,
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
  setSelectedSqpRootIds: (rootIds: string[]) => void;
  setSelectedSqpTermIds: (termIds: string[]) => void;
  setExpandedSqpRootIds: (rootIds: string[]) => void;
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
  setSelectedCompetitorRootIds: (rootIds: string[]) => void;
  setSelectedCompetitorTermIds: (termIds: string[]) => void;
  setExpandedCompetitorRootIds: (rootIds: string[]) => void;
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

export const useWprStore = create<WprStore>()(
  persist(
    (set) => {
      const setDashboardState = (
        patch: Partial<WprDashboardState> | ((state: WprStore) => Partial<WprDashboardState>),
      ) => {
        set((state) => {
          const nextPatch = typeof patch === 'function' ? patch(state) : patch;
          return applyWeekScopedPatch(state, nextPatch);
        });
      };

      return {
        ...createInitialDashboardState(null),
        replaceState: (nextState) => {
          setDashboardState(nextState);
        },
        setActiveTab: (activeTab) => {
          setDashboardState({ activeTab });
        },
        setSelectedWeek: (selectedWeek) => {
          set((state) => switchDashboardWeek(state, selectedWeek));
        },
        setSelectedClusterId: (selectedClusterId) => {
          setDashboardState({ selectedClusterId });
        },
        setSelectedSqpRootIds: (rootIds) => {
          setDashboardState({ selectedSqpRootIds: new Set(rootIds) });
        },
        setSelectedSqpTermIds: (termIds) => {
          setDashboardState({ selectedSqpTermIds: new Set(termIds) });
        },
        setExpandedSqpRootIds: (rootIds) => {
          setDashboardState({ expandedSqpRootIds: new Set(rootIds) });
        },
        toggleSelectedSqpRootId: (rootId) => {
          setDashboardState((state) => ({
            selectedSqpRootIds: toggleSetMember(state.selectedSqpRootIds, rootId),
          }));
        },
        toggleSelectedSqpTermId: (termId) => {
          setDashboardState((state) => ({
            selectedSqpTermIds: toggleSetMember(state.selectedSqpTermIds, termId),
          }));
        },
        toggleExpandedSqpRootId: (rootId) => {
          setDashboardState((state) => ({
            expandedSqpRootIds: toggleSetMember(state.expandedSqpRootIds, rootId),
          }));
        },
        setHasInitializedSqpSelection: (value) => {
          setDashboardState({ hasInitializedSqpSelection: value });
        },
        toggleSelectedScpAsinId: (asinId) => {
          setDashboardState((state) => ({
            selectedScpAsinIds: toggleSetMember(state.selectedScpAsinIds, asinId),
          }));
        },
        setSelectedScpAsinIds: (asinIds) => {
          setDashboardState({ selectedScpAsinIds: new Set(asinIds) });
        },
        setHasInitializedScpSelection: (value) => {
          setDashboardState({ hasInitializedScpSelection: value });
        },
        toggleSelectedBusinessReportAsinId: (asinId) => {
          setDashboardState((state) => ({
            selectedBusinessReportAsinIds: toggleSetMember(state.selectedBusinessReportAsinIds, asinId),
          }));
        },
        setSelectedBusinessReportAsinIds: (asinIds) => {
          setDashboardState({ selectedBusinessReportAsinIds: new Set(asinIds) });
        },
        setHasInitializedBusinessReportSelection: (value) => {
          setDashboardState({ hasInitializedBusinessReportSelection: value });
        },
        toggleSelectedCompetitorRootId: (rootId) => {
          setDashboardState((state) => ({
            selectedCompetitorRootIds: toggleSetMember(state.selectedCompetitorRootIds, rootId),
          }));
        },
        toggleSelectedCompetitorTermId: (termId) => {
          setDashboardState((state) => ({
            selectedCompetitorTermIds: toggleSetMember(state.selectedCompetitorTermIds, termId),
          }));
        },
        toggleExpandedCompetitorRootId: (rootId) => {
          setDashboardState((state) => ({
            expandedCompetitorRootIds: toggleSetMember(state.expandedCompetitorRootIds, rootId),
          }));
        },
        setSelectedCompetitorRootIds: (rootIds) => {
          setDashboardState({ selectedCompetitorRootIds: new Set(rootIds) });
        },
        setSelectedCompetitorTermIds: (termIds) => {
          setDashboardState({ selectedCompetitorTermIds: new Set(termIds) });
        },
        setExpandedCompetitorRootIds: (rootIds) => {
          setDashboardState({ expandedCompetitorRootIds: new Set(rootIds) });
        },
        setHasInitializedCompetitorSelection: (value) => {
          setDashboardState({ hasInitializedCompetitorSelection: value });
        },
        setCompareOrganicMode: (compareOrganicMode) => {
          setDashboardState({ compareOrganicMode });
        },
        setSqpTableSort: (sqpTableSort) => {
          setDashboardState({ sqpTableSort });
        },
        setScpTableSort: (scpTableSort) => {
          setDashboardState({ scpTableSort });
        },
        setBrTableSort: (brTableSort) => {
          setDashboardState({ brTableSort });
        },
        setCompetitorTableSort: (competitorTableSort) => {
          setDashboardState({ competitorTableSort });
        },
        setSqpWowVisible: (sqpWowVisible) => {
          setDashboardState({ sqpWowVisible });
        },
        setScpWowVisible: (scpWowVisible) => {
          setDashboardState({ scpWowVisible });
        },
        setBrWowVisible: (brWowVisible) => {
          setDashboardState({ brWowVisible });
        },
        setCompWowVisible: (compWowVisible) => {
          setDashboardState({ compWowVisible });
        },
      };
    },
    {
      name: 'argus-wpr-dashboard',
      version: 1,
      storage: createJSONStorage(() => localStorage, {
        replacer: wprStateReplacer,
        reviver: wprStateReviver,
      }),
      partialize: (state) => ({
        activeTab: state.activeTab,
        selectedWeek: state.selectedWeek,
        weekStateByWeek: state.weekStateByWeek,
        ...captureWeekScopedState(state),
        compareOrganicMode: state.compareOrganicMode,
        sqpTableSort: state.sqpTableSort,
        scpTableSort: state.scpTableSort,
        brTableSort: state.brTableSort,
        competitorTableSort: state.competitorTableSort,
        sqpWowVisible: state.sqpWowVisible,
        scpWowVisible: state.scpWowVisible,
        brWowVisible: state.brWowVisible,
        compWowVisible: state.compWowVisible,
      }),
    },
  ),
);
