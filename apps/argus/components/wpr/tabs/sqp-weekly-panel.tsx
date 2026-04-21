'use client'

import React, { useState, type JSX } from 'react'
import { Button } from '@mui/material'
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame'
import {
  WprAnalyticsFooter,
  WprAnalyticsMetric,
  WprAnalyticsPanel,
} from '@/components/wpr/wpr-analytics-panel'
import {
  buildChangeMarkerLabelParts,
  buildChangeMarkerLookup,
  buildWeeklyChangeMarkers,
} from '@/components/wpr/chart-change-markers'
import { WprChartControlGroup, WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import type { WprSqpWowVisible } from '@/lib/wpr/dashboard-state'
import { formatCompactNumber, formatCount } from '@/lib/wpr/format'
import { chartToggleButtonSx } from '@/lib/wpr/panel-tokens'
import { formatWeekLabelWithDateRange } from '@/lib/wpr/week-display'
import {
  rateRatio,
  type SqpAggregatedMetrics,
  type SqpSelectionScope,
  type SqpWeeklyPoint,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry } from '@/lib/wpr/types'

type SqpHeroContent = {
  name: string
  meta: string[]
}

type ChartPoint = {
  week_label: string
  start_date: string
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

export const SQP_WOW_SERIES: ChartSeriesMeta[] = [
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

function buildFooterItems({
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

  return footerItems
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

function formatSeriesTooltipValue(point: ChartPoint, series: ChartSeriesMeta): string {
  if (series.kind === 'points') {
    return formatPoints(point[series.valueField])
  }

  const ratioField = series.ratioField
  if (ratioField === undefined) {
    throw new Error(`Missing SQP ratio field for ${series.key}`)
  }

  return formatRatio(point[ratioField])
}

export function SqpWeeklySvg({
  weekly,
  changeEntries,
  visibleSeries,
  width,
  height,
  hoveredIndex,
  onHoverIndexChange,
}: {
  weekly: SqpWeeklyPoint[]
  changeEntries: WprChangeLogEntry[]
  visibleSeries: ChartSeriesMeta[]
  width?: number
  height?: number
  hoveredIndex: number | null
  onHoverIndexChange: (index: number | null) => void
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

  const changeMarkers = buildChangeMarkerLookup(buildWeeklyChangeMarkers(changeEntries))
  const points: ChartPoint[] = weekly.map((week) => {
    const ctrRatio = rateRatio(week.metrics.asin_ctr, week.metrics.market_ctr)
    const atcRatio = rateRatio(week.metrics.asin_cart_add_rate, week.metrics.cart_add_rate)
    const cvrRatio = rateRatio(week.metrics.asin_cvr, week.metrics.market_cvr)

    return {
      week_label: week.week_label,
      start_date: week.start_date,
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
  let activeHoverIndex: number | null = null
  if (hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length) {
    activeHoverIndex = hoveredIndex
  }

  let hoverTooltip: JSX.Element | null = null
  if (activeHoverIndex !== null) {
    const hoveredPoint = points[activeHoverIndex]
    if (hoveredPoint === undefined) {
      throw new Error(`Missing SQP hover point at index ${activeHoverIndex}`)
    }

    const hoveredMarker = changeMarkers.get(hoveredPoint.week_label)
    const tooltipRows = visibleSeries.map((series) => ({
      key: series.key,
      label: series.label,
      color: series.color,
      value: formatSeriesTooltipValue(hoveredPoint, series),
    }))
    const tooltipLabelParts = buildChangeMarkerLabelParts(
      formatWeekLabelWithDateRange(hoveredPoint.week_label, hoveredPoint.start_date),
      hoveredMarker,
    )
    const tooltipHeader = tooltipLabelParts[0]
    if (tooltipHeader === undefined) {
      throw new Error(`Missing SQP tooltip header for ${hoveredPoint.week_label}`)
    }

    const changeDetailLines = tooltipLabelParts.slice(1)
    const tooltipWidth = crampedLayout ? 146 : compactLayout ? 170 : 188
    const tooltipHeaderFontSize = crampedLayout ? 8 : 9
    const tooltipRowFontSize = crampedLayout ? 7 : 8
    const tooltipRowHeight = crampedLayout ? 13 : 15
    const tooltipPaddingX = crampedLayout ? 8 : 10
    const tooltipTop = margin.top + 8
    const changeLineCount = changeDetailLines.length
    const tooltipHeight = 22 + tooltipRows.length * tooltipRowHeight + changeLineCount * tooltipRowHeight + 8
    const tooltipMinX = margin.left + 4
    let tooltipMaxX = width - margin.right - tooltipWidth
    if (tooltipMaxX < tooltipMinX) {
      tooltipMaxX = tooltipMinX
    }
    let tooltipX = xPosition(activeHoverIndex) + 12
    if (tooltipX < tooltipMinX) {
      tooltipX = tooltipMinX
    }
    if (tooltipX > tooltipMaxX) {
      tooltipX = tooltipMaxX
    }
    const activeX = xPosition(activeHoverIndex)

    hoverTooltip = (
      <g data-hover-tooltip="sqp" pointerEvents="none">
        <line
          x1={activeX}
          x2={activeX}
          y1={margin.top}
          y2={height - margin.bottom}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />
        <g transform={`translate(${tooltipX}, ${tooltipTop})`}>
          <rect
            width={tooltipWidth}
            height={tooltipHeight}
            rx="9"
            fill="rgba(0,20,35,0.96)"
            stroke="rgba(255,255,255,0.08)"
          />
          <text
            x={tooltipPaddingX}
            y={15}
            fill="rgba(255,255,255,0.92)"
            fontSize={tooltipHeaderFontSize}
            fontWeight="700"
          >
            {tooltipHeader}
          </text>
          {tooltipRows.map((row, rowIndex) => {
            const rowY = 30 + rowIndex * tooltipRowHeight
            return (
              <g key={row.key}>
                <circle cx={tooltipPaddingX + 3} cy={rowY - 3} r="2.6" fill={row.color} />
                <text
                  x={tooltipPaddingX + 10}
                  y={rowY}
                  fill="rgba(255,255,255,0.74)"
                  fontSize={tooltipRowFontSize}
                >
                  {row.label}
                </text>
                <text
                  x={tooltipWidth - tooltipPaddingX}
                  y={rowY}
                  fill="rgba(255,255,255,0.9)"
                  fontSize={tooltipRowFontSize}
                  fontWeight="700"
                  textAnchor="end"
                >
                  {row.value}
                </text>
              </g>
            )
          })}
          {changeDetailLines.map((line, lineIndex) => (
            <text
              key={`${hoveredPoint.week_label}-change-${lineIndex}`}
              x={tooltipPaddingX}
              y={30 + tooltipRows.length * tooltipRowHeight + lineIndex * tooltipRowHeight}
              fill="rgba(255,255,255,0.58)"
              fontSize={tooltipRowFontSize}
            >
              {line}
            </text>
          ))}
        </g>
        {visibleSeries.map((series) => (
          <circle
            key={`active-${series.key}`}
            cx={activeX}
            cy={yPosition(hoveredPoint[series.valueField])}
            r={4.2}
            fill={series.color}
            stroke="#09100f"
            strokeWidth="1.8"
          />
        ))}
      </g>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="SQP weekly performance chart"
      onMouseLeave={() => {
        onHoverIndexChange(null)
      }}
    >
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

      {hoverTooltip}

      {weekly.map((week, index) => (
        <text
          key={week.week_label}
          x={xPosition(index)}
          y={height - 6}
          fill={activeHoverIndex === index ? 'rgba(255,255,255,0.86)' : '#93a399'}
          fontSize={weekFontSize}
          fontWeight={activeHoverIndex === index ? '700' : '500'}
          textAnchor="middle"
        >
          {week.week_label}
        </text>
      ))}

      {points.map((point, index) => {
        const currentX = xPosition(index)
        const previousX = index === 0 ? margin.left : (xPosition(index - 1) + currentX) / 2
        const nextX = index === points.length - 1 ? width - margin.right : (currentX + xPosition(index + 1)) / 2
        return (
          <rect
            key={`hover-zone-${point.week_label}`}
            x={previousX}
            y={margin.top}
            width={nextX - previousX}
            height={plotHeight}
            fill="transparent"
            pointerEvents="all"
            onMouseEnter={() => {
              onHoverIndexChange(index)
            }}
            onMouseMove={() => {
              onHoverIndexChange(index)
            }}
          />
        )
      })}
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const visibleSeries = SQP_WOW_SERIES.filter((series) => wowVisible[series.key])
  let chartBody: JSX.Element
  if (weekly.length === 0) {
    chartBody = <WprChartEmptyState>No weekly SQP history for this selection.</WprChartEmptyState>
  } else if (visibleSeries.length === 0) {
    chartBody = <WprChartEmptyState>Turn on at least one series to view the SQP history chart.</WprChartEmptyState>
  } else {
    chartBody = (
      <ResponsiveChartFrame height="100%">
        <SqpWeeklySvg
          weekly={weekly}
          changeEntries={changeEntries}
          visibleSeries={visibleSeries}
          hoveredIndex={hoveredIndex}
          onHoverIndexChange={setHoveredIndex}
        />
      </ResponsiveChartFrame>
    )
  }

  return (
    <WprChartShell
      secondaryControls={
        <WprChartControlGroup label="Metrics">
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
        </WprChartControlGroup>
      }
    >
      {chartBody}
    </WprChartShell>
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
  const footerItems = buildFooterItems({
    scopeType,
    rootCount: selectedRootCount,
    termCount: selectedTermCount,
    totalTermCount,
    selectedWeekLabel,
    historyLabel,
  })

  return (
    <WprAnalyticsPanel
      title={heroContent.name}
      meta={heroContent.meta}
      metricColumns={{ xs: 2, md: 3 }}
      metrics={
        <>
          <WprAnalyticsMetric
            label="Query Volume"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCompactNumber(currentMetrics.query_volume)}
          />
          <WprAnalyticsMetric
            label="Market Purchases"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.market_purchases)}
          />
          <WprAnalyticsMetric
            label="Our Purchases"
            value={blankTopValues || currentMetrics === null ? blankMetricValue() : formatCount(currentMetrics.asin_purchases)}
          />
        </>
      }
      footer={<WprAnalyticsFooter items={footerItems} />}
    >
      <SqpWeeklyChart
        weekly={weekly}
        changeEntries={changeEntries}
        wowVisible={wowVisible}
        setWowVisible={setWowVisible}
      />
    </WprAnalyticsPanel>
  )
}
