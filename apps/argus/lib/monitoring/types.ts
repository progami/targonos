export type MonitoringOwner = 'OURS' | 'COMPETITOR' | 'UNKNOWN'

export type MonitoringCategory =
  | 'status'
  | 'content'
  | 'images'
  | 'price'
  | 'offers'
  | 'rank'
  | 'catalog'

export type MonitoringSeverity = 'critical' | 'high' | 'medium' | 'low'

export type MonitoringWindow = '24h' | '7d' | '30d' | 'all'

export type MonitoringSourceType = 'API' | 'BROWSER' | 'MANUAL'

export interface MonitoringStateRecord {
  asin: string
  owner: MonitoringOwner
  title: string | null
  brand: string | null
  size: string | null
  status: string | null
  sellerSku: string | null
  imageCount: number | null
  imageUrls: string[]
  landedPrice: number | null
  listingPrice: number | null
  shippingPrice: number | null
  priceCurrency: string | null
  rootBsrRank: number | null
  rootBsrCategoryId: string | null
  subBsrRank: number | null
  subBsrCategoryId: string | null
  totalOfferCount: number | null
  bulletCount: number | null
  descriptionLength: number | null
  lastUpdatedDate: string | null
}

export interface MonitoringSnapshotRecord extends MonitoringStateRecord {
  capturedAt: string
}

export interface MonitoringValueFieldChange {
  field: string
  from: string
  to: string
}

export interface MonitoringImageFieldChange {
  field: 'image_urls'
  added: string[]
  removed: string[]
}

export type MonitoringFieldChange = MonitoringValueFieldChange | MonitoringImageFieldChange

export interface MonitoringChangeEvent {
  id: string
  asin: string
  label: string | null
  owner: MonitoringOwner
  timestamp: string
  baselineTimestamp: string | null
  severity: MonitoringSeverity
  categories: MonitoringCategory[]
  primaryCategory: MonitoringCategory
  changedFieldCount: number
  changedFields: string[]
  fieldChanges: MonitoringFieldChange[]
  headline: string
  summary: string
  currentSnapshot: MonitoringSnapshotRecord | null
  baselineSnapshot: MonitoringSnapshotRecord | null
}

export interface MonitoringOverview {
  snapshotTimestamp: string
  snapshotFile: string
  trackedAsins: number
  ourAsins: number
  competitorAsins: number
  changes24h: number
  changes7d: number
  ourChanges24h: number
  competitorChanges24h: number
  critical24h: number
  topCategories24h: Array<{ category: MonitoringCategory; count: number }>
  topChanges: MonitoringChangeEvent[]
}

export interface MonitoringHealthDataset {
  id: string
  label: string
  cadence: 'hourly' | 'daily' | 'weekly'
  sourceType: MonitoringSourceType
  path: string
  driveUrl: string | null
  purpose: string
  producedBy: string | null
  consumers: string[]
  updatedAt: string | null
  ageMinutes: number | null
  status: 'healthy' | 'stale' | 'missing'
}

export interface MonitoringSchedulerJob {
  id: string
  label: string
  cadence: 'hourly' | 'daily' | 'weekly'
  sourceType: Exclude<MonitoringSourceType, 'MANUAL'>
  schedule: string
  launchdLabel: string
  plistPath: string
  target: string | null
  stdoutPath: string | null
  stderrPath: string | null
  outputs: string[]
  lastExitStatus: number | null
  pid: number | null
  latestRunStatus: 'ok' | 'failed' | null
  latestRunAt: string | null
  status: 'healthy' | 'running' | 'failed' | 'missing'
}

export interface MonitoringHealthReport {
  checkedAt: string
  datasets: MonitoringHealthDataset[]
  jobs: MonitoringSchedulerJob[]
}

export interface MonitoringAsinDetail {
  asin: string
  label: string | null
  current: MonitoringStateRecord | null
  latestSnapshotAt: string | null
  changes: MonitoringChangeEvent[]
  snapshots: MonitoringSnapshotRecord[]
}
