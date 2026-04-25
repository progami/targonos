import type { MonitoringStateRecord } from './types'
import { formatProductLabel } from '@/lib/product-labels'

export type MonitoringLabelSource =
  | Pick<MonitoringStateRecord, 'asin' | 'brand' | 'size' | 'title'>
  | { asin: string; brand?: string | null; size?: string | null; title?: string | null }

export function formatMonitoringLabel(source: MonitoringLabelSource): string {
  return formatProductLabel(source)
}
