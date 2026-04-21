'use client'

import { useEffect, type JSX } from 'react'
import { Box, Button, Stack } from '@mui/material'
import {
  WprAnalyticsFooter,
  WprAnalyticsMetric,
  WprAnalyticsPanel,
} from '@/components/wpr/wpr-analytics-panel'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  buildChangeMarkerLookup,
  buildWeeklyChangeMarkers,
  RechartsChangeMarkers,
  WprChangeTooltipContent,
} from '@/components/wpr/chart-change-markers'
import { WprChartControlGroup, WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import type { WprScpWowVisible } from '@/lib/wpr/dashboard-state'
import { formatCount, formatMoney } from '@/lib/wpr/format'
import { createScpSelectionViewModel, type ScpSelectionViewModel } from '@/lib/wpr/scp-view-model'
import { chartToggleButtonSx } from '@/lib/wpr/panel-tokens'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { buildBundleWeekStartDateLookup, formatWeekLabelFromLookup, formatWeekWindowLabel } from '@/lib/wpr/week-display'
import { useWprStore } from '@/stores/wpr-store'
import ScpSelectionTable from './scp-selection-table'

type ScpHeroContent = {
  name: string
  meta: string[]
}

function blankMetricValue(): string {
  return '---'
}

function ScpWeeklyChart({
  weekly,
  weekStartDates,
  changeEntries,
  wowVisible,
  setWowVisible,
}: {
  weekly: ScpSelectionViewModel['weekly']
  weekStartDates: Record<string, string>
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprScpWowVisible
  setWowVisible: (nextState: WprScpWowVisible) => void
}) {
  const visibleSeries = [
    wowVisible.ctr ? { key: 'ctr', label: 'CTR', color: '#8fc7ff' } : null,
    wowVisible.atc ? { key: 'atc', label: 'ATC Rate', color: '#f5a623' } : null,
    wowVisible.purch ? { key: 'purch', label: 'Purch Rate', color: '#77dfd0' } : null,
    wowVisible.cvr ? { key: 'cvr', label: 'CVR', color: '#d5ff62' } : null,
  ].filter((value): value is { key: 'ctr' | 'atc' | 'purch' | 'cvr'; label: string; color: string } => value !== null)
  const changeMarkers = buildWeeklyChangeMarkers(changeEntries)
  let chartBody: JSX.Element
  if (weekly.length === 0) {
    chartBody = <WprChartEmptyState>No SCP rows selected. Use the table below to filter SCP rows.</WprChartEmptyState>
  } else if (visibleSeries.length === 0) {
    chartBody = <WprChartEmptyState>Turn on at least one series to view the SCP history chart.</WprChartEmptyState>
  } else {
    const changeMarkersByLabel = buildChangeMarkerLookup(changeMarkers)
    const chartRows = weekly.map((week) => ({
      weekLabel: week.week_label,
      ctr: week.ctr * 100,
      atc: week.atc_rate * 100,
      purch: week.purchase_rate * 100,
      cvr: week.cvr * 100,
    }))

    chartBody = (
      <Box sx={{ height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
            <Tooltip
              content={({ active, payload, label }) => (
                <WprChangeTooltipContent
                  active={active}
                  payload={payload}
                  label={label}
                  labelText={formatWeekLabelFromLookup(String(label), weekStartDates)}
                  changeMarker={changeMarkersByLabel.get(String(label))}
                  formatRow={(entry) => {
                    const key = entry.dataKey
                    if (key === undefined) {
                      throw new Error('Missing SCP tooltip data key')
                    }

                    const value = entry.value
                    if (typeof value !== 'number') {
                      throw new Error(`Invalid SCP tooltip value for ${String(key)}`)
                    }

                    const color = entry.color
                    if (color === undefined) {
                      throw new Error(`Missing SCP tooltip color for ${String(key)}`)
                    }

                    let rowLabel = 'CVR'
                    if (key === 'ctr') rowLabel = 'CTR'
                    if (key === 'atc') rowLabel = 'ATC Rate'
                    if (key === 'purch') rowLabel = 'Purch Rate'

                    return {
                      label: rowLabel,
                      value: `${value.toFixed(1)}%`,
                      color,
                    }
                  }}
                />
              )}
            />
            <RechartsChangeMarkers markers={changeMarkers} />
            {visibleSeries.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2.2}
                dot={{ r: 2.5, strokeWidth: 0, fill: series.color }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    )
  }

  return (
    <WprChartShell
      secondaryControls={
        <WprChartControlGroup label="Metrics">
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                ctr: !wowVisible.ctr,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.ctr, '#8fc7ff')}
          >
            CTR
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                atc: !wowVisible.atc,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.atc, '#f5a623')}
          >
            ATC Rate
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                purch: !wowVisible.purch,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.purch, '#77dfd0')}
          >
            Purch Rate
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                cvr: !wowVisible.cvr,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.cvr, '#d5ff62')}
          >
            CVR
          </Button>
        </WprChartControlGroup>
      }
    >
      {chartBody}
    </WprChartShell>
  )
}

function buildHeroContent(selectedWeekLabel: string): ScpHeroContent {
  return {
    name: 'Search Catalog Performance',
    meta: [`Catalog search funnel`, selectedWeekLabel],
  }
}

export default function ScpTab({
  bundle,
  changeEntries,
}: {
  bundle: WprWeekBundle
  changeEntries: WprChangeLogEntry[]
}) {
  const selectedScpAsinIds = useWprStore((state) => state.selectedScpAsinIds)
  const setSelectedScpAsinIds = useWprStore((state) => state.setSelectedScpAsinIds)
  const hasInitializedScpSelection = useWprStore((state) => state.hasInitializedScpSelection)
  const setHasInitializedScpSelection = useWprStore((state) => state.setHasInitializedScpSelection)
  const scpTableSort = useWprStore((state) => state.scpTableSort)
  const setScpTableSort = useWprStore((state) => state.setScpTableSort)
  const scpWowVisible = useWprStore((state) => state.scpWowVisible)
  const setScpWowVisible = useWprStore((state) => state.setScpWowVisible)

  useEffect(() => {
    const allIds = bundle.scp.asins.map((row) => row.id)
    if (allIds.length === 0) {
      if (!hasInitializedScpSelection) {
        setHasInitializedScpSelection(true)
      }
      if (selectedScpAsinIds.size !== 0) {
        setSelectedScpAsinIds([])
      }
      return
    }

    const allowedIds = new Set(allIds)
    const filteredIds = Array.from(selectedScpAsinIds).filter((asinId) => allowedIds.has(asinId))

    if (!hasInitializedScpSelection) {
      setSelectedScpAsinIds(allIds)
      setHasInitializedScpSelection(true)
      return
    }

    if (filteredIds.length !== selectedScpAsinIds.size) {
      setSelectedScpAsinIds(filteredIds)
    }
  }, [
    bundle.scp.asins,
    hasInitializedScpSelection,
    selectedScpAsinIds,
    setHasInitializedScpSelection,
    setSelectedScpAsinIds,
  ])

  const selectedWeekLabel = bundle.meta.anchorWeek
  const viewModel = createScpSelectionViewModel({
    window: bundle.scp,
    selectedAsinIds: selectedScpAsinIds,
    selectedWeek: selectedWeekLabel,
  })

  if (viewModel.scopeType === 'unavailable') {
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
        No SCP data for the selected window.
      </Box>
    )
  }

  const weekStartDates = buildBundleWeekStartDateLookup(bundle)
  const formattedSelectedWeekLabel = formatWeekLabelFromLookup(selectedWeekLabel, weekStartDates)
  const heroContent = buildHeroContent(formattedSelectedWeekLabel)
  const blankTopValues = viewModel.scopeType === 'empty' || viewModel.current === null
  const currentMetrics = viewModel.current
  const historyLabel = formatWeekWindowLabel(bundle.scp.meta.baselineWindow, weekStartDates)
  const footerItems = [
    `Source: SCP`,
    `Scope: catalog search`,
    `ASINs: ${viewModel.selectedIds.length} / ${viewModel.allIds.length}`,
    `Target ASIN: ${bundle.scp.meta.targetAsin}`,
    `Table week: ${formattedSelectedWeekLabel}`,
    `Chart history: ${historyLabel}`,
  ]

  return (
    <Stack spacing={2}>
      <WprAnalyticsPanel
        title={heroContent.name}
        meta={heroContent.meta}
        metricColumns={{ xs: 2, md: 3 }}
        metrics={
          <>
            <WprAnalyticsMetric
              label="Search Impressions"
              value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.impressions)}
            />
            <WprAnalyticsMetric
              label="Search Purchases"
              value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.purchases)}
            />
            <WprAnalyticsMetric
              label="Search Sales"
              value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatMoney(currentMetrics.sales)}
            />
          </>
        }
        footer={<WprAnalyticsFooter items={footerItems} />}
      >
        <ScpWeeklyChart
          weekly={viewModel.weekly}
          weekStartDates={weekStartDates}
          changeEntries={changeEntries}
          wowVisible={scpWowVisible}
          setWowVisible={setScpWowVisible}
        />
      </WprAnalyticsPanel>

      <ScpSelectionTable
        selectedWeekLabel={selectedWeekLabel}
        viewModel={viewModel}
        sortState={scpTableSort}
        setSortState={setScpTableSort}
        onSelectAll={() => {
          setSelectedScpAsinIds(viewModel.allIds)
          setHasInitializedScpSelection(true)
        }}
        onClearAll={() => {
          setSelectedScpAsinIds([])
          setHasInitializedScpSelection(true)
        }}
        onToggleAsin={(asinId) => {
          const nextIds = new Set(selectedScpAsinIds)
          if (nextIds.has(asinId)) {
            nextIds.delete(asinId)
          } else {
            nextIds.add(asinId)
          }
          setSelectedScpAsinIds(Array.from(nextIds))
          setHasInitializedScpSelection(true)
        }}
      />
    </Stack>
  )
}
