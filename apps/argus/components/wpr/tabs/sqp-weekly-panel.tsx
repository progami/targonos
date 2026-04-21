'use client'

import type { JSX } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame'
import type { WprSqpWowVisible } from '@/lib/wpr/dashboard-state'
import { WPR_CHART_HEIGHT } from '@/lib/wpr/chart-layout'
import { formatCompactNumber, formatCount } from '@/lib/wpr/format'
import { chartControlRailSx, chartToggleButtonSx } from '@/lib/wpr/panel-tokens'
import {
  rateRatio,
  type SqpAggregatedMetrics,
  type SqpSelectionScope,
  type SqpWeeklyPoint,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry } from '@/lib/wpr/types'

const PANEL_SX = {
  bgcolor: 'rgba(0, 20, 35, 0.85)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
  overflow: 'hidden',
} as const

type SqpHeroContent = {
  name: string
  meta: string[]
}

type ChartPoint = {
  week_label: string
  impr_points: number
  ctr_adv: number
  atc_adv: number
  cvr_adv: number
  ctr_ratio: number
  atc_ratio: number
  cvr_ratio: number
}

type ChartSeriesMeta = {
  key: keyof WprSqpWowVisible
  label: string
  color: string
  kind: 'points' | 'ratio'
  valueField: keyof Pick<ChartPoint, 'impr_points' | 'ctr_adv' | 'atc_adv' | 'cvr_adv'>
  ratioField?: keyof Pick<ChartPoint, 'ctr_ratio' | 'atc_ratio' | 'cvr_ratio'>
}

const SQP_WOW_SERIES: ChartSeriesMeta[] = [
  { key: 'impr', label: 'Impr Share', color: '#8fc7ff', kind: 'points', valueField: 'impr_points' },
  { key: 'ctr', label: 'CTR x', color: '#e0a4ff', kind: 'ratio', valueField: 'ctr_adv', ratioField: 'ctr_ratio' },
  { key: 'atc', label: 'ATC x', color: '#f5a623', kind: 'ratio', valueField: 'atc_adv', ratioField: 'atc_ratio' },
  { key: 'cvr', label: 'CVR x', color: '#d5ff62', kind: 'ratio', valueField: 'cvr_adv', ratioField: 'cvr_ratio' },
]

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  return `${value.toFixed(2)}x`
}

function formatPoints(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  return `${value.toFixed(1)} pts`
}

function blankMetricValue(): string {
  return '---'
}

function buildChangeMarkerMap(changeEntries: WprChangeLogEntry[]): Map<string, { count: number; titles: string[] }> {
  const info = new Map<string, { count: number; titles: string[] }>()
  for (const entry of changeEntries) {
    const existing = info.get(entry.week_label)
    if (existing === undefined) {
      info.set(entry.week_label, { count: 1, titles: [entry.title] })
      continue
    }

    existing.count += 1
    if (existing.titles.length < 3) {
      existing.titles.push(entry.title)
    }
  }

  return info
}

function SqpFooter({
  scopeType,
  rootCount,
  termCount,
  totalTermCount,
  selectedWeekLabel,
  historyLabel,
}: {
  scopeType: SqpSelectionScope
  rootCount: number
  termCount: number
  totalTermCount: number
  selectedWeekLabel: string
  historyLabel: string
}) {
  const footerItems = [
    `Source: SQP`,
    `Scope: ${scopeType}`,
    `Roots: ${rootCount}`,
    `SQP terms: ${termCount} / ${totalTermCount}`,
    `Table week: ${selectedWeekLabel}`,
    `Chart history: ${historyLabel}`,
  ]

  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.62)',
      }}
    >
      {footerItems.map((item) => (
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
          color: 'rgba(255,255,255,0.54)',
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

function buildRatioFillPolygons(
  points: ChartPoint[],
  series: ChartSeriesMeta,
  xPosition: (index: number) => number,
  yPosition: (value: number) => number,
) {
  if (series.kind !== 'ratio') {
    return []
  }

  const polygons: JSX.Element[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    if (current === undefined || next === undefined) {
      throw new Error(`Missing SQP weekly chart points for index ${index}`)
    }

    const currentValue = current[series.valueField]
    const nextValue = next[series.valueField]
    const x0 = xPosition(index)
    const x1 = xPosition(index + 1)
    const y0 = yPosition(currentValue)
    const y1 = yPosition(nextValue)
    const zeroY = yPosition(0)
    const currentPositive = currentValue >= 0
    const nextPositive = nextValue >= 0

    if (currentPositive === nextPositive) {
      polygons.push(
        <polygon
          key={`${series.key}-${index}`}
          points={`${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${zeroY.toFixed(1)} ${x0.toFixed(1)},${zeroY.toFixed(1)}`}
          fill={currentPositive ? 'rgba(213,255,98,0.08)' : 'rgba(214,80,68,0.08)'}
        />,
      )
      continue
    }

    const midpointRatio = currentValue / (currentValue - nextValue)
    const midpointX = x0 + midpointRatio * (x1 - x0)
    polygons.push(
      <polygon
        key={`${series.key}-${index}-a`}
        points={`${x0.toFixed(1)},${y0.toFixed(1)} ${midpointX.toFixed(1)},${zeroY.toFixed(1)} ${x0.toFixed(1)},${zeroY.toFixed(1)}`}
        fill={currentPositive ? 'rgba(213,255,98,0.08)' : 'rgba(214,80,68,0.08)'}
      />,
    )
    polygons.push(
      <polygon
        key={`${series.key}-${index}-b`}
        points={`${midpointX.toFixed(1)},${zeroY.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${zeroY.toFixed(1)}`}
        fill={currentPositive ? 'rgba(214,80,68,0.08)' : 'rgba(213,255,98,0.08)'}
      />,
    )
  }

  return polygons
}

function SqpWeeklySvg({
  weekly,
  changeEntries,
  visibleSeries,
  width,
  height,
}: {
  weekly: SqpWeeklyPoint[]
  changeEntries: WprChangeLogEntry[]
  visibleSeries: ChartSeriesMeta[]
  width?: number
  height?: number
}) {
  if (width === undefined || height === undefined) {
    throw new Error('Missing SQP weekly chart frame size')
  }

  const compactLayout = width < 640
  const crampedLayout = width < 480
  const margin = {
    top: 18,
    right: crampedLayout ? 44 : compactLayout ? 56 : 72,
    bottom: 24,
    left: crampedLayout ? 20 : compactLayout ? 28 : 38,
  }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  if (plotWidth <= 0 || plotHeight <= 0) {
    throw new Error(`Invalid SQP weekly chart frame dimensions ${width}x${height}`)
  }

  const changeMarkers = buildChangeMarkerMap(changeEntries)
  const points: ChartPoint[] = weekly.map((week) => {
    const ctrRatio = rateRatio(week.metrics.asin_ctr, week.metrics.market_ctr)
    const atcRatio = rateRatio(week.metrics.asin_cart_add_rate, week.metrics.cart_add_rate)
    const cvrRatio = rateRatio(week.metrics.asin_cvr, week.metrics.market_cvr)

    return {
      week_label: week.week_label,
      impr_points: week.metrics.impression_share * 100,
      ctr_ratio: ctrRatio,
      atc_ratio: atcRatio,
      cvr_ratio: cvrRatio,
      ctr_adv: ctrRatio - 1,
      atc_adv: atcRatio - 1,
      cvr_adv: cvrRatio - 1,
    }
  })

  let minValue = 0
  let maxValue = 0.001
  for (const point of points) {
    for (const series of visibleSeries) {
      const value = point[series.valueField]
      if (value < minValue) {
        minValue = value
      }
      if (value > maxValue) {
        maxValue = value
      }
    }
  }

  minValue *= 1.15
  maxValue *= 1.15
  if (minValue === maxValue) {
    maxValue += 1
  }

  const xPosition = (index: number) => {
    if (points.length === 1) {
      return margin.left + plotWidth / 2
    }

    return margin.left + (index / (points.length - 1)) * plotWidth
  }

  const yPosition = (value: number) => {
    const progress = (value - minValue) / (maxValue - minValue)
    return margin.top + plotHeight - progress * plotHeight
  }

  const markerFontSize = crampedLayout ? 7 : 8
  const valueFontSize = crampedLayout ? 8 : 9
  const weekFontSize = crampedLayout ? 8 : 9
  const valueLabelX = width - margin.right + (crampedLayout ? 4 : 8)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img" aria-label="SQP weekly performance chart">
      {minValue < 0 ? (
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={yPosition(0)}
          y2={yPosition(0)}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      ) : null}
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      {visibleSeries.flatMap((series) => buildRatioFillPolygons(points, series, xPosition, yPosition))}

      {points.map((point, index) => {
        const marker = changeMarkers.get(point.week_label)
        if (marker === undefined) {
          return null
        }

        return (
          <g key={point.week_label}>
            <line
              x1={xPosition(index)}
              x2={xPosition(index)}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="rgba(241,235,222,0.34)"
              strokeWidth="1.2"
              strokeDasharray="3 5"
            />
            {marker.count > 1 ? (
              <text
                x={xPosition(index)}
                y={margin.top + 10}
                fill="rgba(241,235,222,0.82)"
                fontSize={markerFontSize}
                textAnchor="middle"
              >
                {marker.count}
              </text>
            ) : null}
          </g>
        )
      })}

      {visibleSeries.map((series) => {
        const path = points
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xPosition(index).toFixed(1)} ${yPosition(point[series.valueField]).toFixed(1)}`)
          .join(' ')
        const lastPoint = points[points.length - 1]
        if (lastPoint === undefined) {
          throw new Error('Missing SQP weekly chart endpoint')
        }

        return (
          <g key={series.key}>
            <path
              d={path}
              fill="none"
              stroke={series.color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((point, index) => (
              <circle
                key={`${series.key}-${point.week_label}`}
                cx={xPosition(index)}
                cy={yPosition(point[series.valueField])}
                r={2.6}
                fill={series.color}
                stroke="#09100f"
                strokeWidth="1"
              />
            ))}
            <text
              x={valueLabelX}
              y={yPosition(lastPoint[series.valueField]) + 4}
              fill={series.color}
              fontSize={valueFontSize}
            >
              {series.kind === 'points'
                ? formatPoints(lastPoint[series.valueField])
                : formatRatio(lastPoint[series.ratioField ?? 'ctr_ratio'])}
            </text>
          </g>
        )
      })}

      {weekly.map((week, index) => (
        <text
          key={week.week_label}
          x={xPosition(index)}
          y={height - 6}
          fill="#93a399"
          fontSize={weekFontSize}
          textAnchor="middle"
        >
          {week.week_label}
        </text>
      ))}
    </svg>
  )
}

function SqpWeeklyChart({
  weekly,
  changeEntries,
  wowVisible,
  setWowVisible,
}: {
  weekly: SqpWeeklyPoint[]
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprSqpWowVisible
  setWowVisible: (nextState: WprSqpWowVisible) => void
}) {
  const visibleSeries = SQP_WOW_SERIES.filter((series) => wowVisible[series.key])
  let chartBody: JSX.Element
  if (weekly.length === 0) {
    chartBody = (
      <Box
        sx={{
          height: WPR_CHART_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.78rem',
          letterSpacing: '0.03em',
        }}
      >
        No weekly SQP history for this selection.
      </Box>
    )
  } else if (visibleSeries.length === 0) {
    chartBody = (
      <Box
        sx={{
          height: WPR_CHART_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.78rem',
          letterSpacing: '0.03em',
        }}
      >
        Turn on at least one series to view the SQP history chart.
      </Box>
    )
  } else {
    chartBody = (
      <ResponsiveChartFrame height={WPR_CHART_HEIGHT}>
        <SqpWeeklySvg weekly={weekly} changeEntries={changeEntries} visibleSeries={visibleSeries} />
      </ResponsiveChartFrame>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={chartControlRailSx}>
        {SQP_WOW_SERIES.map((series) => (
          <Button
            key={series.key}
            size="small"
            variant="outlined"
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                [series.key]: !wowVisible[series.key],
              })
            }}
            sx={chartToggleButtonSx(wowVisible[series.key], series.color)}
          >
            {series.label}
          </Button>
        ))}
      </Box>

      {chartBody}
    </Stack>
  )
}

export default function SqpWeeklyPanel({
  heroContent,
  blankTopValues,
  currentMetrics,
  weekly,
  changeEntries,
  wowVisible,
  setWowVisible,
  scopeType,
  selectedRootCount,
  selectedTermCount,
  totalTermCount,
  selectedWeekLabel,
  historyLabel,
}: {
  heroContent: SqpHeroContent
  blankTopValues: boolean
  currentMetrics: SqpAggregatedMetrics | null
  weekly: SqpWeeklyPoint[]
  changeEntries: WprChangeLogEntry[]
  wowVisible: WprSqpWowVisible
  setWowVisible: (nextState: WprSqpWowVisible) => void
  scopeType: SqpSelectionScope
  selectedRootCount: number
  selectedTermCount: number
  totalTermCount: number
  selectedWeekLabel: string
  historyLabel: string
}) {
  return (
    <Box sx={PANEL_SX}>
      <Box
        sx={{
          px: 2.5,
          pt: 2.2,
          pb: 1.4,
        }}
      >
        <Typography
          sx={{
            fontSize: '1.35rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: 'rgba(255,255,255,0.95)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {heroContent.name}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.6)',
            mt: 0.4,
            minHeight: '1.1rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {heroContent.meta.join(' · ')}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: { xs: 1.5, sm: 4 },
            mt: 1.8,
            minHeight: '3.1rem',
          }}
        >
          <MetricChip
            label="Query Volume"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCompactNumber(currentMetrics.query_volume)}
          />
          <MetricChip
            label="Market Purchases"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.market_purchases)}
          />
          <MetricChip
            label="Our Purchases"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.asin_purchases)}
          />
        </Box>
      </Box>

      <Box sx={{ px: 2.5, pb: 2.2 }}>
        <SqpWeeklyChart
          weekly={weekly}
          changeEntries={changeEntries}
          wowVisible={wowVisible}
          setWowVisible={setWowVisible}
        />
      </Box>

      <SqpFooter
        scopeType={scopeType}
        rootCount={selectedRootCount}
        termCount={selectedTermCount}
        totalTermCount={totalTermCount}
        selectedWeekLabel={selectedWeekLabel}
        historyLabel={historyLabel}
      />
    </Box>
  )
}
