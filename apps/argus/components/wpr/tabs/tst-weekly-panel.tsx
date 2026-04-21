'use client'

import type { JSX } from 'react'
import { Box, Button } from '@mui/material'
import {
  WprAnalyticsFooter,
  WprAnalyticsMetric,
  WprAnalyticsPanel,
} from '@/components/wpr/wpr-analytics-panel'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
import type { WprCompWowVisible } from '@/lib/wpr/dashboard-state'
import type { TstSelectionViewModel } from '@/lib/wpr/tst-view-model'
import type { WprChangeLogEntry, WprCompetitorSummary } from '@/lib/wpr/types'
import {
  chartToggleButtonSx,
} from '@/lib/wpr/panel-tokens'
import { formatPercent } from '@/lib/wpr/format'

type TstHeroContent = {
  name: string
  meta: string[]
}

function blankMetricValue(): string {
  return '---'
}

function WeeklyGapChart({
  competitor,
  weekly,
  changeEntries,
  wowVisible,
  setWowVisible,
}: {
  competitor: WprCompetitorSummary
  weekly: TstSelectionViewModel['weekly']
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  const visibleSeries = [
    wowVisible.click ? { key: 'clickGap', label: 'Click Gap', color: '#77dfd0' } : null,
    wowVisible.purch ? { key: 'purchaseGap', label: 'Purch Gap', color: '#d5ff62' } : null,
  ].filter((value): value is { key: 'clickGap' | 'purchaseGap'; label: string; color: string } => value !== null)
  const changeMarkers = buildWeeklyChangeMarkers(changeEntries)
  let chartBody: JSX.Element
  if (weekly.length === 0) {
    chartBody = <WprChartEmptyState>No weekly TST history for this selection.</WprChartEmptyState>
  } else if (visibleSeries.length === 0) {
    chartBody = <WprChartEmptyState>Turn on at least one series to view the TST history chart.</WprChartEmptyState>
  } else {
    const changeMarkersByLabel = buildChangeMarkerLookup(changeMarkers)
    const chartRows = weekly.map((week) => ({
      weekLabel: week.week_label,
      clickGap: week.observed.click_gap * 100,
      purchaseGap: week.observed.purchase_gap * 100,
    }))

    chartBody = (
      <Box sx={{ height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value.toFixed(0)} pts`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
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
                      throw new Error('Missing TST tooltip data key')
                    }

                    const value = entry.value
                    if (typeof value !== 'number') {
                      throw new Error(`Invalid TST tooltip value for ${String(key)}`)
                    }

                    const color = entry.color
                    if (color === undefined) {
                      throw new Error(`Missing TST tooltip color for ${String(key)}`)
                    }

                    return {
                      label: key === 'clickGap' ? 'Click Gap' : 'Purch Gap',
                      value: `${value.toFixed(1)} pts`,
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
      description={`${competitor.brand} share gap shown in pts`}
      changeSummary={summarizeChangeMarkers(changeMarkers, 'week')}
      secondaryControls={
        <WprChartControlGroup label="Metrics">
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                click: !wowVisible.click,
              })
            }}
            sx={chartToggleButtonSx(wowVisible.click, '#77dfd0')}
          >
            Click Gap
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
            sx={chartToggleButtonSx(wowVisible.purch, '#d5ff62')}
          >
            Purch Gap
          </Button>
        </WprChartControlGroup>
      }
    >
      {chartBody}
    </WprChartShell>
  )
}

export default function TstWeeklyPanel({
  competitor,
  heroContent,
  viewModel,
  changeEntries,
  selectedWeekLabel,
  historyLabel,
  wowVisible,
  setWowVisible,
}: {
  competitor: WprCompetitorSummary
  heroContent: TstHeroContent
  viewModel: TstSelectionViewModel
  changeEntries: WprChangeLogEntry[]
  selectedWeekLabel: string
  historyLabel: string
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  const blankTopValues = viewModel.scopeType === 'empty'
  const current = viewModel.current

  let footerItems = [
    `Source: TST`,
    `Scope: ${viewModel.scopeType}`,
    `Roots: ${viewModel.rootIds.length}`,
    `TST terms: ${viewModel.selectedTermIds.length} / ${viewModel.allTermIds.length}`,
    `Table week: ${selectedWeekLabel}`,
    `Chart history: ${historyLabel}`,
  ]

  if (current !== null && viewModel.scopeType !== 'empty' && viewModel.scopeType !== 'no-terms') {
    footerItems = [
      `Covered terms: ${current.coverage.terms_covered} / ${viewModel.allTermIds.length}`,
      `Term-weeks: ${current.coverage.term_weeks_covered}`,
      `TST rows capture: ${formatPercent(current.coverage.avg_click_pool_share, 1)} clicks`,
      `TST rows capture: ${formatPercent(current.coverage.avg_purchase_pool_share, 1)} purchases`,
      `Table week: ${selectedWeekLabel}`,
      `Chart history: ${historyLabel}`,
    ]
  }

  return (
    <WprAnalyticsPanel
      title={heroContent.name}
      meta={heroContent.meta}
      metricColumns={{ xs: 2, md: 4 }}
      metrics={
        <>
          <WprAnalyticsMetric
            label="Terms Covered"
            value={blankTopValues || current === null ? blankMetricValue() : String(current.coverage.terms_covered)}
          />
          <WprAnalyticsMetric
            label="Term-Weeks"
            value={blankTopValues || current === null ? blankMetricValue() : String(current.coverage.term_weeks_covered)}
          />
          <WprAnalyticsMetric
            label="Our Click Share"
            value={blankTopValues || current === null ? blankMetricValue() : formatPercent(current.observed.our_click_share, 1)}
          />
          <WprAnalyticsMetric
            label={`${competitor.brand} Click Share`}
            value={blankTopValues || current === null ? blankMetricValue() : formatPercent(current.observed.competitor_click_share, 1)}
          />
        </>
      }
      footer={<WprAnalyticsFooter items={footerItems} />}
    >
      <WeeklyGapChart
        competitor={competitor}
        weekly={viewModel.weekly}
        changeEntries={changeEntries}
        wowVisible={wowVisible}
        setWowVisible={setWowVisible}
      />
    </WprAnalyticsPanel>
  )
}
