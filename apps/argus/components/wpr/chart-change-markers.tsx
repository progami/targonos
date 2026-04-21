import { ReferenceLine } from 'recharts'
import type { WprChangeLogEntry } from '@/lib/wpr/types'

export type ChartChangeMarker = {
  label: string
  count: number
  titles: string[]
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
      })
      continue
    }

    marker.count += 1
    marker.titles.push(entry.title)
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
    })
  }

  return markers
}

export function formatChangeMarkerLabel(label: string | number, marker: ChartChangeMarker | undefined): string {
  const baseLabel = String(label)
  if (marker === undefined) {
    return baseLabel
  }

  const noun = marker.count === 1 ? 'change' : 'changes'
  let summary = `${baseLabel} · ${marker.count} ${noun}`
  if (marker.titles.length === 0) {
    return summary
  }

  summary += ` · ${marker.titles.join(' · ')}`
  return summary
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
