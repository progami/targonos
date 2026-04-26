'use client'

import type { JSX } from 'react'
import { Box } from '@mui/material'
import { WprAnalyticsPanel } from '@/components/wpr/wpr-analytics-panel'
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
  WprChangeTooltipContent,
} from '@/components/wpr/chart-change-markers'
import { WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import { WprInlineChartLegend, type WprInlineChartLegendItem } from '@/components/wpr/wpr-inline-chart-legend'
import type { WprCompWowVisible } from '@/lib/wpr/dashboard-state'
import type { TstSelectionViewModel } from '@/lib/wpr/tst-view-model'
import type { WprChangeLogEntry } from '@/lib/wpr/types'
import { formatTooltipWeekLabelFromLookup } from '@/lib/wpr/week-display'

type TstSeriesKey = keyof WprCompWowVisible

const TST_WOW_SERIES: Array<{
  key: TstSeriesKey
  label: string
  color: string
}> = [
  { key: 'click', label: 'Click Gap', color: '#77dfd0' },
  { key: 'purch', label: 'Purch Gap', color: '#d5ff62' },
]

function WeeklyGapChart({
  weekly,
  weekStartDates,
  changeEntries,
  wowVisible,
  setWowVisible,
}: {
  weekly: TstSelectionViewModel['weekly']
  weekStartDates: Record<string, string>
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  const visibleSeries = [
    wowVisible.click ? { key: 'clickGap', label: 'Click Gap', color: '#77dfd0' } : null,
    wowVisible.purch ? { key: 'purchaseGap', label: 'Purch Gap', color: '#d5ff62' } : null,
  ].filter((value): value is { key: 'clickGap' | 'purchaseGap'; label: string; color: string } => value !== null)
  const legendItems: Array<WprInlineChartLegendItem<TstSeriesKey>> = TST_WOW_SERIES.map((series) => ({
    ...series,
    active: wowVisible[series.key],
  }))
  const toggleSeries = (seriesKey: TstSeriesKey) => {
    setWowVisible({
      ...wowVisible,
      [seriesKey]: !wowVisible[seriesKey],
    })
  }
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
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
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
                    labelText={formatTooltipWeekLabelFromLookup(label, weekStartDates)}
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
        <WprInlineChartLegend chartId="tst" items={legendItems} onToggle={toggleSeries} />
      </Box>
    )
  }

  return (
    <WprChartShell>
      {chartBody}
    </WprChartShell>
  )
}

export default function TstWeeklyPanel({
  viewModel,
  changeEntries,
  weekStartDates,
  wowVisible,
  setWowVisible,
}: {
  viewModel: TstSelectionViewModel
  changeEntries: WprChangeLogEntry[]
  weekStartDates: Record<string, string>
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  return (
    <WprAnalyticsPanel
      footer={null}
    >
      <WeeklyGapChart
        weekly={viewModel.weekly}
        weekStartDates={weekStartDates}
        changeEntries={changeEntries}
        wowVisible={wowVisible}
        setWowVisible={setWowVisible}
      />
    </WprAnalyticsPanel>
  )
}
