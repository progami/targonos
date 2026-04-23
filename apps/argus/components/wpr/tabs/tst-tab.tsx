'use client'

import { useEffect } from 'react'
import { Box, Stack } from '@mui/material'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import {
  competitorRootTermIds,
  createTstViewModel,
} from '@/lib/wpr/tst-view-model'
import { buildBundleWeekStartDateLookup, formatWeekWindowLabel } from '@/lib/wpr/week-display'
import { useWprStore } from '@/stores/wpr-store'
import TstSelectionTable from './tst-selection-table'
import TstWeeklyPanel from './tst-weekly-panel'

function filterIds(ids: Set<string>, allowedIds: Set<string>): string[] {
  return Array.from(ids).filter((id) => allowedIds.has(id))
}

export default function TstTab({
  bundle,
  changeEntries,
}: {
  bundle: WprWeekBundle
  changeEntries: WprChangeLogEntry[]
}) {
  const selectedCompetitorRootIds = useWprStore((state) => state.selectedCompetitorRootIds)
  const setSelectedCompetitorRootIds = useWprStore((state) => state.setSelectedCompetitorRootIds)
  const selectedCompetitorTermIds = useWprStore((state) => state.selectedCompetitorTermIds)
  const setSelectedCompetitorTermIds = useWprStore((state) => state.setSelectedCompetitorTermIds)
  const expandedCompetitorRootIds = useWprStore((state) => state.expandedCompetitorRootIds)
  const setExpandedCompetitorRootIds = useWprStore((state) => state.setExpandedCompetitorRootIds)
  const hasInitializedCompetitorSelection = useWprStore((state) => state.hasInitializedCompetitorSelection)
  const setHasInitializedCompetitorSelection = useWprStore((state) => state.setHasInitializedCompetitorSelection)
  const competitorTableSort = useWprStore((state) => state.competitorTableSort)
  const setCompetitorTableSort = useWprStore((state) => state.setCompetitorTableSort)
  const compWowVisible = useWprStore((state) => state.compWowVisible)
  const setCompWowVisible = useWprStore((state) => state.setCompWowVisible)
  const selectedWeek = useWprStore((state) => state.selectedWeek)
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek)

  if (selectedWeek === null) {
    throw new Error('Missing WPR table week')
  }

  useEffect(() => {
    const rootIdSet = new Set(bundle.clusters.map((cluster) => cluster.id))
    const allowedTermIds = new Set<string>()
    for (const cluster of bundle.clusters) {
      for (const termId of competitorRootTermIds(bundle, cluster.id, selectedWeek)) {
        allowedTermIds.add(termId)
      }
    }

    const filteredRootIds = filterIds(selectedCompetitorRootIds, rootIdSet)
    const filteredTermIds = filterIds(selectedCompetitorTermIds, allowedTermIds)
    const filteredExpandedIds = filterIds(expandedCompetitorRootIds, rootIdSet)

    if (!hasInitializedCompetitorSelection) {
      setSelectedCompetitorRootIds([])
      setSelectedCompetitorTermIds([])
      setExpandedCompetitorRootIds([])
      setHasInitializedCompetitorSelection(true)
      return
    }

    if (selectedCompetitorRootIds.size > 0 && filteredRootIds.length === 0) {
      setSelectedCompetitorRootIds([])
      setSelectedCompetitorTermIds([])
      setExpandedCompetitorRootIds([])
      return
    }

    if (filteredRootIds.length !== selectedCompetitorRootIds.size) {
      setSelectedCompetitorRootIds(filteredRootIds)
    }

    if (filteredTermIds.length !== selectedCompetitorTermIds.size) {
      setSelectedCompetitorTermIds(filteredTermIds)
    }

    if (filteredExpandedIds.length !== expandedCompetitorRootIds.size) {
      setExpandedCompetitorRootIds(filteredExpandedIds)
    }
  }, [
    bundle,
    expandedCompetitorRootIds,
    hasInitializedCompetitorSelection,
    selectedCompetitorRootIds,
    selectedCompetitorTermIds,
    setExpandedCompetitorRootIds,
    setHasInitializedCompetitorSelection,
    setSelectedCompetitorRootIds,
    setSelectedCompetitorTermIds,
    selectedWeek,
  ])

  const viewModel = createTstViewModel({
    bundle,
    selectedRootIds: selectedCompetitorRootIds,
    selectedTermIds: selectedCompetitorTermIds,
    selectedWeek,
  })

  const familyOrder: string[] = []
  for (const cluster of bundle.clusters) {
    if (!familyOrder.includes(cluster.family)) {
      familyOrder.push(cluster.family)
    }
  }

  const weekStartDates = buildBundleWeekStartDateLookup(bundle)
  const historyLabel = formatWeekWindowLabel(bundle.meta.baselineWindow, weekStartDates)
  const competitor = bundle.meta.competitor

  const handleSetRootSelection = (rootId: string, shouldSelect: boolean) => {
    const nextRootIds = new Set(selectedCompetitorRootIds)
    const nextTermIds = new Set(selectedCompetitorTermIds)
    const termIds = competitorRootTermIds(bundle, rootId, selectedWeek)

    if (shouldSelect) {
      nextRootIds.add(rootId)
      for (const termId of termIds) {
        nextTermIds.add(termId)
      }
    } else {
      nextRootIds.delete(rootId)
      for (const termId of termIds) {
        nextTermIds.delete(termId)
      }
    }

    setSelectedCompetitorRootIds(Array.from(nextRootIds))
    setSelectedCompetitorTermIds(Array.from(nextTermIds))
    setHasInitializedCompetitorSelection(true)
  }

  const handleToggleTerm = (rootId: string, termId: string) => {
    const nextRootIds = new Set(selectedCompetitorRootIds)
    const nextTermIds = new Set(selectedCompetitorTermIds)

    if (nextTermIds.has(termId)) {
      nextTermIds.delete(termId)
    } else {
      nextTermIds.add(termId)
    }

    let rootStillSelected = false
    for (const candidateTermId of competitorRootTermIds(bundle, rootId, selectedWeek)) {
      if (nextTermIds.has(candidateTermId)) {
        rootStillSelected = true
        break
      }
    }

    if (rootStillSelected) {
      nextRootIds.add(rootId)
    } else {
      nextRootIds.delete(rootId)
    }

    setSelectedCompetitorRootIds(Array.from(nextRootIds))
    setSelectedCompetitorTermIds(Array.from(nextTermIds))
    setHasInitializedCompetitorSelection(true)
  }

  if (bundle.clusters.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.8rem',
          letterSpacing: '0.03em',
        }}
      >
        No TST data for the selected window.
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      <TstWeeklyPanel
        viewModel={viewModel}
        changeEntries={changeEntries}
        historyLabel={historyLabel}
        weekStartDates={weekStartDates}
        wowVisible={compWowVisible}
        setWowVisible={setCompWowVisible}
      />
      <TstSelectionTable
        selectedWeek={selectedWeek}
        weeks={bundle.weeks}
        weekStartDates={weekStartDates}
        competitorBrand={competitor.brand}
        familyOrder={familyOrder}
        viewModel={viewModel}
        expandedRootIds={expandedCompetitorRootIds}
        sortState={competitorTableSort}
        setSortState={setCompetitorTableSort}
        onSelectWeek={setSelectedWeek}
        onSelectAll={() => {
          setSelectedCompetitorRootIds(bundle.clusters.map((cluster) => cluster.id))
          const allTermIds: string[] = []
          for (const cluster of bundle.clusters) {
            allTermIds.push(...competitorRootTermIds(bundle, cluster.id, selectedWeek))
          }
          setSelectedCompetitorTermIds(allTermIds)
          setHasInitializedCompetitorSelection(true)
        }}
        onClearAll={() => {
          setSelectedCompetitorRootIds([])
          setSelectedCompetitorTermIds([])
          setHasInitializedCompetitorSelection(true)
        }}
        onSetRootSelection={handleSetRootSelection}
        onToggleTerm={handleToggleTerm}
        onToggleExpanded={(rootId) => {
          const nextExpandedIds = new Set(expandedCompetitorRootIds)
          if (nextExpandedIds.has(rootId)) {
            nextExpandedIds.delete(rootId)
          } else {
            nextExpandedIds.add(rootId)
          }

          setExpandedCompetitorRootIds(Array.from(nextExpandedIds))
        }}
      />
    </Stack>
  )
}
