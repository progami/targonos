import 'server-only'

import { promises as fs } from 'fs'
import path from 'path'
import prisma from '@/lib/db'
import { parseCsvRows } from './csv'
import type {
  MonitoringAsinDetail,
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringHealthDataset,
  MonitoringHealthReport,
  MonitoringOverview,
  MonitoringOwner,
  MonitoringSeverity,
  MonitoringSnapshotRecord,
  MonitoringStateRecord,
  MonitoringWindow,
} from './types'

const MONITORING_BASE =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'

const LISTING_ATTRIBUTES_BASE = path.join(MONITORING_BASE, 'Hourly/Listing Attributes (API)')
const LATEST_STATE_PATH = path.join(LISTING_ATTRIBUTES_BASE, 'latest_state.json')
const CHANGE_HISTORY_PATH = path.join(LISTING_ATTRIBUTES_BASE, 'Listings-Changes-History.csv')
const SNAPSHOT_HISTORY_PATH = path.join(LISTING_ATTRIBUTES_BASE, 'Listings-Snapshot-History.csv')

const HOUR_IN_MINUTES = 60
const DAY_IN_MINUTES = 24 * HOUR_IN_MINUTES

const CATEGORY_FIELDS: Record<MonitoringCategory, Set<string>> = {
  status: new Set([
    'status',
    'owner_type',
    'seller_sku',
    'belongs_to_requester',
    'own_issue_count',
    'own_issue_codes',
  ]),
  content: new Set([
    'title',
    'brand',
    'manufacturer',
    'model_number',
    'product_type',
    'item_classification',
    'color',
    'size',
    'material',
    'variation_theme',
    'bullet_points',
    'description',
    'backend_terms',
    'title_length',
    'bullet_count',
    'description_length',
    'backend_terms_count',
  ]),
  images: new Set([
    'image_count',
    'image_urls',
    'added_images',
    'removed_images',
    'image_order_changed',
  ]),
  price: new Set([
    'landed_price',
    'listing_price',
    'shipping_price',
    'price_currency',
    'list_price',
    'list_price_currency',
    'buy_box_landed_price',
    'buy_box_listing_price',
    'buy_box_shipping_price',
    'buy_box_price_currency',
    'lowest_fba_landed_price',
    'lowest_fba_listing_price',
    'lowest_fba_shipping_price',
    'lowest_mfn_landed_price',
    'lowest_mfn_listing_price',
    'lowest_mfn_shipping_price',
    'lowest_offer_currency',
    'own_offer_b2c_price',
    'own_offer_b2c_currency',
    'own_offer_b2b_price',
    'own_offer_b2b_currency',
  ]),
  offers: new Set([
    'offers_any',
    'offers_new',
    'total_offer_count',
    'offers_fba',
    'offers_mfn',
    'featured_offer_count',
    'prime_offer_count',
    'fba_offer_count',
    'unique_seller_count',
    'buybox_eligible_offer_count',
    'buybox_winner_seller_id',
    'buybox_winner_is_fba',
    'buybox_winner_is_prime',
    'buybox_winner_is_featured',
    'buybox_winner_feedback_count',
    'buybox_winner_positive_feedback_pct',
    'own_offer_types',
    'own_offer_audiences',
    'own_fulfillment_channels',
    'own_fulfillment_channel_count',
    'own_fulfillment_quantity_total',
  ]),
  rank: new Set([
    'root_bsr_rank',
    'root_bsr_category_id',
    'sub_bsr_rank',
    'sub_bsr_category_id',
    'leaf_classification_id',
    'leaf_classification_name',
    'root_classification_id',
    'root_classification_name',
  ]),
  catalog: new Set([
    'upc',
    'ean',
    'isbn',
    'parent_asins',
    'child_asins',
    'related_asins',
    'item_dimensions',
    'item_package_dimensions',
    'item_weight',
    'item_package_weight',
    'created_date',
    'last_updated_date',
  ]),
}

const CATEGORY_PRIORITY: MonitoringCategory[] = [
  'status',
  'content',
  'images',
  'price',
  'offers',
  'rank',
  'catalog',
]

interface LatestStateFile {
  timestamp_utc: string
  snapshot_file: string
  by_asin: Record<string, Record<string, unknown>>
}

interface ChangeHistoryRow {
  snapshot_timestamp_utc: string
  asin: string
  owner_type: string
  baseline_timestamp_utc: string
  changed: string
  changed_fields: string
  changed_field_count: string
}

export interface MonitoringChangeFilters {
  window?: MonitoringWindow
  owner?: MonitoringOwner | 'ALL'
  category?: MonitoringCategory | 'ALL'
  severity?: MonitoringSeverity | 'ALL'
  query?: string
}

export async function getMonitoringOverview(): Promise<MonitoringOverview> {
  const model = await loadMonitoringModel()
  const changes24h = filterByWindow(model.changes, '24h')
  const changes7d = filterByWindow(model.changes, '7d')
  const topCategories = countCategories(changes24h)

  return {
    snapshotTimestamp: model.snapshotTimestamp,
    snapshotFile: model.snapshotFile,
    trackedAsins: model.currentByAsin.size,
    ourAsins: model.currentItems.filter((item) => item.owner === 'OURS').length,
    competitorAsins: model.currentItems.filter((item) => item.owner === 'COMPETITOR').length,
    changes24h: changes24h.length,
    changes7d: changes7d.length,
    ourChanges24h: changes24h.filter((item) => item.owner === 'OURS').length,
    competitorChanges24h: changes24h.filter((item) => item.owner === 'COMPETITOR').length,
    critical24h: changes24h.filter((item) => item.severity === 'critical').length,
    topCategories24h: topCategories.slice(0, 4),
    topChanges: model.changes.slice(0, 6),
  }
}

export async function getMonitoringChanges(
  filters: MonitoringChangeFilters = {},
): Promise<MonitoringChangeEvent[]> {
  const model = await loadMonitoringModel()
  return applyFilters(model.changes, filters)
}

export async function getMonitoringAsinDetail(asin: string): Promise<MonitoringAsinDetail> {
  const normalizedAsin = asin.trim().toUpperCase()
  const model = await loadMonitoringModel()
  const current = model.currentByAsin.get(normalizedAsin) ?? null
  const snapshots = model.snapshotsByAsin.get(normalizedAsin) ?? []
  const changes = model.changes.filter((item) => item.asin === normalizedAsin)

  return {
    asin: normalizedAsin,
    current,
    latestSnapshotAt: snapshots.at(-1)?.capturedAt ?? null,
    changes,
    snapshots,
  }
}

export async function getMonitoringHealth(): Promise<MonitoringHealthReport> {
  const datasets: MonitoringHealthDataset[] = await Promise.all([
    getDatasetHealth(
      'hourly-state',
      'Hourly latest state',
      'hourly',
      LATEST_STATE_PATH,
      async () => statIso(LATEST_STATE_PATH),
    ),
    getDatasetHealth(
      'hourly-changes',
      'Hourly change history',
      'hourly',
      CHANGE_HISTORY_PATH,
      async () => statIso(CHANGE_HISTORY_PATH),
    ),
    getDatasetHealth(
      'daily-root',
      'Daily monitoring bundle',
      'daily',
      path.join(MONITORING_BASE, 'Daily'),
      async () => findLatestModifiedAt(path.join(MONITORING_BASE, 'Daily'), 3),
    ),
    getDatasetHealth(
      'weekly-root',
      'Weekly monitoring bundle',
      'weekly',
      path.join(MONITORING_BASE, 'Weekly'),
      async () => findLatestModifiedAt(path.join(MONITORING_BASE, 'Weekly'), 4),
    ),
  ])

  return {
    checkedAt: new Date().toISOString(),
    datasets,
  }
}

function applyFilters(
  items: MonitoringChangeEvent[],
  filters: MonitoringChangeFilters,
): MonitoringChangeEvent[] {
  const window = filters.window ?? '7d'
  const owner = filters.owner ?? 'ALL'
  const category = filters.category ?? 'ALL'
  const severity = filters.severity ?? 'ALL'
  const query = filters.query ? filters.query.trim().toLowerCase() : ''

  return filterByWindow(items, window).filter((item) => {
    if (owner !== 'ALL' && item.owner !== owner) return false
    if (category !== 'ALL' && !item.categories.includes(category)) return false
    if (severity !== 'ALL' && item.severity !== severity) return false
    if (query !== '') {
      const haystack = `${item.asin} ${item.headline} ${item.summary} ${item.changedFields.join(' ')}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

function filterByWindow(
  items: MonitoringChangeEvent[],
  window: MonitoringWindow,
): MonitoringChangeEvent[] {
  if (window === 'all') return items

  const now = Date.now()
  const minutes =
    window === '24h'
      ? DAY_IN_MINUTES
      : window === '7d'
        ? 7 * DAY_IN_MINUTES
        : 30 * DAY_IN_MINUTES

  return items.filter((item) => {
    const ageMinutes = (now - new Date(item.timestamp).getTime()) / 60000
    return ageMinutes <= minutes
  })
}

function countCategories(
  items: MonitoringChangeEvent[],
): Array<{ category: MonitoringCategory; count: number }> {
  const counts = new Map<MonitoringCategory, number>()
  for (const item of items) {
    for (const category of item.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count)
}

async function loadMonitoringModel() {
  const latestState = await readLatestState()
  const [changeRows, snapshotRows, trackedAsins] = await Promise.all([
    readChangeHistory(),
    readSnapshotHistory(),
    prisma.trackedAsin.findMany({ select: { asin: true, label: true } }),
  ])

  const labelsByAsin = new Map(trackedAsins.map((item) => [item.asin.trim().toUpperCase(), item.label]))

  const snapshotsByAsin = indexByAsin(snapshotRows)
  const currentItems = Object.entries(latestState.by_asin)
    .map(([asin, raw]) => normalizeStateRecord(asin, raw))
    .sort(compareCurrentRecords)
  const currentByAsin = new Map(currentItems.map((item) => [item.asin, item]))

  const changes = changeRows
    .filter((row) => row.changed === 'yes')
    .map((row, index) =>
      normalizeChangeEvent(
        row,
        snapshotsByAsin.get(row.asin.trim().toUpperCase()) ?? [],
        currentByAsin.get(row.asin.trim().toUpperCase()) ?? null,
        labelsByAsin.get(row.asin.trim().toUpperCase()) ?? null,
        index,
      ),
    )
    .sort(compareEvents)

  return {
    snapshotTimestamp: latestState.timestamp_utc,
    snapshotFile: latestState.snapshot_file,
    currentItems,
    currentByAsin,
    snapshotsByAsin,
    changes,
  }
}

async function readLatestState(): Promise<LatestStateFile> {
  const content = await fs.readFile(LATEST_STATE_PATH, 'utf8')
  const parsed = JSON.parse(content) as LatestStateFile

  if (!parsed.by_asin || !parsed.timestamp_utc || !parsed.snapshot_file) {
    throw new Error('latest_state.json is missing required monitoring fields.')
  }

  return parsed
}

async function readChangeHistory(): Promise<ChangeHistoryRow[]> {
  const content = await fs.readFile(CHANGE_HISTORY_PATH, 'utf8')
  const rows = parseCsvRows(content)

  return rows.map((row) => ({
    snapshot_timestamp_utc: row.snapshot_timestamp_utc,
    asin: row.asin,
    owner_type: row.owner_type,
    baseline_timestamp_utc: row.baseline_timestamp_utc,
    changed: row.changed,
    changed_fields: row.changed_fields,
    changed_field_count: row.changed_field_count,
  }))
}

async function readSnapshotHistory(): Promise<MonitoringSnapshotRecord[]> {
  const content = await fs.readFile(SNAPSHOT_HISTORY_PATH, 'utf8')
  const rows = parseCsvRows(content)

  return rows.map((row) =>
    normalizeSnapshotRecord(row.asin, row, row.snapshot_timestamp_utc),
  )
}

function indexByAsin(
  snapshots: MonitoringSnapshotRecord[],
): Map<string, MonitoringSnapshotRecord[]> {
  const indexed = new Map<string, MonitoringSnapshotRecord[]>()

  for (const snapshot of snapshots) {
    const existing = indexed.get(snapshot.asin)
    if (existing) {
      existing.push(snapshot)
      continue
    }
    indexed.set(snapshot.asin, [snapshot])
  }

  for (const entries of indexed.values()) {
    entries.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
  }

  return indexed
}

function normalizeSnapshotRecord(
  asin: string,
  raw: Record<string, string>,
  capturedAt: string,
): MonitoringSnapshotRecord {
  return {
    ...normalizeStateRecord(asin, raw),
    capturedAt,
  }
}

function normalizeStateRecord(
  asin: string,
  raw: Record<string, unknown>,
): MonitoringStateRecord {
  return {
    asin: asin.trim().toUpperCase(),
    owner: normalizeOwner(raw.owner_type),
    title: readString(raw.title),
    brand: readString(raw.brand),
    status: readString(raw.status),
    sellerSku: readString(raw.seller_sku),
    imageCount: readNumber(raw.image_count),
    imageUrls: readImageUrls(raw),
    landedPrice: readNumber(raw.landed_price),
    listingPrice: readNumber(raw.listing_price),
    shippingPrice: readNumber(raw.shipping_price),
    priceCurrency: readString(raw.price_currency),
    rootBsrRank: readNumber(raw.root_bsr_rank),
    rootBsrCategoryId: readString(raw.root_bsr_category_id),
    subBsrRank: readNumber(raw.sub_bsr_rank),
    subBsrCategoryId: readString(raw.sub_bsr_category_id),
    totalOfferCount: readNumber(raw.total_offer_count),
    bulletCount: readNumber(raw.bullet_count),
    descriptionLength: readNumber(raw.description_length),
    lastUpdatedDate: readString(raw.last_updated_date),
  }
}

function normalizeChangeEvent(
  row: ChangeHistoryRow,
  snapshots: MonitoringSnapshotRecord[],
  currentState: MonitoringStateRecord | null,
  label: string | null,
  index: number,
): MonitoringChangeEvent {
  const asin = row.asin.trim().toUpperCase()
  const changedFields = parseChangedFields(row.changed_fields)
  const categories = classifyCategories(changedFields)
  const currentSnapshot =
    snapshots.find((item) => item.capturedAt === row.snapshot_timestamp_utc) ?? null
  const baselineSnapshot =
    snapshots.find((item) => item.capturedAt === row.baseline_timestamp_utc) ?? null
  const primaryCategory = pickPrimaryCategory({
    categories,
    currentSnapshot,
    baselineSnapshot,
  })
  const severity = classifySeverity({
    owner: normalizeOwner(row.owner_type),
    categories,
    changedFields,
    currentSnapshot,
    baselineSnapshot,
  })

  const owner = normalizeOwner(row.owner_type)
  const displayName = label ?? asin
  const headline = buildHeadline({
    asin: displayName,
    owner,
    primaryCategory,
    currentSnapshot,
    baselineSnapshot,
    changedFields,
  })
  const summary = buildSummary({
    primaryCategory,
    changedFields,
    currentSnapshot,
    baselineSnapshot,
    currentState,
  })

  return {
    id: `${asin}-${row.snapshot_timestamp_utc}-${index}`,
    asin,
    label,
    owner,
    timestamp: row.snapshot_timestamp_utc,
    baselineTimestamp: readString(row.baseline_timestamp_utc),
    severity,
    categories,
    primaryCategory,
    changedFieldCount: Number(row.changed_field_count) || changedFields.length,
    changedFields,
    headline,
    summary,
    currentSnapshot,
    baselineSnapshot,
  }
}

function compareCurrentRecords(left: MonitoringStateRecord, right: MonitoringStateRecord): number {
  if (left.owner !== right.owner) {
    return left.owner === 'OURS' ? -1 : 1
  }
  return left.asin.localeCompare(right.asin)
}

function compareEvents(left: MonitoringChangeEvent, right: MonitoringChangeEvent): number {
  const severityDelta = severityRank(right.severity) - severityRank(left.severity)
  if (severityDelta !== 0) return severityDelta
  return right.timestamp.localeCompare(left.timestamp)
}

function severityRank(severity: MonitoringSeverity): number {
  switch (severity) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
  }
}

function classifyCategories(changedFields: string[]): MonitoringCategory[] {
  const categories = CATEGORY_PRIORITY.filter((category) =>
    changedFields.some((field) => CATEGORY_FIELDS[category].has(field)),
  )

  if (categories.length === 0) {
    return ['catalog']
  }

  return categories
}

function classifySeverity(input: {
  owner: MonitoringOwner
  categories: MonitoringCategory[]
  changedFields: string[]
  currentSnapshot: MonitoringSnapshotRecord | null
  baselineSnapshot: MonitoringSnapshotRecord | null
}): MonitoringSeverity {
  let score = 0

  if (input.owner === 'OURS') score += 2
  if (input.categories.includes('status')) score += 4
  if (input.categories.includes('content')) score += 4
  if (input.categories.includes('images')) score += 3
  if (input.categories.includes('price')) score += 2
  if (input.categories.includes('offers')) score += 2
  if (input.categories.includes('rank')) score += 1
  if (input.changedFields.length >= 4) score += 2

  const currentRank = input.currentSnapshot?.rootBsrRank
  const baselineRank = input.baselineSnapshot?.rootBsrRank
  if (
    input.owner === 'OURS' &&
    currentRank !== null &&
    baselineRank !== null &&
    currentRank !== undefined &&
    baselineRank !== undefined &&
    currentRank - baselineRank > 1000
  ) {
    score += 1
  }

  if (
    input.categories.length === 1 &&
    input.categories[0] === 'rank' &&
    input.owner !== 'OURS'
  ) {
    score -= 1
  }

  if (input.owner !== 'OURS' && score >= 7) return 'high'
  if (score >= 7) return 'critical'
  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

function pickPrimaryCategory(input: {
  categories: MonitoringCategory[]
  currentSnapshot: MonitoringSnapshotRecord | null
  baselineSnapshot: MonitoringSnapshotRecord | null
}): MonitoringCategory {
  const { categories, currentSnapshot, baselineSnapshot } = input

  if (categories.includes('content')) return 'content'
  if (
    categories.includes('images') &&
    valuesDiffer(baselineSnapshot?.imageCount, currentSnapshot?.imageCount)
  ) {
    return 'images'
  }
  if (
    categories.includes('price') &&
    valuesDiffer(baselineSnapshot?.landedPrice, currentSnapshot?.landedPrice)
  ) {
    return 'price'
  }
  if (
    categories.includes('offers') &&
    valuesDiffer(baselineSnapshot?.totalOfferCount, currentSnapshot?.totalOfferCount)
  ) {
    return 'offers'
  }
  if (
    categories.includes('status') &&
    valuesDiffer(baselineSnapshot?.status, currentSnapshot?.status)
  ) {
    return 'status'
  }
  if (
    categories.includes('rank') &&
    valuesDiffer(baselineSnapshot?.rootBsrRank, currentSnapshot?.rootBsrRank)
  ) {
    return 'rank'
  }

  return categories[0]
}

function buildHeadline(input: {
  asin: string
  owner: MonitoringOwner
  primaryCategory: MonitoringCategory
  currentSnapshot: MonitoringSnapshotRecord | null
  baselineSnapshot: MonitoringSnapshotRecord | null
  changedFields: string[]
}): string {
  const ownerLabel =
    input.owner === 'OURS'
      ? 'Our'
      : input.owner === 'COMPETITOR'
        ? 'Competitor'
        : 'Tracked'

  switch (input.primaryCategory) {
    case 'status':
      if (valuesDiffer(input.baselineSnapshot?.status, input.currentSnapshot?.status)) {
        return `${ownerLabel} ${input.asin} availability changed`
      }
      return `${ownerLabel} ${input.asin} operational signal changed`
    case 'content':
      return `${ownerLabel} ${input.asin} content changed`
    case 'images':
      return `${ownerLabel} ${input.asin} gallery changed`
    case 'price':
      return `${ownerLabel} ${input.asin} pricing changed`
    case 'offers':
      return `${ownerLabel} ${input.asin} offer mix changed`
    case 'rank': {
      const current = input.currentSnapshot?.rootBsrRank
      const baseline = input.baselineSnapshot?.rootBsrRank
      if (current !== null && baseline !== null && current !== undefined && baseline !== undefined) {
        if (current < baseline) return `${ownerLabel} ${input.asin} rank improved`
        if (current > baseline) return `${ownerLabel} ${input.asin} rank worsened`
      }
      return `${ownerLabel} ${input.asin} rank moved`
    }
    case 'catalog':
      return `${ownerLabel} ${input.asin} catalog data changed`
  }
}

function buildSummary(input: {
  primaryCategory: MonitoringCategory
  changedFields: string[]
  currentSnapshot: MonitoringSnapshotRecord | null
  baselineSnapshot: MonitoringSnapshotRecord | null
  currentState: MonitoringStateRecord | null
}): string {
  switch (input.primaryCategory) {
    case 'status':
      if (valuesDiffer(input.baselineSnapshot?.status, input.currentSnapshot?.status)) {
        return formatComparison('Status', input.baselineSnapshot?.status, input.currentSnapshot?.status)
      }
      return `Fields changed: ${input.changedFields.slice(0, 4).join(', ')}`
    case 'images':
      return formatComparison(
        'Image count',
        input.baselineSnapshot?.imageCount,
        input.currentSnapshot?.imageCount,
      )
    case 'price':
      return formatCurrencyComparison(
        'Landed price',
        input.baselineSnapshot?.landedPrice,
        input.currentSnapshot?.landedPrice,
        input.currentSnapshot?.priceCurrency ?? input.currentState?.priceCurrency,
      )
    case 'offers':
      return formatComparison(
        'Offer count',
        input.baselineSnapshot?.totalOfferCount,
        input.currentSnapshot?.totalOfferCount,
      )
    case 'rank':
      return formatComparison(
        'Root BSR',
        input.baselineSnapshot?.rootBsrRank,
        input.currentSnapshot?.rootBsrRank,
      )
    case 'content':
      return `Fields changed: ${input.changedFields.slice(0, 4).join(', ')}`
    case 'catalog':
      return `Catalog fields changed: ${input.changedFields.slice(0, 4).join(', ')}`
  }
}

function formatComparison(
  label: string,
  fromValue: string | number | null | undefined,
  toValue: string | number | null | undefined,
): string {
  const fromLabel = formatValue(fromValue)
  const toLabel = formatValue(toValue)
  return `${label}: ${fromLabel} -> ${toLabel}`
}

function formatCurrencyComparison(
  label: string,
  fromValue: number | null | undefined,
  toValue: number | null | undefined,
  currency: string | null | undefined,
): string {
  return `${label}: ${formatCurrency(fromValue, currency)} -> ${formatCurrency(toValue, currency)}`
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'n/a'
  if (typeof value === 'number') return value.toLocaleString()
  return value
}

function formatCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined) return 'n/a'
  if (!currency) return value.toFixed(2)

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

function valuesDiffer(
  baseline: string | number | null | undefined,
  current: string | number | null | undefined,
): boolean {
  return baseline !== current
}

function parseChangedFields(input: string): string[] {
  return input
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '')
}

function normalizeOwner(value: unknown): MonitoringOwner {
  const normalized = readString(value)?.toLowerCase()
  if (normalized === 'our') return 'OURS'
  if (normalized === 'competitor') return 'COMPETITOR'
  return 'UNKNOWN'
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null
    return value
  }

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected numeric monitoring value but received "${trimmed}".`)
  }
  return parsed
}

function readImageUrls(raw: Record<string, unknown>): string[] {
  const ordered = raw.image_urls_ordered
  if (Array.isArray(ordered)) {
    return ordered
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value !== '')
  }

  const text = readString(raw.image_urls)
  if (!text) return []

  return text
    .split('|')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

async function getDatasetHealth(
  id: string,
  label: string,
  cadence: 'hourly' | 'daily' | 'weekly',
  targetPath: string,
  getUpdatedAt: () => Promise<string | null>,
): Promise<MonitoringHealthDataset> {
  const updatedAt = await getUpdatedAt()
  if (!updatedAt) {
    return {
      id,
      label,
      cadence,
      path: targetPath,
      updatedAt: null,
      ageMinutes: null,
      status: 'missing',
    }
  }

  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000))
  const threshold =
    cadence === 'hourly'
      ? 3 * HOUR_IN_MINUTES
      : cadence === 'daily'
        ? 36 * HOUR_IN_MINUTES
        : 10 * DAY_IN_MINUTES

  return {
    id,
    label,
    cadence,
    path: targetPath,
    updatedAt,
    ageMinutes,
    status: ageMinutes > threshold ? 'stale' : 'healthy',
  }
}

async function statIso(targetPath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(targetPath)
    return stats.mtime.toISOString()
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

async function findLatestModifiedAt(
  targetPath: string,
  maxDepth: number,
): Promise<string | null> {
  try {
    const rootStats = await fs.stat(targetPath)
    let latest = rootStats.mtime

    if (!rootStats.isDirectory() || maxDepth <= 0) {
      return latest.toISOString()
    }

    const queue: Array<{ target: string; depth: number }> = [{ target: targetPath, depth: 0 }]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      if (current.depth >= maxDepth) continue

      const entries = await fs.readdir(current.target, { withFileTypes: true })
      for (const entry of entries) {
        const childPath = path.join(current.target, entry.name)
        const childStats = await fs.stat(childPath)
        if (childStats.mtime > latest) latest = childStats.mtime
        if (entry.isDirectory()) {
          queue.push({ target: childPath, depth: current.depth + 1 })
        }
      }
    }

    return latest.toISOString()
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
