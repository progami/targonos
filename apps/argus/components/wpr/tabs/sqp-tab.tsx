'use client'

import { useEffect } from 'react'
import { Box, Stack } from '@mui/material'
import {
  createSqpSelectionViewModel,
  defaultSqpRootIds,
  rootTermIds,
  selectableSqpTermIdsForRoots,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { buildBundleWeekStartDateLookup } from '@/lib/wpr/week-display'
import { useWprStore } from '@/stores/wpr-store'
import SqpSelectionTable from './sqp-selection-table'
import SqpWeeklyPanel from './sqp-weekly-panel'

function filterIds(ids: Set<string>, allowedIds: Set<string>): string[] {
  return Array.from(ids).filter((id) => allowedIds.has(id))
}

function firstSetMember(ids: Set<string>): string | null {
  const first = Array.from(ids)[0]
  if (first === undefined) {
    return null
  }

  return first
}

export default function SqpTab({
  bundle,
  changeEntries,
}: {
  bundle: WprWeekBundle
  changeEntries: WprChangeLogEntry[]
}) {
  const replaceState = useWprStore((state) => state.replaceState)
  const selectedClusterId = useWprStore((state) => state.selectedClusterId)
  const selectedSqpRootIds = useWprStore((state) => state.selectedSqpRootIds)
  const selectedSqpTermIds = useWprStore((state) => state.selectedSqpTermIds)
  const expandedSqpRootIds = useWprStore((state) => state.expandedSqpRootIds)
  const setExpandedSqpRootIds = useWprStore((state) => state.setExpandedSqpRootIds)
  const hasInitializedSqpSelection = useWprStore((state) => state.hasInitializedSqpSelection)
  const sqpTableSort = useWprStore((state) => state.sqpTableSort)
  const setSqpTableSort = useWprStore((state) => state.setSqpTableSort)
  const sqpWowVisible = useWprStore((state) => state.sqpWowVisible)
  const setSqpWowVisible = useWprStore((state) => state.setSqpWowVisible)
  const selectedWeek = useWprStore((state) => state.selectedWeek)
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek)

  if (selectedWeek === null) {
    throw new Error('Missing WPR table week')
  }

  const replaceSqpSelection = ({
    rootIds,
    termIds,
    clusterId,
    expandedIds,
    hasInitialized,
  }: {
    rootIds: string[]
    termIds: string[]
    clusterId: string | null
    expandedIds?: string[]
    hasInitialized: boolean
  }) => {
    replaceState({
      selectedClusterId: clusterId,
      selectedSqpRootIds: new Set(rootIds),
      selectedSqpTermIds: new Set(termIds),
      expandedSqpRootIds: new Set(expandedIds ?? Array.from(expandedSqpRootIds)),
      hasInitializedSqpSelection: hasInitialized,
    })
  }

  useEffect(() => {
    const rootIdSet = new Set(bundle.clusters.map((cluster) => cluster.id))
    const termIdSet = new Set(bundle.sqpTerms.map((term) => term.id))
    const filteredRootIds = filterIds(selectedSqpRootIds, rootIdSet)
    const filteredTermIds = filterIds(selectedSqpTermIds, termIdSet)
    const filteredExpandedIds = filterIds(expandedSqpRootIds, rootIdSet)

    if (!hasInitializedSqpSelection) {
      const initialRootIds = defaultSqpRootIds(bundle)
      const initialClusterId = initialRootIds[0]
      replaceState({
        selectedClusterId: initialClusterId === undefined ? null : initialClusterId,
        selectedSqpRootIds: new Set(initialRootIds),
        selectedSqpTermIds: new Set(selectableSqpTermIdsForRoots(bundle, initialRootIds)),
        expandedSqpRootIds: new Set<string>(),
        hasInitializedSqpSelection: true,
      })
      return
    }

    if (selectedSqpRootIds.size > 0 && filteredRootIds.length === 0) {
      replaceState({
        selectedClusterId: null,
        selectedSqpRootIds: new Set<string>(),
        selectedSqpTermIds: new Set<string>(),
        expandedSqpRootIds: new Set<string>(),
        hasInitializedSqpSelection: true,
      })
      return
    }

    const nextSelectedClusterId = filteredRootIds[0]
    let needsStateReplacement = false
    const nextState: Parameters<typeof replaceState>[0] = {}

    if (filteredRootIds.length !== selectedSqpRootIds.size) {
      nextState.selectedSqpRootIds = new Set(filteredRootIds)
      needsStateReplacement = true
    }

    if (filteredTermIds.length !== selectedSqpTermIds.size) {
      nextState.selectedSqpTermIds = new Set(filteredTermIds)
      needsStateReplacement = true
    }

    if (filteredExpandedIds.length !== expandedSqpRootIds.size) {
      nextState.expandedSqpRootIds = new Set(filteredExpandedIds)
      needsStateReplacement = true
    }

    if (nextSelectedClusterId === undefined) {
      if (selectedClusterId !== null) {
        nextState.selectedClusterId = null
        needsStateReplacement = true
      }

      if (needsStateReplacement) {
        replaceState(nextState)
      }
      return
    }

    if (selectedClusterId !== nextSelectedClusterId) {
      nextState.selectedClusterId = nextSelectedClusterId
      needsStateReplacement = true
    }

    if (needsStateReplacement) {
      replaceState(nextState)
    }
  }, [
    bundle,
    expandedSqpRootIds,
    hasInitializedSqpSelection,
    replaceState,
    selectedClusterId,
    selectedSqpRootIds,
    selectedSqpTermIds,
  ])

  const viewModel = createSqpSelectionViewModel({
    bundle,
    selectedRootIds: selectedSqpRootIds,
    selectedTermIds: selectedSqpTermIds,
    selectedWeek,
  })

  const familyOrder: string[] = []
  for (const cluster of bundle.clusters) {
    if (!familyOrder.includes(cluster.family)) {
      familyOrder.push(cluster.family)
    }
  }

  const weekStartDates = buildBundleWeekStartDateLookup(bundle)

  const handleSetRootSelection = (rootId: string, shouldSelect: boolean) => {
    const nextRootIds = new Set(selectedSqpRootIds)
    const nextTermIds = new Set(selectedSqpTermIds)
    const termIds = rootTermIds(bundle, rootId)

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

    replaceSqpSelection({
      rootIds: Array.from(nextRootIds),
      termIds: Array.from(nextTermIds),
      clusterId: firstSetMember(nextRootIds),
      hasInitialized: true,
    })
  }

  const handleToggleTerm = (rootId: string, termId: string) => {
    const nextRootIds = new Set(selectedSqpRootIds)
    const nextTermIds = new Set(selectedSqpTermIds)

    if (nextTermIds.has(termId)) {
      nextTermIds.delete(termId)
    } else {
      nextTermIds.add(termId)
    }

    const remainingRootTermIds = rootTermIds(bundle, rootId)
    let rootStillSelected = false
    for (const candidateTermId of remainingRootTermIds) {
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

    replaceSqpSelection({
      rootIds: Array.from(nextRootIds),
      termIds: Array.from(nextTermIds),
      clusterId: firstSetMember(nextRootIds),
      hasInitialized: true,
    })
  }

  const handleSelectAll = () => {
    const initialRootIds = defaultSqpRootIds(bundle)
    const initialClusterId = initialRootIds[0]
    replaceSqpSelection({
      rootIds: initialRootIds,
      termIds: selectableSqpTermIdsForRoots(bundle, initialRootIds),
      clusterId: initialClusterId === undefined ? null : initialClusterId,
      hasInitialized: true,
    })
  }

  const handleClearAll = () => {
    replaceSqpSelection({
      rootIds: [],
      termIds: [],
      clusterId: null,
      hasInitialized: true,
    })
  }

  const handleToggleExpanded = (rootId: string) => {
    const nextExpandedIds = new Set(expandedSqpRootIds)
    if (nextExpandedIds.has(rootId)) {
      nextExpandedIds.delete(rootId)
    } else {
      nextExpandedIds.add(rootId)
    }

    setExpandedSqpRootIds(Array.from(nextExpandedIds))
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
        No SQP-backed roots for the selected window.
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      <SqpWeeklyPanel
        weekly={viewModel.weekly}
        changeEntries={changeEntries}
        wowVisible={sqpWowVisible}
        setWowVisible={setSqpWowVisible}
      />

      <SqpSelectionTable
        selectedWeek={selectedWeek}
        weeks={bundle.weeks}
        weekStartDates={weekStartDates}
        familyOrder={familyOrder}
        viewModel={viewModel}
        expandedRootIds={expandedSqpRootIds}
        sortState={sqpTableSort}
        setSortState={setSqpTableSort}
        onSelectWeek={setSelectedWeek}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onSetRootSelection={handleSetRootSelection}
        onToggleTerm={handleToggleTerm}
        onToggleExpanded={handleToggleExpanded}
      />
    </Stack>
  )
}
