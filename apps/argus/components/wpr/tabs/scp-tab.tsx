'use client'

import { useEffect, type JSX } from 'react'
import { Box, Stack } from '@mui/material'
import { WprAnalyticsPanel } from '@/components/wpr/wpr-analytics-panel'
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
import { WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import { WprInlineChartLegend, type WprInlineChartLegendItem } from '@/components/wpr/wpr-inline-chart-legend'
import type { WprScpWowVisible } from '@/lib/wpr/dashboard-state'
import { createScpSelectionViewModel, type ScpSelectionViewModel } from '@/lib/wpr/scp-view-model'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import {
  buildBundleWeekStartDateLookup,
  formatTooltipWeekLabelFromLookup,
} from '@/lib/wpr/week-display'
import { useWprStore } from '@/stores/wpr-store'
import ScpSelectionTable from './scp-selection-table'

type ScpSeriesKey = keyof WprScpWowVisible

const SCP_WOW_SERIES: Array<{
  key: ScpSeriesKey
  label: string
  color: string
}> = [
  { key: 'ctr', label: 'CTR', color: '#8fc7ff' },
  { key: 'atc', label: 'ATC Rate', color: '#f5a623' },
  { key: 'purch', label: 'Purch Rate', color: '#77dfd0' },
  { key: 'cvr', label: 'CVR', color: '#d5ff62' },
]

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
  const visibleSeries = SCP_WOW_SERIES.filter((series) => wowVisible[series.key])
  const legendItems: Array<WprInlineChartLegendItem<ScpSeriesKey>> = SCP_WOW_SERIES.map((series) => ({
    ...series,
    active: wowVisible[series.key],
  }))
  const toggleSeries = (seriesKey: ScpSeriesKey) => {
    setWowVisible({
      ...wowVisible,
      [seriesKey]: !wowVisible[seriesKey],
    })
  }
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
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
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
                    labelText={formatTooltipWeekLabelFromLookup(label, weekStartDates)}
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
        <WprInlineChartLegend chartId="scp" items={legendItems} onToggle={toggleSeries} />
      </Box>
    )
  }

  return (
    <WprChartShell>
      {chartBody}
    </WprChartShell>
  )
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
  const selectedWeek = useWprStore((state) => state.selectedWeek)
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek)

  if (selectedWeek === null) {
    throw new Error('Missing WPR table week')
  }

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

  const viewModel = createScpSelectionViewModel({
    window: bundle.scp,
    selectedAsinIds: selectedScpAsinIds,
    selectedWeek,
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

  return (
    <Stack spacing={2}>
      <WprAnalyticsPanel
        footer={null}
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
        selectedWeek={selectedWeek}
        weeks={bundle.weeks}
        weekStartDates={weekStartDates}
        viewModel={viewModel}
        sortState={scpTableSort}
        setSortState={setScpTableSort}
        onSelectWeek={setSelectedWeek}
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
