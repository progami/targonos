import { withAppBasePath } from '@/lib/base-path'

export function getTimeSeriesCsvPath(): string {
  return withAppBasePath('/api/v1/time-series/csv')
}
