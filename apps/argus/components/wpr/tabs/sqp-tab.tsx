'use client'

import { useEffect } from 'react'
import { Box, Stack } from '@mui/material'
import {
  createSqpSelectionViewModel,
  rootTermIds,
  type SqpSelectionViewModel,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { buildBundleWeekStartDateLookup, formatWeekWindowLabel } from '@/lib/wpr/week-display'
import { useWprStore } from '@/stores/wpr-store'
import SqpSelectionTable from './sqp-selection-table'
import SqpWeeklyPanel from './sqp-weekly-panel'

function getDefaultRootId(bundle: WprWeekBundle): string | null {
  const defaultRootId = bundle.defaultClusterIds[0]
  if (defaultRootId !== undefined) {
    return defaultRootId
  }

  const firstCluster = bundle.clusters[0]
  if (firstCluster !== undefined) {
    return firstCluster.id
  }

  return null
}

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

function allSelectableTermIds(bundle: WprWeekBundle): string[] {
  const termIds: string[] = []
  const seenTermIds = new Set<string>()

  for (const cluster of bundle.clusters) {
    for (const termId of rootTermIds(bundle, cluster.id)) {
      if (seenTermIds.has(termId)) {
        continue
      }

      seenTermIds.add(termId)
      termIds.push(termId)
    }
  }

  return termIds
}

function buildHeroContent(
  bundle: WprWeekBundle,
  viewModel: SqpSelectionViewModel,
): { name: string; meta: string[] } {
  if (viewModel.scopeType === 'empty') {
    return {
      name: 'SQP Selection',
      meta: ['0 roots selected'],
    }
  }

  const selectedRootId = viewModel.selectedRootIds[0]
  const selectedRootRow = viewModel.rootRows.find((row) => row.id === selectedRootId)
  if (selectedRootRow === undefined && viewModel.selectedRootIds.length === 1) {
    throw new Error(`Missing SQP root row ${selectedRootId}`)
  }

  if (viewModel.scopeType === 'term') {
    const selectedTermId = viewModel.selectedTermIds[0]
    const selectedTerm = bundle.sqpTerms.find((term) => term.id === selectedTermId)
    if (selectedTerm === undefined) {
      throw new Error(`Missing SQP term ${selectedTermId}`)
    }

    return {
      name: selectedTerm.term,
      meta: [
        selectedTerm.cluster,
        `1 / ${viewModel.allTermIds.length} SQP terms selected`,
      ],
    }
  }

  if (viewModel.scopeType === 'root' || viewModel.scopeType === 'multi') {
    if (selectedRootRow === undefined) {
      throw new Error('Missing SQP root row for single-root selection')
    }

    return {
      name: selectedRootRow.label,
      meta: [
        selectedRootRow.family,
        `${viewModel.selectedTermIds.length} / ${viewModel.allTermIds.length} SQP terms selected`,
      ],
    }
  }

  if (viewModel.scopeType === 'no-terms') {
    if (viewModel.selectedRootIds.length === 1) {
      if (selectedRootRow === undefined) {
        throw new Error('Missing SQP root row for no-term selection')
      }

      return {
        name: selectedRootRow.label,
        meta: [
          selectedRootRow.family,
          `0 / ${viewModel.allTermIds.length} SQP terms selected`,
        ],
      }
    }

    const preview = viewModel.selectedRootLabels.slice(0, 3).join(', ')
    return {
      name: `${viewModel.selectedRootIds.length} Roots`,
      meta: [
        preview,
        `0 / ${viewModel.allTermIds.length} SQP terms selected`,
      ],
    }
  }

  const previewLabels = viewModel.selectedRootLabels.slice(0, 3)
  let preview = previewLabels.join(', ')
  if (viewModel.selectedRootLabels.length > 3) {
    preview = `${preview} +${viewModel.selectedRootLabels.length - 3}`
  }

  return {
    name: `${viewModel.selectedRootIds.length} Roots`,
    meta: [
      preview,
      `${viewModel.selectedTermIds.length} / ${viewModel.allTermIds.length} SQP terms selected`,
    ],
  }
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
      const defaultRootId = getDefaultRootId(bundle)
      if (defaultRootId === null) {
        replaceState({
          selectedClusterId: null,
          selectedSqpRootIds: new Set<string>(),
          selectedSqpTermIds: new Set<string>(),
          expandedSqpRootIds: new Set<string>(),
          hasInitializedSqpSelection: true,
        })
        return
      }

      replaceState({
        selectedClusterId: defaultRootId,
        selectedSqpRootIds: new Set([defaultRootId]),
        selectedSqpTermIds: new Set(rootTermIds(bundle, defaultRootId)),
        expandedSqpRootIds: new Set<string>(),
        hasInitializedSqpSelection: true,
      })
      return
    }

    if (selectedSqpRootIds.size > 0 && filteredRootIds.length === 0) {
      const defaultRootId = getDefaultRootId(bundle)
      if (defaultRootId === null) {
        replaceState({
          selectedClusterId: null,
          selectedSqpRootIds: new Set<string>(),
          selectedSqpTermIds: new Set<string>(),
          expandedSqpRootIds: new Set<string>(),
          hasInitializedSqpSelection: true,
        })
        return
      }

      replaceState({
        selectedClusterId: defaultRootId,
        selectedSqpRootIds: new Set([defaultRootId]),
        selectedSqpTermIds: new Set(rootTermIds(bundle, defaultRootId)),
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
  const heroContent = buildHeroContent(bundle, viewModel)
  const historyLabel = formatWeekWindowLabel(bundle.meta.baselineWindow, weekStartDates)

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
    replaceSqpSelection({
      rootIds: bundle.clusters.map((cluster) => cluster.id),
      termIds: allSelectableTermIds(bundle),
      clusterId: getDefaultRootId(bundle),
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
        heroContent={heroContent}
        weekly={viewModel.weekly}
        changeEntries={changeEntries}
        wowVisible={sqpWowVisible}
        setWowVisible={setSqpWowVisible}
        scopeType={viewModel.scopeType}
        selectedRootCount={viewModel.selectedRootIds.length}
        selectedTermCount={viewModel.selectedTermIds.length}
        totalTermCount={viewModel.allTermIds.length}
        historyLabel={historyLabel}
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
