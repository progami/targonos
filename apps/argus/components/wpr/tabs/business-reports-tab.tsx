'use client'

import { useEffect, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WprBrWowVisible } from '@/lib/wpr/dashboard-state'
import {
  createBusinessReportsSelectionViewModel,
  selectedWeekBusinessRecord,
  type BusinessReportsSelectionViewModel,
} from '@/lib/wpr/business-reports-view-model'
import { formatCount, formatPercent } from '@/lib/wpr/format'
import { panelSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'
import type { WprBusinessDailyPoint, WprWeekBundle } from '@/lib/wpr/types'
import { useWprStore } from '@/stores/wpr-store'
import BusinessReportsSelectionTable from './business-reports-selection-table'

type BusinessReportsViewMode = 'weekly' | 'daily'

type BusinessReportsHeroContent = {
  name: string
  meta: string[]
}

function blankMetricValue(): string {
  return '---'
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

function dailyWindowLabel(dailySeries: WprBusinessDailyPoint[]): string {
  if (dailySeries.length === 0) {
    return 'No daily business-report history'
  }

  const first = dailySeries[0]
  const last = dailySeries[dailySeries.length - 1]
  if (first === undefined || last === undefined) {
    throw new Error('Missing Business Reports daily history')
  }

  return `${first.day_label} to ${last.day_label}`
}

function MetricChip({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.58rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: textMuted,
          mb: 0.35,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '1.18rem',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function Footer({
  items,
}: {
  items: string[]
}) {
  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        borderTop: subtleBorder,
        color: textMuted,
      }}
    >
      {items.map((item) => (
        <Typography
          key={item}
          sx={{
            fontSize: '0.64rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {item}
        </Typography>
      ))}
    </Box>
  )
}

function BusinessReportsChart({
  viewMode,
  weekly,
  dailySeries,
  wowVisible,
  setWowVisible,
  setViewMode,
}: {
  viewMode: BusinessReportsViewMode
  weekly: BusinessReportsSelectionViewModel['weekly']
  dailySeries: WprBusinessDailyPoint[]
  wowVisible: WprBrWowVisible
  setWowVisible: (nextState: WprBrWowVisible) => void
  setViewMode: (nextMode: BusinessReportsViewMode) => void
}) {
  const visibleSeries = [
    wowVisible.sessions ? { key: 'sessions', label: 'Sessions', color: '#8fc7ff' } : null,
    wowVisible.order_items ? { key: 'order_items', label: 'Order Item %', color: '#f5a623' } : null,
    wowVisible.unit_session ? { key: 'unit_session', label: 'Unit Session %', color: '#d5ff62' } : null,
  ].filter(
    (value): value is { key: 'sessions' | 'order_items' | 'unit_session'; label: string; color: string } =>
      value !== null,
  )

  if (visibleSeries.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.78rem',
          letterSpacing: '0.03em',
        }}
      >
        Turn on at least one series to view the Business Reports chart.
      </Box>
    )
  }

  let chartRows: Array<{
    label: string
    sessions: number
    order_items: number
    unit_session: number
    changeCount: number
  }> = []

  if (viewMode === 'weekly') {
    chartRows = weekly.map((week) => ({
      label: week.week_label,
      sessions: week.sessions,
      order_items: week.order_item_session_percentage * 100,
      unit_session: week.unit_session_percentage * 100,
      changeCount: 0,
    }))
  } else {
    chartRows = dailySeries.map((day) => ({
      label: day.day_label,
      sessions: day.sessions,
      order_items: day.order_item_session_percentage * 100,
      unit_session: day.unit_session_percentage * 100,
      changeCount: day.change_count,
    }))
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack spacing={0.35}>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            {viewMode === 'weekly' ? 'Week over week' : 'Day by day'}
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: textMuted }}>
            {viewMode === 'weekly' ? 'Counts + retail conversion rates' : 'Selected-week daily trend'}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <Button
            size="small"
            variant={viewMode === 'weekly' ? 'contained' : 'outlined'}
            onClick={() => {
              setViewMode('weekly')
            }}
          >
            Weekly
          </Button>
          <Button
            size="small"
            variant={viewMode === 'daily' ? 'contained' : 'outlined'}
            onClick={() => {
              setViewMode('daily')
            }}
          >
            Daily
          </Button>
          <Button
            size="small"
            variant={wowVisible.sessions ? 'contained' : 'outlined'}
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                sessions: !wowVisible.sessions,
              })
            }}
          >
            Sessions
          </Button>
          <Button
            size="small"
            variant={wowVisible.order_items ? 'contained' : 'outlined'}
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                order_items: !wowVisible.order_items,
              })
            }}
          >
            Order Item %
          </Button>
          <Button
            size="small"
            variant={wowVisible.unit_session ? 'contained' : 'outlined'}
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                unit_session: !wowVisible.unit_session,
              })
            }}
          >
            Unit Session %
          </Button>
        </Stack>
      </Box>

      <Box sx={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="counts" tick={{ fontSize: 10 }} />
            <YAxis
              yAxisId="rates"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            />
            <Tooltip
              formatter={(value: number, key: string) => {
                if (key === 'sessions') {
                  return [formatCount(value), 'Sessions']
                }
                if (key === 'order_items') {
                  return [`${value.toFixed(1)}%`, 'Order Item %']
                }
                return [`${value.toFixed(1)}%`, 'Unit Session %']
              }}
              labelFormatter={(label, payload) => {
                const row = payload[0]?.payload
                if (row === undefined || row.changeCount === 0) {
                  return label
                }

                return `${label} · ${row.changeCount} changes`
              }}
              contentStyle={{
                background: 'rgba(0,20,35,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
              }}
            />
            {wowVisible.sessions ? (
              <Bar yAxisId="counts" dataKey="sessions" fill="rgba(143,199,255,0.34)" stroke="#8fc7ff" />
            ) : null}
            {wowVisible.order_items ? (
              <Line
                yAxisId="rates"
                type="monotone"
                dataKey="order_items"
                stroke="#f5a623"
                strokeWidth={2.2}
                dot={{ r: 2.5, strokeWidth: 0, fill: '#f5a623' }}
                activeDot={{ r: 4 }}
              />
            ) : null}
            {wowVisible.unit_session ? (
              <Line
                yAxisId="rates"
                type="monotone"
                dataKey="unit_session"
                stroke="#d5ff62"
                strokeWidth={2.2}
                dot={{ r: 2.5, strokeWidth: 0, fill: '#d5ff62' }}
                activeDot={{ r: 4 }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  )
}

function buildHeroContent(selectedWeekLabel: string): BusinessReportsHeroContent {
  return {
    name: 'Business Reports',
    meta: ['Retail detail-page metrics', selectedWeekLabel],
  }
}

export default function BusinessReportsTab({ bundle }: { bundle: WprWeekBundle }) {
  const [viewMode, setViewMode] = useState<BusinessReportsViewMode>('weekly')
  const selectedBusinessReportAsinIds = useWprStore((state) => state.selectedBusinessReportAsinIds)
  const setSelectedBusinessReportAsinIds = useWprStore((state) => state.setSelectedBusinessReportAsinIds)
  const hasInitializedBusinessReportSelection = useWprStore((state) => state.hasInitializedBusinessReportSelection)
  const setHasInitializedBusinessReportSelection = useWprStore((state) => state.setHasInitializedBusinessReportSelection)
  const brTableSort = useWprStore((state) => state.brTableSort)
  const setBrTableSort = useWprStore((state) => state.setBrTableSort)
  const brWowVisible = useWprStore((state) => state.brWowVisible)
  const setBrWowVisible = useWprStore((state) => state.setBrWowVisible)

  useEffect(() => {
    const allIds = bundle.businessReports.asins.map((row) => row.id)
    if (allIds.length === 0) {
      if (!hasInitializedBusinessReportSelection) {
        setHasInitializedBusinessReportSelection(true)
      }
      if (selectedBusinessReportAsinIds.size !== 0) {
        setSelectedBusinessReportAsinIds([])
      }
      return
    }

    const allowedIds = new Set(allIds)
    const filteredIds = Array.from(selectedBusinessReportAsinIds).filter((asinId) => allowedIds.has(asinId))

    if (!hasInitializedBusinessReportSelection) {
      setSelectedBusinessReportAsinIds(allIds)
      setHasInitializedBusinessReportSelection(true)
      return
    }

    if (filteredIds.length !== selectedBusinessReportAsinIds.size) {
      setSelectedBusinessReportAsinIds(filteredIds)
    }
  }, [
    bundle.businessReports.asins,
    hasInitializedBusinessReportSelection,
    selectedBusinessReportAsinIds,
    setHasInitializedBusinessReportSelection,
    setSelectedBusinessReportAsinIds,
  ])

  const selectedWeekLabel = bundle.meta.anchorWeek
  const viewModel = createBusinessReportsSelectionViewModel({
    window: bundle.businessReports,
    selectedAsinIds: selectedBusinessReportAsinIds,
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
        No Business Reports data in the available history.
      </Box>
    )
  }

  const heroContent = buildHeroContent(selectedWeekLabel)
  const selectedRecord = selectedWeekBusinessRecord(viewModel.weekly, selectedWeekLabel)
  const blankTopValues = viewModel.scopeType === 'empty' || selectedRecord === null || viewModel.current === null
  const currentMetrics = viewModel.current
  const dailySeries = bundle.businessReports.dailyByWeek[selectedWeekLabel]
  let dailyChartSeries: WprBusinessDailyPoint[] = []
  if (dailySeries !== undefined) {
    dailyChartSeries = dailySeries
  }
  const chartWindowLabel = viewMode === 'daily'
    ? dailyWindowLabel(dailyChartSeries)
    : windowRangeLabel(bundle.meta.baselineWindow)
  const footerItems = [
    `Source: Business Reports`,
    `Scope: detail page retail`,
    `ASINs: ${viewModel.selectedIds.length} / ${viewModel.allIds.length}`,
    `Target ASIN: ${bundle.businessReports.meta.targetAsin}`,
    `Table week: ${selectedWeekLabel}`,
    `Chart window: ${chartWindowLabel}`,
  ]

  return (
    <Stack spacing={2}>
      <Box sx={panelSx}>
        <Box
          sx={{
            px: 2.5,
            pt: 2,
            pb: 1.25,
            borderBottom: subtleBorder,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Stack spacing={0.45}>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
              {heroContent.name}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: textSecondary }}>
              {heroContent.meta.join(' · ')}
            </Typography>
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            borderBottom: subtleBorder,
          }}
        >
          <MetricChip
            label="Sessions"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.sessions)}
          />
          <MetricChip
            label="Order Item %"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatPercent(currentMetrics.order_item_session_percentage)}
          />
          <MetricChip
            label="Unit Session %"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatPercent(currentMetrics.unit_session_percentage)}
          />
        </Box>

        <Box sx={{ p: 2.5 }}>
          {viewModel.scopeType === 'empty' ? (
            <Box
              sx={{
                minHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.54)',
                fontSize: '0.78rem',
                letterSpacing: '0.03em',
              }}
            >
              No ASINs selected. Use the table below to filter Business Reports rows.
            </Box>
          ) : viewMode === 'daily' && dailyChartSeries.length === 0 ? (
            <Box
              sx={{
                minHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.54)',
                fontSize: '0.78rem',
                letterSpacing: '0.03em',
              }}
            >
              No Business Reports ByDate data is available for {selectedWeekLabel}.
            </Box>
          ) : (
            <BusinessReportsChart
              viewMode={viewMode}
              weekly={viewModel.weekly}
              dailySeries={dailyChartSeries}
              wowVisible={brWowVisible}
              setWowVisible={setBrWowVisible}
              setViewMode={setViewMode}
            />
          )}
        </Box>

        <Footer items={footerItems} />
      </Box>

      <BusinessReportsSelectionTable
        selectedWeekLabel={selectedWeekLabel}
        viewModel={viewModel}
        sortState={brTableSort}
        setSortState={setBrTableSort}
        onSelectAll={() => {
          setSelectedBusinessReportAsinIds(viewModel.allIds)
          setHasInitializedBusinessReportSelection(true)
        }}
        onClearAll={() => {
          setSelectedBusinessReportAsinIds([])
          setHasInitializedBusinessReportSelection(true)
        }}
        onToggleAsin={(asinId) => {
          const nextIds = new Set(selectedBusinessReportAsinIds)
          if (nextIds.has(asinId)) {
            nextIds.delete(asinId)
          } else {
            nextIds.add(asinId)
          }
          setSelectedBusinessReportAsinIds(Array.from(nextIds))
          setHasInitializedBusinessReportSelection(true)
        }}
      />
    </Stack>
  )
}
