import React from 'react'
import { ReferenceLine } from 'recharts'
import { formatWprChangeCategory, getWprChangeCategoryColor } from '@/lib/wpr/change-log-categories'
import type { WprChangeLogEntry } from '@/lib/wpr/types'

export type ChartChangeMarkerDetail = {
  id: string
  title: string
  summary?: string
  category?: string
}

export type ChartChangeMarker = {
  label: string
  count: number
  titles: string[]
  details: ChartChangeMarkerDetail[]
}

export type WprTooltipPayloadEntry = {
  color?: string
  dataKey?: string | number
  name?: string | number
  value?: unknown
}

export type WprTooltipRow = {
  color: string
  label: string
  value: string
}

type DailyChangePoint = {
  day_label: string
  change_count: number
  change_titles: string[]
}

export function buildChangeMarkerLookup(markers: ChartChangeMarker[]): Map<string, ChartChangeMarker> {
  const markersByLabel = new Map<string, ChartChangeMarker>()

  for (const marker of markers) {
    markersByLabel.set(marker.label, marker)
  }

  return markersByLabel
}

export function buildWeeklyChangeMarkers(changeEntries: WprChangeLogEntry[]): ChartChangeMarker[] {
  const markersByLabel = new Map<string, ChartChangeMarker>()

  for (const entry of changeEntries) {
    const marker = markersByLabel.get(entry.week_label)
    if (marker === undefined) {
      markersByLabel.set(entry.week_label, {
        label: entry.week_label,
        count: 1,
        titles: [entry.title],
        details: [
          {
            id: entry.id,
            title: entry.title,
            summary: entry.summary,
            category: entry.category,
          },
        ],
      })
      continue
    }

    marker.count += 1
    marker.titles.push(entry.title)
    marker.details.push({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      category: entry.category,
    })
  }

  return Array.from(markersByLabel.values())
}

export function buildDailyChangeMarkers(points: DailyChangePoint[]): ChartChangeMarker[] {
  const markers: ChartChangeMarker[] = []

  for (const point of points) {
    if (point.change_count <= 0) {
      continue
    }

    markers.push({
      label: point.day_label,
      count: point.change_count,
      titles: point.change_titles,
      details: point.change_titles.map((title, index) => ({
        id: `${point.day_label}-${index}`,
        title,
      })),
    })
  }

  return markers
}

export function formatChangeMarkerCount(count: number): string {
  const noun = count === 1 ? 'change' : 'changes'
  return `${count} ${noun}`
}

export function summarizeChangeMarkers(
  markers: ChartChangeMarker[],
  markerUnit: 'week' | 'day',
): string {
  const markerCount = markers.length
  if (markerCount === 0) {
    return `No marked ${markerUnit}s`
  }

  const totalChangeCount = markers.reduce((sum, marker) => sum + marker.count, 0)
  const markerLabel = markerCount === 1 ? `${markerCount} marked ${markerUnit}` : `${markerCount} marked ${markerUnit}s`

  return `${formatChangeMarkerCount(totalChangeCount)} · ${markerLabel}`
}

export function buildChangeMarkerLabelParts(
  label: string | number,
  marker: ChartChangeMarker | undefined,
): string[] {
  const baseLabel = String(label)
  if (marker === undefined) {
    return [baseLabel]
  }

  return [`${baseLabel} · ${formatChangeMarkerCount(marker.count)}`, ...marker.titles]
}

export function formatChangeMarkerLabel(label: string | number, marker: ChartChangeMarker | undefined): string {
  return buildChangeMarkerLabelParts(label, marker).join(' · ')
}

export function WprChangeTooltipContent({
  active,
  label,
  labelText,
  payload,
  changeMarker,
  formatRow,
}: {
  active?: boolean
  label?: string | number
  labelText?: string | number
  payload?: readonly WprTooltipPayloadEntry[]
  changeMarker?: ChartChangeMarker
  formatRow: (entry: WprTooltipPayloadEntry) => WprTooltipRow
}) {
  if (active !== true || label === undefined || payload === undefined || payload.length === 0) {
    return null
  }

  let displayLabel: string | number = label
  if (labelText !== undefined) {
    displayLabel = labelText
  }

  const labelParts = buildChangeMarkerLabelParts(displayLabel, changeMarker)
  const header = labelParts[0]
  if (header === undefined) {
    throw new Error(`Missing tooltip header for ${String(label)}`)
  }

  const changeDetails = changeMarker === undefined ? [] : changeMarker.details
  const rows = payload.map((entry) => formatRow(entry))

  return (
    <div
      style={{
        minWidth: 184,
        maxWidth: 320,
        padding: '10px 12px',
        background: 'rgba(0,20,35,0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {header}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 6,
          marginTop: 8,
        }}
      >
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  marginTop: 3,
                  borderRadius: '50%',
                  background: row.color,
                  flex: '0 0 auto',
                }}
              />
              <span
                style={{
                  color: 'rgba(255,255,255,0.74)',
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                {row.label}
              </span>
            </div>
            <span
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {changeDetails.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gap: 6,
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {changeDetails.map((detail) => (
            <div
              key={`${header}-change-${detail.id}`}
              style={{
                display: 'grid',
                gap: 3,
              }}
            >
              {detail.category !== undefined ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      padding: '2px 6px',
                      borderRadius: 999,
                      border: `1px solid ${getWprChangeCategoryColor(detail.category)}40`,
                      background: `${getWprChangeCategoryColor(detail.category)}18`,
                      color: getWprChangeCategoryColor(detail.category),
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatWprChangeCategory(detail.category)}
                  </span>
                  <span
                    style={{
                      color: 'rgba(255,255,255,0.86)',
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {detail.title}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    color: 'rgba(255,255,255,0.86)',
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.35,
                  }}
                >
                  {detail.title}
                </div>
              )}
              {detail.summary !== undefined && detail.summary.trim() !== '' ? (
                <div
                  style={{
                    color: 'rgba(255,255,255,0.58)',
                    fontSize: 11,
                    lineHeight: 1.35,
                  }}
                >
                  {detail.summary}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function RechartsChangeMarkers({
  markers,
}: {
  markers: ChartChangeMarker[]
}) {
  return (
    <>
      {markers.map((marker) => (
        <ReferenceLine
          key={marker.label}
          x={marker.label}
          ifOverflow="visible"
          zIndex={900}
          stroke="rgba(241,235,222,0.54)"
          strokeWidth={1.4}
          strokeDasharray="4 4"
          label={
            marker.count > 1
              ? {
                  value: String(marker.count),
                  position: 'top',
                  fill: 'rgba(241,235,222,0.82)',
                  fontSize: 8,
                }
              : undefined
          }
        />
      ))}
    </>
  )
}
