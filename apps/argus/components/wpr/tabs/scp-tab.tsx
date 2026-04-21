'use client'

import { useEffect, type JSX } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
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
  summarizeChangeMarkers,
  WprChangeTooltipContent,
} from '@/components/wpr/chart-change-markers'
import { WprChartControlGroup, WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import type { WprScpWowVisible } from '@/lib/wpr/dashboard-state'
import { formatCount, formatMoney } from '@/lib/wpr/format'
import { createScpSelectionViewModel, type ScpSelectionViewModel } from '@/lib/wpr/scp-view-model'
import { chartToggleButtonSx, panelSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { useWprStore } from '@/stores/wpr-store'
import ScpSelectionTable from './scp-selection-table'

type ScpHeroContent = {
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

function ScpWeeklyChart({
  weekly,
  changeEntries,
  wowVisible,
  setWowVisible,
}: {
  weekly: ScpSelectionViewModel['weekly']
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
      title="Week over week"
      description="Catalog search funnel rates"
      changeSummary={summarizeChangeMarkers(changeMarkers, 'week')}
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

  const heroContent = buildHeroContent(selectedWeekLabel)
  const blankTopValues = viewModel.scopeType === 'empty' || viewModel.current === null
  const currentMetrics = viewModel.current
  const historyLabel = windowRangeLabel(bundle.scp.meta.baselineWindow)
  const footerItems = [
    `Source: SCP`,
    `Scope: catalog search`,
    `ASINs: ${viewModel.selectedIds.length} / ${viewModel.allIds.length}`,
    `Target ASIN: ${bundle.scp.meta.targetAsin}`,
    `Table week: ${selectedWeekLabel}`,
    `Chart history: ${historyLabel}`,
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
            label="Search Impressions"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.impressions)}
          />
          <MetricChip
            label="Search Purchases"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.purchases)}
          />
          <MetricChip
            label="Search Sales"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatMoney(currentMetrics.sales)}
          />
        </Box>

        <Box sx={{ p: 2.5 }}>
          <ScpWeeklyChart
            weekly={viewModel.weekly}
            changeEntries={changeEntries}
            wowVisible={scpWowVisible}
            setWowVisible={setScpWowVisible}
          />
        </Box>

        <Footer items={footerItems} />
      </Box>

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
