'use client'

import React, { useState, type JSX } from 'react'
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame'
import { WprAnalyticsPanel } from '@/components/wpr/wpr-analytics-panel'
import {
  buildChangeMarkerLabelParts,
  buildChangeMarkerLookup,
  buildWeeklyChangeMarkers,
} from '@/components/wpr/chart-change-markers'
import { WprChartEmptyState, WprChartShell } from '@/components/wpr/wpr-chart-shell'
import type { WprSqpWowVisible } from '@/lib/wpr/dashboard-state'
import { formatWprChangeCategory, getWprChangeCategoryColor } from '@/lib/wpr/change-log-categories'
import { formatWeekLabelWithDateRange } from '@/lib/wpr/week-display'
import {
  rateRatio,
  type SqpWeeklyPoint,
} from '@/lib/wpr/sqp-view-model'
import type { WprChangeLogEntry } from '@/lib/wpr/types'

type ChartPoint = {
  week_label: string
  start_date: string
  query_volume: number
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

type SqpLegendKey = 'qvol' | ChartSeriesMeta['key']

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

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
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
    if (current === undefined) {
      throw new Error(`Missing SQP weekly chart current point for index ${index}`)
    }
    if (next === undefined) {
      throw new Error(`Missing SQP weekly chart next point for index ${index}`)
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
  seriesVisibility,
  qVolVisible,
  width,
  height,
  hoveredIndex,
  onHoverIndexChange,
  onToggleQVol,
  onToggleSeries,
}: {
  weekly: SqpWeeklyPoint[]
  changeEntries: WprChangeLogEntry[]
  visibleSeries: ChartSeriesMeta[]
  seriesVisibility: WprSqpWowVisible
  qVolVisible: boolean
  width?: number
  height?: number
  hoveredIndex: number | null
  onHoverIndexChange: (index: number | null) => void
  onToggleQVol: () => void
  onToggleSeries: (seriesKey: keyof WprSqpWowVisible) => void
}) {
  if (width === undefined) {
    throw new Error('Missing SQP weekly chart frame width')
  }
  if (height === undefined) {
    throw new Error('Missing SQP weekly chart frame height')
  }

  const compactLayout = width < 640
  const crampedLayout = width < 480
  const margin = {
    top: 18,
    right: crampedLayout ? 44 : compactLayout ? 56 : 72,
    bottom: crampedLayout ? 40 : 42,
    left: crampedLayout ? 20 : compactLayout ? 28 : 38,
  }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  if (plotWidth <= 0) {
    throw new Error(`Invalid SQP weekly chart frame width ${width}`)
  }
  if (plotHeight <= 0) {
    throw new Error(`Invalid SQP weekly chart frame height ${height}`)
  }
  const plotBottomY = height - margin.bottom

  const changeMarkers = buildChangeMarkerLookup(buildWeeklyChangeMarkers(changeEntries))
  const points: ChartPoint[] = weekly.map((week) => {
    const ctrRatio = rateRatio(week.metrics.asin_ctr, week.metrics.market_ctr)
    const atcRatio = rateRatio(week.metrics.asin_cart_add_rate, week.metrics.cart_add_rate)
    const cvrRatio = rateRatio(week.metrics.asin_cvr, week.metrics.market_cvr)

    return {
      week_label: week.week_label,
      start_date: week.start_date,
      query_volume: week.metrics.query_volume,
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

  const minQueryVolume = Math.min(...points.map((point) => point.query_volume))
  const maxQueryVolume = Math.max(...points.map((point) => point.query_volume))
  const queryVolumeRange = maxQueryVolume - minQueryVolume
  const queryVolumeYPosition = (value: number) => {
    if (queryVolumeRange === 0) {
      return margin.top + plotHeight / 2
    }

    const progress = (value - minQueryVolume) / queryVolumeRange
    return margin.top + plotHeight - progress * plotHeight
  }

  const markerFontSize = crampedLayout ? 7 : 8
  const valueFontSize = crampedLayout ? 8 : 9
  const weekFontSize = crampedLayout ? 8 : 9
  const legendFontSize = crampedLayout ? 7 : 8
  const legendY = height - (crampedLayout ? 6 : 7)
  const weekLabelY = height - (crampedLayout ? 22 : 24)
  const legendGap = crampedLayout ? 55 : compactLayout ? 70 : 86
  const legendItemWidth = crampedLayout ? 47 : compactLayout ? 58 : 70
  const valueLabelX = width - margin.right + (crampedLayout ? 4 : 8)
  const legendItems: Array<{
    key: SqpLegendKey
    label: string
    color: string
    dash: boolean
    active: boolean
  }> = [
    { key: 'qvol', label: 'Q Vol', color: '#00c2b9', dash: true, active: qVolVisible },
    ...SQP_WOW_SERIES.map((series) => ({
      key: series.key,
      label: series.label,
      color: series.color,
      dash: false,
      active: seriesVisibility[series.key],
    })),
  ]
  const legendTotalWidth = (legendItems.length - 1) * legendGap + legendItemWidth
  let legendStartX = margin.left + (plotWidth - legendTotalWidth) / 2
  if (legendStartX < margin.left) {
    legendStartX = margin.left
  }
  const toggleLegendItem = (key: SqpLegendKey) => {
    if (key === 'qvol') {
      onToggleQVol()
      return
    }

    onToggleSeries(key)
  }
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
    const tooltipRows: Array<{
      key: string
      label: string
      color: string
      value: string
    }> = visibleSeries.map((series) => ({
      key: series.key,
      label: series.label,
      color: series.color,
      value: formatSeriesTooltipValue(hoveredPoint, series),
    }))
    if (qVolVisible) {
      tooltipRows.unshift(
        {
          key: 'query-volume',
          label: 'Q Vol',
          color: '#00c2b9',
          value: formatCompactCount(hoveredPoint.query_volume),
        },
      )
    }
    const tooltipLabelParts = buildChangeMarkerLabelParts(
      formatWeekLabelWithDateRange(hoveredPoint.week_label, hoveredPoint.start_date),
      hoveredMarker,
    )
    const tooltipHeader = tooltipLabelParts[0]
    if (tooltipHeader === undefined) {
      throw new Error(`Missing SQP tooltip header for ${hoveredPoint.week_label}`)
    }

    const tooltipWidth = crampedLayout ? 146 : compactLayout ? 170 : 188
    const tooltipHeaderFontSize = crampedLayout ? 8 : 9
    const tooltipRowFontSize = crampedLayout ? 7 : 8
    const tooltipRowHeight = crampedLayout ? 13 : 15
    const tooltipPaddingX = crampedLayout ? 8 : 10
    const tooltipTop = margin.top + 8
    const changeDetails = hoveredMarker === undefined ? [] : hoveredMarker.details
    const changeRowHeight = crampedLayout ? 12 : 14
    const changeSummaryHeight = crampedLayout ? 11 : 13
    let changeSectionHeight = 0
    for (const detail of changeDetails) {
      changeSectionHeight += changeRowHeight
      if (detail.summary !== undefined && detail.summary.trim() !== '') {
        changeSectionHeight += changeSummaryHeight
      }
      changeSectionHeight += 4
    }
    if (changeDetails.length > 0) {
      changeSectionHeight += 10
    }
    const tooltipHeight = 22 + tooltipRows.length * tooltipRowHeight + changeSectionHeight + 8
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
          y2={plotBottomY}
          stroke="rgba(255,255,255,0.2)"
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
          {changeDetails.length > 0 ? (
            <line
              x1={tooltipPaddingX}
              x2={tooltipWidth - tooltipPaddingX}
              y1={30 + tooltipRows.length * tooltipRowHeight + 3}
              y2={30 + tooltipRows.length * tooltipRowHeight + 3}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ) : null}
          {changeDetails
            .reduce<Array<{ detail: typeof changeDetails[number]; summary: string | null; y: number }>>((rows, detail) => {
              const previous = rows[rows.length - 1]
              let nextY = 30 + tooltipRows.length * tooltipRowHeight + 14
              if (previous !== undefined) {
                nextY = previous.y + changeRowHeight + 4
                if (previous.summary !== null) {
                  nextY += changeSummaryHeight
                }
              }

              const summary = detail.summary !== undefined && detail.summary.trim() !== '' ? detail.summary : null
              rows.push({ detail, summary, y: nextY })
              return rows
            }, [])
            .map(({ detail, summary, y }) => (
              <g key={`${hoveredPoint.week_label}-change-${detail.id}`}>
                <text
                  x={tooltipPaddingX}
                  y={y}
                  fontSize={tooltipRowFontSize}
                >
                  {detail.category !== undefined ? (
                    <>
                      <tspan fill={getWprChangeCategoryColor(detail.category)} fontWeight="700">
                        {formatWprChangeCategory(detail.category)}
                      </tspan>
                      <tspan fill="rgba(255,255,255,0.86)"> · {detail.title}</tspan>
                    </>
                  ) : (
                    <tspan fill="rgba(255,255,255,0.86)">{detail.title}</tspan>
                  )}
                </text>
                {summary !== null ? (
                  <text
                    x={tooltipPaddingX}
                    y={y + changeSummaryHeight - 2}
                    fill="rgba(255,255,255,0.58)"
                    fontSize={tooltipRowFontSize}
                  >
                    {summary}
                  </text>
                ) : null}
              </g>
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
        {qVolVisible ? (
          <circle
            cx={activeX}
            cy={queryVolumeYPosition(hoveredPoint.query_volume)}
            r={4.2}
            fill="#00c2b9"
            stroke="#09100f"
            strokeWidth="1.8"
          />
        ) : null}
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
        y1={plotBottomY}
        y2={plotBottomY}
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
              y2={plotBottomY}
              stroke="rgba(241,235,222,0.24)"
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

      {qVolVisible ? (
        <g data-series="query-volume-line" aria-label="SQP normalized query volume line">
          <path
            d={points
              .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xPosition(index).toFixed(1)} ${queryVolumeYPosition(point.query_volume).toFixed(1)}`)
              .join(' ')}
            fill="none"
            stroke="#00c2b9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 5"
          />
          {points.map((point, index) => (
            <circle
              key={`qvol-line-${point.week_label}`}
              cx={xPosition(index)}
              cy={queryVolumeYPosition(point.query_volume)}
              r={2.5}
              fill="#00c2b9"
              stroke="#09100f"
              strokeWidth="1"
            />
          ))}
        </g>
      ) : null}

      {hoverTooltip}

      {weekly.map((week, index) => (
        <text
          key={week.week_label}
          x={xPosition(index)}
          y={weekLabelY}
          fill={activeHoverIndex === index ? 'rgba(255,255,255,0.86)' : '#93a399'}
          fontSize={weekFontSize}
          fontWeight={activeHoverIndex === index ? '700' : '500'}
          textAnchor="middle"
        >
          {week.week_label}
        </text>
      ))}

      <g data-chart-legend="sqp" aria-label="SQP chart legend">
        {legendItems.map((item, index) => {
          const x = legendStartX + index * legendGap
          return (
            <g
              key={item.key}
              transform={`translate(${x}, ${legendY})`}
              aria-label={`${item.label} series`}
              data-legend-item={item.key}
              data-active={item.active ? 'true' : 'false'}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                toggleLegendItem(item.key)
              }}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1="0"
                x2="15"
                y1="-4"
                y2="-4"
                stroke={item.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={item.dash ? '5 4' : undefined}
                opacity={item.active ? 1 : 0.28}
              />
              <text
                x="20"
                y="0"
                fill={item.active ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.34)'}
                fontSize={legendFontSize}
                fontWeight="600"
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </g>

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
  const [qVolVisible, setQVolVisible] = useState(true)
  const visibleSeries = SQP_WOW_SERIES.filter((series) => wowVisible[series.key])
  let chartBody: JSX.Element
  if (weekly.length === 0) {
    chartBody = <WprChartEmptyState>No weekly SQP history for this selection.</WprChartEmptyState>
  } else if (visibleSeries.length === 0 && !qVolVisible) {
    chartBody = <WprChartEmptyState>Turn on at least one series to view the SQP history chart.</WprChartEmptyState>
  } else {
    chartBody = (
      <ResponsiveChartFrame height="100%">
        <SqpWeeklySvg
          weekly={weekly}
          changeEntries={changeEntries}
          visibleSeries={visibleSeries}
          seriesVisibility={wowVisible}
          qVolVisible={qVolVisible}
          hoveredIndex={hoveredIndex}
          onHoverIndexChange={setHoveredIndex}
          onToggleQVol={() => {
            setQVolVisible(!qVolVisible)
          }}
          onToggleSeries={(seriesKey) => {
            setWowVisible({
              ...wowVisible,
              [seriesKey]: !wowVisible[seriesKey],
            })
          }}
        />
      </ResponsiveChartFrame>
    )
  }

  return (
    <WprChartShell>
      {chartBody}
    </WprChartShell>
  )
}

export default function SqpWeeklyPanel({
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
  return (
    <WprAnalyticsPanel
      footer={null}
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
