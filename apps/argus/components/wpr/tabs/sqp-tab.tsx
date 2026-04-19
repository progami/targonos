'use client'

import { useEffect } from 'react'
import { Box, Stack } from '@mui/material'
import {
  createSqpSelectionViewModel,
  rootTermIds,
  type SqpSelectionViewModel,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
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

function windowRangeLabel(weeks: string[]): string {
  if (weeks.length === 0) {
    return ''
  }

  if (weeks.length === 1) {
    return weeks[0]
  }

  return `${weeks[0]} - ${weeks[weeks.length - 1]}`
}

function buildHeroContent(bundle: WprWeekBundle, viewModel: SqpSelectionViewModel): { name: string; meta: string[] } {
  const selectedWeekLabel = bundle.meta.anchorWeek
  if (viewModel.scopeType === 'empty') {
    return {
      name: 'SQP Selection',
      meta: ['0 roots selected', selectedWeekLabel],
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
        selectedWeekLabel,
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
        selectedWeekLabel,
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
          selectedWeekLabel,
        ],
      }
    }

    const preview = viewModel.selectedRootLabels.slice(0, 3).join(', ')
    return {
      name: `${viewModel.selectedRootIds.length} Roots`,
      meta: [
        preview,
        `0 / ${viewModel.allTermIds.length} SQP terms selected`,
        selectedWeekLabel,
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
      selectedWeekLabel,
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
  const selectedClusterId = useWprStore((state) => state.selectedClusterId)
  const setSelectedClusterId = useWprStore((state) => state.setSelectedClusterId)
  const selectedSqpRootIds = useWprStore((state) => state.selectedSqpRootIds)
  const setSelectedSqpRootIds = useWprStore((state) => state.setSelectedSqpRootIds)
  const selectedSqpTermIds = useWprStore((state) => state.selectedSqpTermIds)
  const setSelectedSqpTermIds = useWprStore((state) => state.setSelectedSqpTermIds)
  const expandedSqpRootIds = useWprStore((state) => state.expandedSqpRootIds)
  const setExpandedSqpRootIds = useWprStore((state) => state.setExpandedSqpRootIds)
  const hasInitializedSqpSelection = useWprStore((state) => state.hasInitializedSqpSelection)
  const setHasInitializedSqpSelection = useWprStore((state) => state.setHasInitializedSqpSelection)
  const sqpTableSort = useWprStore((state) => state.sqpTableSort)
  const setSqpTableSort = useWprStore((state) => state.setSqpTableSort)
  const sqpWowVisible = useWprStore((state) => state.sqpWowVisible)
  const setSqpWowVisible = useWprStore((state) => state.setSqpWowVisible)

  useEffect(() => {
    const rootIdSet = new Set(bundle.clusters.map((cluster) => cluster.id))
    const termIdSet = new Set(bundle.sqpTerms.map((term) => term.id))
    const filteredRootIds = filterIds(selectedSqpRootIds, rootIdSet)
    const filteredTermIds = filterIds(selectedSqpTermIds, termIdSet)
    const filteredExpandedIds = filterIds(expandedSqpRootIds, rootIdSet)

    if (!hasInitializedSqpSelection) {
      const defaultRootId = getDefaultRootId(bundle)
      if (defaultRootId === null) {
        setHasInitializedSqpSelection(true)
        setSelectedClusterId(null)
        return
      }

      setSelectedSqpRootIds([defaultRootId])
      setSelectedSqpTermIds(rootTermIds(bundle, defaultRootId))
      setExpandedSqpRootIds([])
      setSelectedClusterId(defaultRootId)
      setHasInitializedSqpSelection(true)
      return
    }

    if (selectedSqpRootIds.size > 0 && filteredRootIds.length === 0) {
      const defaultRootId = getDefaultRootId(bundle)
      if (defaultRootId === null) {
        setSelectedSqpRootIds([])
        setSelectedSqpTermIds([])
        setExpandedSqpRootIds([])
        setSelectedClusterId(null)
        return
      }

      setSelectedSqpRootIds([defaultRootId])
      setSelectedSqpTermIds(rootTermIds(bundle, defaultRootId))
      setExpandedSqpRootIds([])
      setSelectedClusterId(defaultRootId)
      return
    }

    if (filteredRootIds.length !== selectedSqpRootIds.size) {
      setSelectedSqpRootIds(filteredRootIds)
    }

    if (filteredTermIds.length !== selectedSqpTermIds.size) {
      setSelectedSqpTermIds(filteredTermIds)
    }

    if (filteredExpandedIds.length !== expandedSqpRootIds.size) {
      setExpandedSqpRootIds(filteredExpandedIds)
    }

    const nextSelectedClusterId = filteredRootIds[0]
    if (nextSelectedClusterId === undefined) {
      if (selectedClusterId !== null) {
        setSelectedClusterId(null)
      }
      return
    }

    if (selectedClusterId !== nextSelectedClusterId) {
      setSelectedClusterId(nextSelectedClusterId)
    }
  }, [
    bundle,
    expandedSqpRootIds,
    hasInitializedSqpSelection,
    selectedClusterId,
    selectedSqpRootIds,
    selectedSqpTermIds,
    setExpandedSqpRootIds,
    setHasInitializedSqpSelection,
    setSelectedClusterId,
    setSelectedSqpRootIds,
    setSelectedSqpTermIds,
  ])

  const viewModel = createSqpSelectionViewModel({
    bundle,
    selectedRootIds: selectedSqpRootIds,
    selectedTermIds: selectedSqpTermIds,
  })

  const familyOrder: string[] = []
  for (const cluster of bundle.clusters) {
    if (!familyOrder.includes(cluster.family)) {
      familyOrder.push(cluster.family)
    }
  }

  const heroContent = buildHeroContent(bundle, viewModel)
  const historyLabel = windowRangeLabel(bundle.meta.baselineWindow)
  const blankTopValues = viewModel.scopeType === 'no-terms'
  const currentMetrics = viewModel.metrics

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

    setSelectedSqpRootIds(Array.from(nextRootIds))
    setSelectedSqpTermIds(Array.from(nextTermIds))
    setSelectedClusterId(firstSetMember(nextRootIds))
    setHasInitializedSqpSelection(true)
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

    setSelectedSqpRootIds(Array.from(nextRootIds))
    setSelectedSqpTermIds(Array.from(nextTermIds))
    setSelectedClusterId(firstSetMember(nextRootIds))
    setHasInitializedSqpSelection(true)
  }

  const handleSelectAll = () => {
    setSelectedSqpRootIds(bundle.clusters.map((cluster) => cluster.id))
    setSelectedSqpTermIds(bundle.sqpGlobalTermIds.slice())
    setSelectedClusterId(getDefaultRootId(bundle))
    setHasInitializedSqpSelection(true)
  }

  const handleClearAll = () => {
    setSelectedSqpRootIds([])
    setSelectedSqpTermIds([])
    setSelectedClusterId(null)
    setHasInitializedSqpSelection(true)
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

  const handleExpandAll = () => {
    setExpandedSqpRootIds(bundle.clusters.map((cluster) => cluster.id))
  }

  const handleCollapseAll = () => {
    setExpandedSqpRootIds([])
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
        blankTopValues={blankTopValues}
        currentMetrics={currentMetrics}
        weekly={viewModel.weekly}
        changeEntries={changeEntries}
        wowVisible={sqpWowVisible}
        setWowVisible={setSqpWowVisible}
        scopeType={viewModel.scopeType}
        selectedRootCount={viewModel.selectedRootIds.length}
        selectedTermCount={viewModel.selectedTermIds.length}
        totalTermCount={viewModel.allTermIds.length}
        selectedWeekLabel={bundle.meta.anchorWeek}
        historyLabel={historyLabel}
      />

      <SqpSelectionTable
        familyOrder={familyOrder}
        viewModel={viewModel}
        expandedRootIds={expandedSqpRootIds}
        sortState={sqpTableSort}
        setSortState={setSqpTableSort}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onSetRootSelection={handleSetRootSelection}
        onToggleTerm={handleToggleTerm}
        onToggleExpanded={handleToggleExpanded}
      />
    </Stack>
  )
}
