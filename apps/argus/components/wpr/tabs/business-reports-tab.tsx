'use client'

import { useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
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
import {
  type ChartChangeMarker,
  buildChangeMarkerLookup,
  buildDailyChangeMarkers,
  buildWeeklyChangeMarkers,
  summarizeChangeMarkers,
  WprChangeTooltipContent,
} from '@/components/wpr/chart-change-markers'
import { WprChartControlGroup, WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import type { WprBrWowVisible } from '@/lib/wpr/dashboard-state'
import {
  createBusinessReportsSelectionViewModel,
  selectedWeekBusinessRecord,
  type BusinessReportsSelectionViewModel,
} from '@/lib/wpr/business-reports-view-model'
import { formatCount, formatPercent } from '@/lib/wpr/format'
import { chartToggleButtonSx, panelSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'
import type { WprBusinessDailyPoint, WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { useWprStore } from '@/stores/wpr-store'
import BusinessReportsSelectionTable from './business-reports-selection-table'

type BusinessReportsViewMode = 'weekly' | 'daily'

type BusinessReportsHeroContent = {
  name: string
  meta: string[]
}

const businessReportsViewToggleGroupSx = {
  '& .MuiToggleButtonGroup-grouped': {
    minWidth: 76,
    px: 1.5,
    py: 0.65,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: '10px',
    textTransform: 'none' as const,
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.01em',
    color: 'rgba(255,255,255,0.76)',
    bgcolor: 'rgba(255,255,255,0.045)',
    '&.Mui-selected': {
      borderColor: '#00C2B988',
      bgcolor: 'rgba(0, 194, 185, 0.14)',
      color: 'rgba(255,255,255,0.95)',
    },
    '&.Mui-selected:hover': {
      borderColor: '#00C2B9aa',
      bgcolor: 'rgba(0, 194, 185, 0.18)',
    },
    '&:hover': {
      borderColor: 'rgba(255,255,255,0.28)',
      bgcolor: 'rgba(255,255,255,0.07)',
    },
  },
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

type OverlayLayout = {
  width: number
  height: number
  top: number
  bottom: number
  positions: Map<string, number>
}

function BusinessReportsChangeOverlay({
  chartRootRef,
  markers,
}: {
  chartRootRef: RefObject<HTMLDivElement | null>
  markers: ChartChangeMarker[]
}) {
  const [layout, setLayout] = useState<OverlayLayout | null>(null)

  useEffect(() => {
    const node = chartRootRef.current
    if (node === null) {
      return
    }

    const measure = () => {
      const surface = node.querySelector('.recharts-surface')
      if (!(surface instanceof SVGSVGElement)) {
        setLayout(null)
        return
      }

      const xTickNodes = node.querySelectorAll('.recharts-cartesian-axis-tick-value')
      const yGridNodes = node.querySelectorAll('.recharts-cartesian-grid-horizontal line')
      const viewBox = surface.viewBox.baseVal
      const positions = new Map<string, number>()

      for (const tickNode of xTickNodes) {
        const label = tickNode.textContent
        if (label === null) {
          continue
        }

        if (markers.some((marker) => marker.label === label) === false) {
          continue
        }

        const x = Number(tickNode.getAttribute('x'))
        if (Number.isNaN(x)) {
          continue
        }

        positions.set(label, x)
      }

      const yCoordinates: number[] = []
      for (const gridNode of yGridNodes) {
        const y = Number(gridNode.getAttribute('y1'))
        if (Number.isNaN(y)) {
          continue
        }

        yCoordinates.push(y)
      }

      if (positions.size === 0 || yCoordinates.length === 0 || viewBox.width === 0 || viewBox.height === 0) {
        setLayout(null)
        return
      }

      setLayout({
        width: viewBox.width,
        height: viewBox.height,
        top: Math.min(...yCoordinates),
        bottom: Math.max(...yCoordinates),
        positions,
      })
    }

    measure()
    const frameId = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(node)

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [chartRootRef, markers])

  if (layout === null) {
    return null
  }

  return (
    <Box
      component="svg"
      data-change-overlay="business-reports"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {markers.map((marker) => {
        const x = layout.positions.get(marker.label)
        if (x === undefined) {
          return null
        }

        return (
          <g key={marker.label}>
            <line
              x1={x}
              x2={x}
              y1={layout.top}
              y2={layout.bottom}
              stroke="rgba(241,235,222,0.54)"
              strokeWidth="1.4"
              strokeDasharray="4 4"
            />
            {marker.count > 1 ? (
              <text
                x={x}
                y={layout.top + 10}
                fill="rgba(241,235,222,0.82)"
                fontSize="8"
                textAnchor="middle"
              >
                {marker.count}
              </text>
            ) : null}
          </g>
        )
      })}
    </Box>
  )
}

function BusinessReportsChart({
  viewMode,
  weekly,
  dailySeries,
  changeEntries,
  wowVisible,
  setWowVisible,
  setViewMode,
}: {
  viewMode: BusinessReportsViewMode
  weekly: BusinessReportsSelectionViewModel['weekly']
  dailySeries: WprBusinessDailyPoint[]
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprBrWowVisible
  setWowVisible: (nextState: WprBrWowVisible) => void
  setViewMode: (nextMode: BusinessReportsViewMode) => void
}) {
  const chartRootRef = useRef<HTMLDivElement | null>(null)
  const visibleSeries = [
    wowVisible.sessions ? { key: 'sessions', label: 'Sessions', color: '#8fc7ff' } : null,
    wowVisible.order_items ? { key: 'order_items', label: 'Order Item %', color: '#f5a623' } : null,
    wowVisible.unit_session ? { key: 'unit_session', label: 'Unit Session %', color: '#d5ff62' } : null,
  ].filter(
    (value): value is { key: 'sessions' | 'order_items' | 'unit_session'; label: string; color: string } =>
      value !== null,
  )
  const changeMarkers =
    viewMode === 'weekly'
      ? buildWeeklyChangeMarkers(changeEntries)
      : buildDailyChangeMarkers(dailySeries)
  let chartBody: JSX.Element
  if (visibleSeries.length === 0) {
    chartBody = <WprChartEmptyState>Turn on at least one series to view the Business Reports chart.</WprChartEmptyState>
  } else if (viewMode === 'daily' && dailySeries.length === 0) {
    chartBody = <WprChartEmptyState>No Business Reports ByDate data is available for the selected week.</WprChartEmptyState>
  } else if (viewMode === 'weekly' && weekly.length === 0) {
    chartBody = <WprChartEmptyState>No ASINs selected. Use the table below to filter Business Reports rows.</WprChartEmptyState>
  } else {
    const changeMarkersByLabel = buildChangeMarkerLookup(changeMarkers)
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

    chartBody = (
      <Box ref={chartRootRef} sx={{ position: 'relative', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="counts" tick={{ fontSize: 10 }} />
            <YAxis
              yAxisId="rates"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => (
                <WprChangeTooltipContent
                  active={active}
                  payload={payload}
                  label={label}
                  changeMarker={changeMarkersByLabel.get(String(label))}
                  formatRow={(entry) => {
                    const key = entry.dataKey
                    if (key === undefined) {
                      throw new Error('Missing Business Reports tooltip data key')
                    }

                    const value = entry.value
                    if (typeof value !== 'number') {
                      throw new Error(`Invalid Business Reports tooltip value for ${String(key)}`)
                    }

                    const color = entry.color
                    if (color === undefined) {
                      throw new Error(`Missing Business Reports tooltip color for ${String(key)}`)
                    }

                    if (key === 'sessions') {
                      return {
                        label: 'Sessions',
                        value: formatCount(value),
                        color,
                      }
                    }

                    if (key === 'order_items') {
                      return {
                        label: 'Order Item %',
                        value: `${value.toFixed(1)}%`,
                        color,
                      }
                    }

                    return {
                      label: 'Unit Session %',
                      value: `${value.toFixed(1)}%`,
                      color,
                    }
                  }}
                />
              )}
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
        <BusinessReportsChangeOverlay chartRootRef={chartRootRef} markers={changeMarkers} />
      </Box>
    )
  }

  return (
    <WprChartShell
      title={viewMode === 'weekly' ? 'Week over week' : 'Day by day'}
      description={viewMode === 'weekly' ? 'Counts + retail conversion rates' : 'Selected-week daily trend'}
      changeSummary={summarizeChangeMarkers(changeMarkers, viewMode === 'weekly' ? 'week' : 'day')}
      primaryControls={
        <WprChartControlGroup label="View">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            aria-label="Business Reports view mode"
            onChange={(_event, nextMode: BusinessReportsViewMode | null) => {
              if (nextMode !== null) {
                setViewMode(nextMode)
              }
            }}
            sx={businessReportsViewToggleGroupSx}
          >
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="daily">Daily</ToggleButton>
          </ToggleButtonGroup>
        </WprChartControlGroup>
      }
      secondaryControls={
        <WprChartControlGroup label="Metrics">
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                sessions: !wowVisible.sessions,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.sessions, '#8fc7ff')}
          >
            Sessions
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                order_items: !wowVisible.order_items,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.order_items, '#f5a623')}
          >
            Order Item %
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                unit_session: !wowVisible.unit_session,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.unit_session, '#d5ff62')}
          >
            Unit Session %
          </Button>
        </WprChartControlGroup>
      }
    >
      {chartBody}
    </WprChartShell>
  )
}

function buildHeroContent(selectedWeekLabel: string): BusinessReportsHeroContent {
  return {
    name: 'Business Reports',
    meta: ['Retail detail-page metrics', selectedWeekLabel],
  }
}

export default function BusinessReportsTab({
  bundle,
  changeEntries,
}: {
  bundle: WprWeekBundle
  changeEntries: WprChangeLogEntry[]
}) {
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
          <BusinessReportsChart
            viewMode={viewMode}
            weekly={viewModel.weekly}
            dailySeries={dailyChartSeries}
            changeEntries={changeEntries}
            wowVisible={brWowVisible}
            setWowVisible={setBrWowVisible}
            setViewMode={setViewMode}
          />
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
