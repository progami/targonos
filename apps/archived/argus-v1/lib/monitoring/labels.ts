import type { MonitoringStateRecord } from './types'

export type MonitoringLabelSource =
  | Pick<MonitoringStateRecord, 'asin' | 'brand' | 'size' | 'title'>
  | { asin: string; brand?: string | null; size?: string | null; title?: string | null }

export function formatMonitoringLabel(source: MonitoringLabelSource): string {
  const asin = source.asin.trim().toUpperCase()
  const brand = (source.brand ?? '').trim()
  const size = (source.size ?? '').trim()
  const title = (source.title ?? '').trim()

  if (brand && size) return `${brand} - ${size}`
  if (brand) return brand
  if (size) return size
  if (title) return title

  return asin
}
