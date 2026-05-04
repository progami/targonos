'use client'

import { Box, Stack, Typography } from '@mui/material'
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import {
  buildChangeMarkerLookup,
  buildWeeklyChangeMarkers,
  RechartsChangeMarkers,
  WprChangeTooltipContent,
} from '@/components/wpr/chart-change-markers'
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame'
import { WPR_CHART_HEIGHT } from '@/lib/wpr/chart-layout'
import { createCompareViewModel } from '@/lib/wpr/compare-view-model'
import { formatCompactNumber } from '@/lib/wpr/format'
import {
  panelBadgeSx,
  panelHeadSx,
  panelSx,
  panelTitleSx,
  textPrimary,
  textSecondary,
} from '@/lib/wpr/panel-tokens'
import type { WprChangeLogEntry, WprWeekBundle } from '@/lib/wpr/types'
import { buildBundleWeekStartDateLookup, formatTooltipWeekLabelFromLookup } from '@/lib/wpr/week-display'
import { CompareChartLegend } from './compare-chart-legend'

const brandTooltipProps = {
  contentStyle: {
    background: 'rgba(0,20,35,0.96)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  labelStyle: {
    color: textPrimary,
  },
  itemStyle: {
    color: textSecondary,
  },
}

function PanelTitle({
  title,
  badge,
}: {
  title: string
  badge: string
}) {
  return (
    <Box sx={panelHeadSx}>
      <Typography sx={panelTitleSx}>{title}</Typography>
      <Typography sx={panelBadgeSx}>{badge}</Typography>
    </Box>
  )
}

export default function BrandMetricsTab({
  bundle,
  changeEntries,
}: {
  bundle: WprWeekBundle
  changeEntries: WprChangeLogEntry[]
}) {
  const viewModel = createCompareViewModel(bundle)
  const weekStartDates = buildBundleWeekStartDateLookup(bundle)
  const weeklyChangeMarkers = buildWeeklyChangeMarkers(changeEntries)
  const weeklyChangeMarkersByLabel = buildChangeMarkerLookup(weeklyChangeMarkers)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 2,
      }}
    >
      <Box sx={panelSx}>
        <PanelTitle title="Brand Metrics" badge="Awareness / Consideration / Purchase" />
        <Box sx={{ p: 1.5 }}>
          {viewModel.brandRows.length === 0 ? (
            <Box
              sx={{
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.54)',
                fontSize: '0.76rem',
              }}
            >
              No brand metrics data.
            </Box>
          ) : (
            <Stack spacing={1.25}>
              <Box role="img" aria-label="Brand metrics trend over weeks showing awareness, consideration, and purchase">
                <ResponsiveChartFrame height={WPR_CHART_HEIGHT}>
                  <LineChart data={viewModel.brandRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 10 }} />
                    <Tooltip
                      {...brandTooltipProps}
                      content={({ active, payload, label }) => (
                        <WprChangeTooltipContent
                          active={active}
                          payload={payload}
                          label={label}
                          labelText={formatTooltipWeekLabelFromLookup(label, weekStartDates)}
                          changeMarker={weeklyChangeMarkersByLabel.get(String(label))}
                          formatRow={(entry) => {
                            const value = entry.value
                            if (typeof value !== 'number') {
                              throw new Error(`Invalid brand-metrics tooltip value for ${String(entry.dataKey)}`)
                            }

                            const color = entry.color
                            if (color === undefined) {
                              throw new Error(`Missing brand-metrics tooltip color for ${String(entry.dataKey)}`)
                            }

                            const name = entry.name
                            if (name === undefined) {
                              throw new Error(`Missing brand-metrics tooltip label for ${String(entry.dataKey)}`)
                            }

                            return {
                              label: String(name),
                              value: formatCompactNumber(value),
                              color,
                            }
                          }}
                        />
                      )}
                    />
                    <RechartsChangeMarkers markers={weeklyChangeMarkers} />
                    <Legend content={<CompareChartLegend />} />
                    <Line type="monotone" dataKey="awareness" name="Awareness" stroke="#8fc7ff" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#8fc7ff' }} activeDot={{ r: 3.5 }} />
                    <Line type="monotone" dataKey="consideration" name="Consideration" stroke="#77dfd0" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#77dfd0' }} activeDot={{ r: 3.5 }} />
                    <Line type="monotone" dataKey="purchase" name="Purchase" stroke="#d5ff62" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#d5ff62' }} activeDot={{ r: 3.5 }} />
                  </LineChart>
                </ResponsiveChartFrame>
              </Box>
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  )
}
