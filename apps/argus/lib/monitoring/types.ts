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
  path: string
  updatedAt: string | null
  ageMinutes: number | null
  status: 'healthy' | 'stale' | 'missing'
}

export interface MonitoringHealthReport {
  checkedAt: string
  datasets: MonitoringHealthDataset[]
}

export interface MonitoringAsinDetail {
  asin: string
  label: string | null
  current: MonitoringStateRecord | null
  latestSnapshotAt: string | null
  changes: MonitoringChangeEvent[]
  snapshots: MonitoringSnapshotRecord[]
}
