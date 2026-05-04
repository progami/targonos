import 'server-only'

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { DEFAULT_ARGUS_MARKET, getArgusMarketConfig, type ArgusMarket } from '@/lib/argus-market'
import prisma from '@/lib/db'
import { parseCsvRows } from './csv'
import { formatMonitoringLabel } from './labels'
import type {
  MonitoringAsinDetail,
  MonitoringBootstrap,
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringFieldChange,
  MonitoringHealthDataset,
  MonitoringHealthReport,
  MonitoringOverview,
  MonitoringOwner,
  MonitoringSchedulerJob,
  MonitoringSeverity,
  MonitoringSnapshotRecord,
  MonitoringStateRecord,
  MonitoringSourceType,
  MonitoringWindow,
} from './types'

const execFileAsync = promisify(execFile)
const HOME_DIR = requireHomeDir()

function requireHomeDir(): string {
  const value = process.env.HOME
  if (!value) {
    throw new Error('Missing HOME environment variable.')
  }
  return value
}

interface MonitoringPaths {
  monitoringBase: string
  dailyBase: string
  weeklyBase: string
  listingAttributesBase: string
  latestStatePath: string
  changeHistoryPath: string
  snapshotHistoryPath: string
  dailyAccountHealthPath: string
  dailyVisualsPath: string
  dailyVocPath: string
  weeklyBrandAnalyticsPath: string
  weeklyBusinessReportsPath: string
  weeklyDatadivePath: string
  weeklySellerboardPath: string
  weeklyCategoryInsightsPath: string
  weeklyPoePath: string
  weeklySponsoredProductsPath: string
  weeklyBrandMetricsPath: string
  weeklyScaleinsightsPath: string
}

function buildMonitoringPaths(market: ArgusMarket): MonitoringPaths {
  const monitoringBase = getArgusMarketConfig(market).monitoringRoot
  const dailyBase = path.join(monitoringBase, 'Daily')
  const weeklyBase = path.join(monitoringBase, 'Weekly')
  const listingAttributesBase = path.join(monitoringBase, 'Hourly/Listing Attributes (API)')
  return {
    monitoringBase,
    dailyBase,
    weeklyBase,
    listingAttributesBase,
    latestStatePath: path.join(listingAttributesBase, 'latest_state.json'),
    changeHistoryPath: path.join(listingAttributesBase, 'Listings-Changes-History.csv'),
    snapshotHistoryPath: path.join(listingAttributesBase, 'Listings-Snapshot-History.csv'),
    dailyAccountHealthPath: path.join(dailyBase, 'Account Health Dashboard (API)', 'account-health.csv'),
    dailyVisualsPath: path.join(dailyBase, 'Visuals (Browser)'),
    dailyVocPath: path.join(dailyBase, 'Voice of the Customer (Manual)'),
    weeklyBrandAnalyticsPath: path.join(weeklyBase, 'Brand Analytics (API)'),
    weeklyBusinessReportsPath: path.join(weeklyBase, 'Business Reports (API)'),
    weeklyDatadivePath: path.join(weeklyBase, 'Datadive (API)'),
    weeklySellerboardPath: path.join(weeklyBase, 'Sellerboard (API)'),
    weeklyCategoryInsightsPath: path.join(weeklyBase, 'Category Insights (Browser)'),
    weeklyPoePath: path.join(weeklyBase, 'Product Opportunity Explorer (Browser)'),
    weeklySponsoredProductsPath: path.join(weeklyBase, 'Ad Console/SP - Sponsored Products (API)'),
    weeklyBrandMetricsPath: path.join(weeklyBase, 'Ad Console/Brand Metrics (Browser)'),
    weeklyScaleinsightsPath: path.join(weeklyBase, 'ScaleInsights/KeywordRanking (Browser)'),
  }
}

const HOUR_IN_MINUTES = 60
const DAY_IN_MINUTES = 24 * HOUR_IN_MINUTES

interface SchedulerSpec {
  id: string
  label: string
  cadence: MonitoringHealthDataset['cadence']
  sourceType: Exclude<MonitoringSourceType, 'MANUAL'>
  schedule: string
  launchdLabel: string
  plistPath: string
  runLogPath: string
  outputs: string[]
}

function schedulerLaunchdLabel(market: ArgusMarket, baseLabel: string): string {
  if (market === 'us') {
    return baseLabel
  }

  return `${baseLabel}.${market}`
}

function buildArgusSchedulerSpecs(market: ArgusMarket, paths: MonitoringPaths): SchedulerSpec[] {
  return [
  {
    id: 'tracking-fetch',
    label: 'Tracking fetch',
    cadence: 'hourly',
    sourceType: 'API',
    schedule: 'Every hour',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.argus.tracking-fetch'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.argus.tracking-fetch')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/tracking-fetch/run-log.jsonl'),
    outputs: ['Argus tracking snapshots (DB)'],
  },
  {
    id: 'hourly-listing-attributes-api',
    label: 'Hourly listing attributes',
    cadence: 'hourly',
    sourceType: 'API',
    schedule: 'Every hour',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.hourly-listing-attributes-api'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.hourly-listing-attributes-api')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/hourly-listing-attributes-api/run-log.jsonl'),
    outputs: ['Hourly latest state', 'Snapshot history', 'Change Feed -> Email'],
  },
  {
    id: 'daily-account-health',
    label: 'Daily account health',
    cadence: 'daily',
    sourceType: 'API',
    schedule: 'Daily at 3:00 AM',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.daily-account-health'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.daily-account-health')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/daily-account-health/run-log.jsonl'),
    outputs: ['Account Health Dashboard (API)'],
  },
  {
    id: 'weekly-api-sources',
    label: 'Weekly API sources',
    cadence: 'weekly',
    sourceType: 'API',
    schedule: 'Monday at 4:00 AM',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.weekly-api-sources'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.weekly-api-sources')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/weekly-api-sources/run-log.jsonl'),
    outputs: [
      'Brand Analytics (API)',
      'Business Reports (API)',
      'Datadive (API)',
      'Sellerboard (API)',
      'SP - Sponsored Products (API)',
    ],
  },
  {
    id: 'daily-visuals',
    label: 'Daily visuals',
    cadence: 'daily',
    sourceType: 'BROWSER',
    schedule: 'Daily at 3:30 AM',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.daily-visuals'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.daily-visuals')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/daily-visuals/run-log.jsonl'),
    outputs: ['Visuals (Browser)'],
  },
  {
    id: 'weekly-browser-sources',
    label: 'Weekly browser sources',
    cadence: 'weekly',
    sourceType: 'BROWSER',
    schedule: 'Monday at 3:00 AM',
    launchdLabel: schedulerLaunchdLabel(market, 'com.targon.weekly-browser-sources'),
    plistPath: path.join(HOME_DIR, `Library/LaunchAgents/${schedulerLaunchdLabel(market, 'com.targon.weekly-browser-sources')}.plist`),
    runLogPath: path.join(paths.monitoringBase, 'Logs/weekly-browser-sources/run-log.jsonl'),
    outputs: [
      'Category Insights (Browser)',
      'Product Opportunity Explorer (Browser)',
      'KeywordRanking (Browser)',
      'Brand Metrics (Browser)',
    ],
  },
  ]
}

interface DatasetHealthSpec {
  id: string
  label: string
  cadence: MonitoringHealthDataset['cadence']
  sourceType: MonitoringSourceType
  path: string
  driveId: string | null
  purpose: string
  producedBy: string | null
  consumers: string[]
  getUpdatedAt: () => Promise<string | null>
}

function buildDatasetSpecs(paths: MonitoringPaths): DatasetHealthSpec[] {
  return [
  {
    id: 'hourly-state',
    label: 'Hourly latest state',
    cadence: 'hourly',
    sourceType: 'API',
    path: paths.latestStatePath,
    driveId: '1bp8zLczIxTqQDFACdlDg6hdZvCB9innQ',
    purpose: 'Latest listing baseline used to compute the next hourly diff run.',
    producedBy: 'Hourly listing attributes',
    consumers: ['Change detection'],
    getUpdatedAt: async () => statIso(paths.latestStatePath),
  },
  {
    id: 'hourly-snapshots',
    label: 'Snapshot history',
    cadence: 'hourly',
    sourceType: 'API',
    path: paths.snapshotHistoryPath,
    driveId: '1bp8zLczIxTqQDFACdlDg6hdZvCB9innQ',
    purpose: 'Historical snapshot archive behind per-ASIN timelines and comparisons.',
    producedBy: 'Hourly listing attributes',
    consumers: ['ASIN detail timelines', 'Baseline reconstruction'],
    getUpdatedAt: async () => statIso(paths.snapshotHistoryPath),
  },
  {
    id: 'hourly-changes',
    label: 'Change Feed -> Email',
    cadence: 'hourly',
    sourceType: 'API',
    path: paths.changeHistoryPath,
    driveId: '1bp8zLczIxTqQDFACdlDg6hdZvCB9innQ',
    purpose: 'Canonical event stream consumed by the Change Feed and alert email digest.',
    producedBy: 'Hourly listing attributes',
    consumers: ['Change Feed', 'Alert email'],
    getUpdatedAt: async () => statIso(paths.changeHistoryPath),
  },
  {
    id: 'daily-account-health',
    label: 'Account Health Dashboard (API)',
    cadence: 'daily',
    sourceType: 'API',
    path: paths.dailyAccountHealthPath,
    driveId: '10BC2vI2OqAoYegD1icqU_VvYaiA9Imxc',
    purpose: 'Daily account health report export.',
    producedBy: 'Daily account health',
    consumers: ['Source Health'],
    getUpdatedAt: async () => statIso(paths.dailyAccountHealthPath),
  },
  {
    id: 'daily-visuals',
    label: 'Visuals (Browser)',
    cadence: 'daily',
    sourceType: 'BROWSER',
    path: paths.dailyVisualsPath,
    driveId: '1z8u466gU3r1Q4_UPy3Dg_dzdI1Lj4ntN',
    purpose: 'Daily browser screenshots for monitored ASINs.',
    producedBy: 'Daily visuals',
    consumers: ['Daily monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.dailyVisualsPath, 4),
  },
  {
    id: 'daily-voc',
    label: 'Voice of the Customer (Manual)',
    cadence: 'daily',
    sourceType: 'MANUAL',
    path: paths.dailyVocPath,
    driveId: '1iHqtjKY01veKSWNj8zZF76UMcyrDdXZe',
    purpose: 'Manual VOC files that support daily review.',
    producedBy: null,
    consumers: ['Daily monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.dailyVocPath, 2),
  },
  {
    id: 'weekly-brand-analytics',
    label: 'Brand Analytics (API)',
    cadence: 'weekly',
    sourceType: 'API',
    path: paths.weeklyBrandAnalyticsPath,
    driveId: '1OQ1_pvWGLzdIKBfwZmRSWYDEVoP9dHUi',
    purpose: 'Weekly Amazon Brand Analytics exports.',
    producedBy: 'Weekly API sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyBrandAnalyticsPath, 3),
  },
  {
    id: 'weekly-business-reports',
    label: 'Business Reports (API)',
    cadence: 'weekly',
    sourceType: 'API',
    path: paths.weeklyBusinessReportsPath,
    driveId: '1jVUnicQEiNqTW3rEl-8hr79BZ_YjVG2j',
    purpose: 'Weekly Amazon business reports exports.',
    producedBy: 'Weekly API sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyBusinessReportsPath, 3),
  },
  {
    id: 'weekly-datadive',
    label: 'Datadive (API)',
    cadence: 'weekly',
    sourceType: 'API',
    path: paths.weeklyDatadivePath,
    driveId: '1ZFiwse0eukOHJUPgokvHWRcWMri0klvY',
    purpose: 'Weekly Datadive keyword, competitor, and rank radar exports.',
    producedBy: 'Weekly API sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyDatadivePath, 3),
  },
  {
    id: 'weekly-sellerboard',
    label: 'Sellerboard (API)',
    cadence: 'weekly',
    sourceType: 'API',
    path: paths.weeklySellerboardPath,
    driveId: '1lhg3lHwprusOZiOYV0oM5Ce5wqlBoH8w',
    purpose: 'Weekly Sellerboard dashboard and order exports.',
    producedBy: 'Weekly API sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklySellerboardPath, 3),
  },
  {
    id: 'weekly-sponsored-products',
    label: 'SP - Sponsored Products (API)',
    cadence: 'weekly',
    sourceType: 'API',
    path: paths.weeklySponsoredProductsPath,
    driveId: '1pXOzQwXPcTYvw-feJhZB4muO0PD0tl9S',
    purpose: 'Weekly Sponsored Products console exports and manifest.',
    producedBy: 'Weekly API sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklySponsoredProductsPath, 3),
  },
  {
    id: 'weekly-category-insights',
    label: 'Category Insights (Browser)',
    cadence: 'weekly',
    sourceType: 'BROWSER',
    path: paths.weeklyCategoryInsightsPath,
    driveId: '14SWSVb9w7e9m_Pd0U8eyKQZAsSVmFctI',
    purpose: 'Weekly browser capture of category insights.',
    producedBy: 'Weekly browser sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyCategoryInsightsPath, 2),
  },
  {
    id: 'weekly-poe',
    label: 'Product Opportunity Explorer (Browser)',
    cadence: 'weekly',
    sourceType: 'BROWSER',
    path: paths.weeklyPoePath,
    driveId: '1EB67PbUwcxFHJHigwwtCsfj0pAVWOWqo',
    purpose: 'Weekly browser export from Product Opportunity Explorer.',
    producedBy: 'Weekly browser sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyPoePath, 2),
  },
  {
    id: 'weekly-scaleinsights',
    label: 'KeywordRanking (Browser)',
    cadence: 'weekly',
    sourceType: 'BROWSER',
    path: paths.weeklyScaleinsightsPath,
    driveId: '1TzCiN-ja4inCCK_s_-9wOgH0S0D5hq_Q',
    purpose: 'Weekly ScaleInsights keyword ranking workbook.',
    producedBy: 'Weekly browser sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyScaleinsightsPath, 3),
  },
  {
    id: 'weekly-brand-metrics',
    label: 'Brand Metrics (Browser)',
    cadence: 'weekly',
    sourceType: 'BROWSER',
    path: paths.weeklyBrandMetricsPath,
    driveId: '1B-ohB3dGZU8c4gswpwRoYt034J_T8aqA',
    purpose: 'Weekly browser capture of Brand Metrics.',
    producedBy: 'Weekly browser sources',
    consumers: ['Weekly monitoring review'],
    getUpdatedAt: async () => findLatestModifiedAt(paths.weeklyBrandMetricsPath, 3),
  },
  ]
}

interface LaunchAgentPlist {
  Label: string
  ProgramArguments?: string[]
  StandardOutPath?: string
  StandardErrorPath?: string
  WorkingDirectory?: string
}

interface MonitoringRunLogEntry {
  timestamp: string
  status: 'ok' | 'failed'
}

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

const HERO_BSR_ASINS = getHeroBsrAsins()
const HERO_BSR_CHANGE_FIELDS = new Set([
  'root_bsr_rank',
  'root_bsr_category_id',
  'sub_bsr_rank',
  'sub_bsr_category_id',
])

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
  event_label?: string
  event_severity?: string
  event_primary_category?: string
  event_categories?: string
  event_field_changes?: string
  event_headline?: string
  event_summary?: string
}

export interface MonitoringChangeFilters {
  market?: ArgusMarket
  window?: MonitoringWindow
  owner?: MonitoringOwner | 'ALL'
  category?: MonitoringCategory | 'ALL'
  severity?: MonitoringSeverity | 'ALL'
  snapshotTimestamp?: string
  query?: string
}

interface MonitoringModel {
  snapshotTimestamp: string
  snapshotFile: string
  currentItems: MonitoringStateRecord[]
  currentByAsin: Map<string, MonitoringStateRecord>
  snapshotsByAsin: Map<string, MonitoringSnapshotRecord[]>
  changes: MonitoringChangeEvent[]
}

type CacheState = {
  key: string
  model: MonitoringModel
}

const cacheStateByMarket = new Map<ArgusMarket, CacheState>()
const pendingModelByMarket = new Map<ArgusMarket, { key: string; promise: Promise<MonitoringModel> }>()

export async function getMonitoringOverview(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<MonitoringOverview> {
  const model = await loadMonitoringModel(market)
  return buildMonitoringOverview(model)
}

export async function getMonitoringChanges(
  filters: MonitoringChangeFilters = {},
): Promise<MonitoringChangeEvent[]> {
  const market = filters.market ?? DEFAULT_ARGUS_MARKET
  const model = await loadMonitoringModel(market)
  return applyFilters(model.changes, filters)
}

export async function getMonitoringBootstrap(
  filters: MonitoringChangeFilters = {},
): Promise<MonitoringBootstrap> {
  const market = filters.market ?? DEFAULT_ARGUS_MARKET
  const model = await loadMonitoringModel(market)

  return {
    overview: buildMonitoringOverview(model),
    changes: applyFilters(model.changes, filters),
  }
}

export async function getMonitoringAsinDetail(
  asin: string,
  market: ArgusMarket = DEFAULT_ARGUS_MARKET,
): Promise<MonitoringAsinDetail> {
  const normalizedAsin = asin.trim().toUpperCase()
  const model = await loadMonitoringModel(market)
  const current = model.currentByAsin.get(normalizedAsin) ?? null
  const snapshots = model.snapshotsByAsin.get(normalizedAsin) ?? []
  const changes = model.changes.filter((item) => item.asin === normalizedAsin)

  const trackedAsin = await prisma.trackedAsin.findFirst({
    where: { asin: normalizedAsin },
    select: { label: true },
  })

  return {
    asin: normalizedAsin,
    label: trackedAsin?.label ?? null,
    current,
    latestSnapshotAt: snapshots.at(-1)?.capturedAt ?? null,
    changes,
    snapshots,
  }
}

export async function getMonitoringHealth(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<MonitoringHealthReport> {
  const paths = buildMonitoringPaths(market)
  const datasetSpecs = buildDatasetSpecs(paths)
  const schedulerSpecs = buildArgusSchedulerSpecs(market, paths)
  const [datasets, jobs] = await Promise.all([
    Promise.all(datasetSpecs.map((spec) => getDatasetHealth(spec))),
    Promise.all(schedulerSpecs.map((spec) => getSchedulerHealth(spec))),
  ])

  return {
    checkedAt: new Date().toISOString(),
    datasets,
    jobs,
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
  const snapshotTimestamp = filters.snapshotTimestamp?.trim() ?? ''
  const query = filters.query ? filters.query.trim().toLowerCase() : ''

  const scopedItems = snapshotTimestamp !== '' ? items : filterByWindow(items, window)

  return scopedItems.filter((item) => {
    if (snapshotTimestamp !== '' && item.timestamp !== snapshotTimestamp) return false
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

function buildMonitoringOverview(model: MonitoringModel): MonitoringOverview {
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

async function loadMonitoringModel(market: ArgusMarket): Promise<MonitoringModel> {
  const paths = buildMonitoringPaths(market)
  const cacheKey = await getMonitoringCacheKey(market, paths)
  const cacheState = cacheStateByMarket.get(market)

  if (cacheState !== undefined && cacheState.key === cacheKey) {
    return cacheState.model
  }

  const pending = pendingModelByMarket.get(market)
  if (pending !== undefined && pending.key === cacheKey) {
    return pending.promise
  }

  const modelPromise = buildMonitoringModel(paths)
  pendingModelByMarket.set(market, { key: cacheKey, promise: modelPromise })

  try {
    const model = await modelPromise
    const latestPending = pendingModelByMarket.get(market)
    if (latestPending !== undefined && latestPending.key === cacheKey && latestPending.promise === modelPromise) {
      cacheStateByMarket.set(market, { key: cacheKey, model })
    }
    return model
  } finally {
    const latestPending = pendingModelByMarket.get(market)
    if (latestPending !== undefined && latestPending.promise === modelPromise) {
      pendingModelByMarket.delete(market)
    }
  }
}

async function getMonitoringCacheKey(market: ArgusMarket, paths: MonitoringPaths): Promise<string> {
  const [latestStateStats, changeHistoryStats, snapshotHistoryStats, trackedAsinCount, latestTrackedAsin] =
    await Promise.all([
      fs.stat(paths.latestStatePath),
      fs.stat(paths.changeHistoryPath),
      fs.stat(paths.snapshotHistoryPath),
      prisma.trackedAsin.count(),
      prisma.trackedAsin.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

  return [
    market,
    latestStateStats.mtimeMs.toString(),
    changeHistoryStats.mtimeMs.toString(),
    snapshotHistoryStats.mtimeMs.toString(),
    trackedAsinCount.toString(),
    latestTrackedAsin?.updatedAt.toISOString() ?? '',
  ].join(':')
}

async function buildMonitoringModel(paths: MonitoringPaths): Promise<MonitoringModel> {
  const latestState = await readLatestState(paths)
  const [changeRows, snapshotRows, trackedAsins] = await Promise.all([
    readChangeHistory(paths),
    readSnapshotHistory(paths),
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
    .filter((item): item is MonitoringChangeEvent => item !== null)
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

async function readLatestState(paths: MonitoringPaths): Promise<LatestStateFile> {
  const content = await fs.readFile(paths.latestStatePath, 'utf8')
  const parsed = JSON.parse(content) as LatestStateFile

  if (!parsed.by_asin || !parsed.timestamp_utc || !parsed.snapshot_file) {
    throw new Error('latest_state.json is missing required monitoring fields.')
  }

  return parsed
}

async function readChangeHistory(paths: MonitoringPaths): Promise<ChangeHistoryRow[]> {
  const content = await fs.readFile(paths.changeHistoryPath, 'utf8')
  const rows = parseCsvRows(content)

  return rows.map((row) => ({
    snapshot_timestamp_utc: row.snapshot_timestamp_utc,
    asin: row.asin,
    owner_type: row.owner_type,
    baseline_timestamp_utc: row.baseline_timestamp_utc,
    changed: row.changed,
    changed_fields: row.changed_fields,
    changed_field_count: row.changed_field_count,
    event_label: row.event_label,
    event_severity: row.event_severity,
    event_primary_category: row.event_primary_category,
    event_categories: row.event_categories,
    event_field_changes: row.event_field_changes,
    event_headline: row.event_headline,
    event_summary: row.event_summary,
  }))
}

async function readSnapshotHistory(paths: MonitoringPaths): Promise<MonitoringSnapshotRecord[]> {
  const content = await fs.readFile(paths.snapshotHistoryPath, 'utf8')
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
    size: readString(raw.size),
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
): MonitoringChangeEvent | null {
  const asin = row.asin.trim().toUpperCase()
  const rawChangedFields = parseChangedFields(row.changed_fields)
  const currentSnapshot =
    snapshots.find((item) => item.capturedAt === row.snapshot_timestamp_utc) ?? null
  const baselineSnapshot =
    snapshots.find((item) => item.capturedAt === row.baseline_timestamp_utc) ?? null

  const owner = normalizeOwner(row.owner_type)
  const rawFieldChanges = parseStoredFieldChanges(row.event_field_changes) ?? []
  const {
    changedFields,
    fieldChanges,
    didFilterBsrChanges,
  } = filterVisibleBsrChanges(asin, rawChangedFields, rawFieldChanges)
  if (changedFields.length === 0) {
    return null
  }

  const categories = didFilterBsrChanges
    ? classifyCategories(changedFields)
    : parseStoredCategories(row.event_categories) ?? classifyCategories(changedFields)
  const primaryCategory =
    didFilterBsrChanges
      ? pickPrimaryCategory({
          categories,
          currentSnapshot,
          baselineSnapshot,
        })
      : parseStoredCategory(row.event_primary_category) ??
        pickPrimaryCategory({
          categories,
          currentSnapshot,
          baselineSnapshot,
        })
  const severity =
    didFilterBsrChanges
      ? classifySeverity({
          owner,
          categories,
          changedFields,
          currentSnapshot,
          baselineSnapshot,
        })
      : parseStoredSeverity(row.event_severity) ??
        classifySeverity({
          owner,
          categories,
          changedFields,
          currentSnapshot,
          baselineSnapshot,
        })
  const displaySource =
    currentSnapshot !== null
      ? currentSnapshot
      : baselineSnapshot !== null
        ? baselineSnapshot
        : { asin }
  const displayName = label !== null ? label : formatMonitoringLabel(displaySource)
  const headline = buildHeadline({
    asin: displayName,
    owner,
    primaryCategory,
    currentSnapshot,
    baselineSnapshot,
    changedFields,
  })
  const summary =
    didFilterBsrChanges
      ? buildSummary({
          primaryCategory,
          changedFields,
          currentSnapshot,
          baselineSnapshot,
          currentState,
        })
      : readString(row.event_summary) ??
        buildSummary({
          primaryCategory,
          changedFields,
          currentSnapshot,
          baselineSnapshot,
          currentState,
        })

  return {
    id: `${asin}-${row.snapshot_timestamp_utc}-${index}`,
    asin,
    label: displayName,
    owner,
    timestamp: row.snapshot_timestamp_utc,
    baselineTimestamp: readString(row.baseline_timestamp_utc),
    severity,
    categories,
    primaryCategory,
    changedFieldCount: changedFields.length,
    changedFields,
    fieldChanges,
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
  const timestampDelta = right.timestamp.localeCompare(left.timestamp)
  if (timestampDelta !== 0) return timestampDelta

  return severityRank(right.severity) - severityRank(left.severity)
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
  const name = formatMonitoringLabel(
    input.currentSnapshot ?? input.baselineSnapshot ?? { asin: input.asin },
  )

  switch (input.primaryCategory) {
    case 'status':
      if (valuesDiffer(input.baselineSnapshot?.status, input.currentSnapshot?.status)) {
        return `${name} availability changed`
      }
      return `${name} operational signal changed`
    case 'content':
      return `${name} content changed`
    case 'images':
      return `${name} gallery changed`
    case 'price':
      return `${name} pricing changed`
    case 'offers':
      return `${name} offer mix changed`
    case 'rank': {
      const current = input.currentSnapshot?.rootBsrRank
      const baseline = input.baselineSnapshot?.rootBsrRank
      if (current !== null && baseline !== null && current !== undefined && baseline !== undefined) {
        if (current < baseline) return `${name} rank improved`
        if (current > baseline) return `${name} rank worsened`
      }
      return `${name} rank moved`
    }
    case 'catalog':
      return `${name} catalog data changed`
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

function filterVisibleBsrChanges(
  asin: string,
  changedFields: string[],
  fieldChanges: MonitoringFieldChange[],
): {
  changedFields: string[]
  fieldChanges: MonitoringFieldChange[]
  didFilterBsrChanges: boolean
} {
  if (HERO_BSR_ASINS.has(asin)) {
    return {
      changedFields: [...changedFields],
      fieldChanges: [...fieldChanges],
      didFilterBsrChanges: false,
    }
  }

  const filteredChangedFields = changedFields.filter((field) => !HERO_BSR_CHANGE_FIELDS.has(field))
  const filteredFieldChanges = fieldChanges.filter((change) => !HERO_BSR_CHANGE_FIELDS.has(change.field))

  return {
    changedFields: filteredChangedFields,
    fieldChanges: filteredFieldChanges,
    didFilterBsrChanges: filteredChangedFields.length !== changedFields.length,
  }
}

function parseChangedFields(input: string): string[] {
  return input
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field !== '')
}

function parseStoredCategories(input: string | undefined): MonitoringCategory[] | null {
  const categories = String(input ?? '')
    .split('|')
    .map((value) => value.trim())
    .filter((value): value is MonitoringCategory => CATEGORY_PRIORITY.includes(value as MonitoringCategory))

  return categories.length > 0 ? categories : null
}

function parseStoredCategory(input: string | undefined): MonitoringCategory | null {
  const value = String(input ?? '').trim()
  return CATEGORY_PRIORITY.includes(value as MonitoringCategory) ? (value as MonitoringCategory) : null
}

function parseStoredSeverity(input: string | undefined): MonitoringSeverity | null {
  const value = String(input ?? '').trim()
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
    ? value
    : null
}

function parseStoredFieldChanges(input: string | undefined): MonitoringFieldChange[] | null {
  const value = String(input ?? '').trim()
  if (value === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(
      `Failed to parse monitoring field changes JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Monitoring field changes must deserialize to an array.')
  }

  return parsed.map((entry, index) => normalizeStoredFieldChange(entry, index))
}

function normalizeStoredFieldChange(entry: unknown, index: number): MonitoringFieldChange {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Monitoring field change ${index + 1} must be an object.`)
  }

  const field = readString((entry as { field?: unknown }).field)
  if (!field) {
    throw new Error(`Monitoring field change ${index + 1} is missing a field name.`)
  }

  if (field === 'image_urls') {
    return {
      field,
      added: readStoredStringArray((entry as { added?: unknown }).added),
      removed: readStoredStringArray((entry as { removed?: unknown }).removed),
    }
  }

  return {
    field,
    from: readStoredFieldValue((entry as { from?: unknown }).from),
    to: readStoredFieldValue((entry as { to?: unknown }).to),
  }
}

function readStoredFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  throw new Error(`Unsupported monitoring field change value: ${JSON.stringify(value)}`)
}

function readStoredStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Monitoring image field changes must include string arrays.')
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`Monitoring image field change value ${index + 1} must be a string.`)
    }

    return entry
  })
}

function getHeroBsrAsins(): Set<string> {
  const configuredHeroAsins = parseAsinList(process.env.ARGUS_HERO_BSR_ASINS)
  if (configuredHeroAsins.length > 0) {
    return new Set(configuredHeroAsins)
  }

  const configuredLegacyAsins = parseAsinList(process.env.ARGUS_MAIN_BSR_EMAIL_ASINS)
  if (configuredLegacyAsins.length > 0) {
    return new Set(configuredLegacyAsins)
  }

  return new Set(['B09HXC3NL8', 'B0DQDWV1SV', 'B0CWS3848Y'])
}

function parseAsinList(value: string | undefined): string[] {
  if (typeof value !== 'string') return []

  return value
    .split(/[\s,|]+/)
    .map((asin) => asin.trim().toUpperCase())
    .filter((asin) => asin !== '')
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

async function getDatasetHealth(spec: DatasetHealthSpec): Promise<MonitoringHealthDataset> {
  const driveUrl = spec.driveId ? `https://drive.google.com/drive/folders/${spec.driveId}` : null
  const updatedAt = await spec.getUpdatedAt()
  if (!updatedAt) {
    return {
      id: spec.id,
      label: spec.label,
      cadence: spec.cadence,
      sourceType: spec.sourceType,
      path: spec.path,
      driveUrl,
      purpose: spec.purpose,
      producedBy: spec.producedBy,
      consumers: spec.consumers,
      updatedAt: null,
      ageMinutes: null,
      status: 'missing',
    }
  }

  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000))
  const threshold =
    spec.cadence === 'hourly'
      ? 3 * HOUR_IN_MINUTES
      : spec.cadence === 'daily'
        ? 36 * HOUR_IN_MINUTES
        : 10 * DAY_IN_MINUTES

  return {
    id: spec.id,
    label: spec.label,
    cadence: spec.cadence,
    sourceType: spec.sourceType,
    path: spec.path,
    driveUrl,
    purpose: spec.purpose,
    producedBy: spec.producedBy,
    consumers: spec.consumers,
    updatedAt,
    ageMinutes,
    status: ageMinutes > threshold ? 'stale' : 'healthy',
  }
}

async function getSchedulerHealth(spec: SchedulerSpec): Promise<MonitoringSchedulerJob> {
  const plist = await readLaunchAgentPlist(spec.plistPath)
  const target = resolveLaunchAgentTarget(plist)
  const stdoutPath = plist?.StandardOutPath ?? null
  const stderrPath = plist?.StandardErrorPath ?? null
  const latestRun = await readLatestRunLogEntry(spec.runLogPath)
  const lastLaunchAt = await readLatestTimestamp(stdoutPath, stderrPath)

  if (!plist) {
    return {
      id: spec.id,
      label: spec.label,
      cadence: spec.cadence,
      sourceType: spec.sourceType,
      schedule: spec.schedule,
      launchdLabel: spec.launchdLabel,
      plistPath: spec.plistPath,
      target,
      stdoutPath,
      stderrPath,
      outputs: [...spec.outputs],
      lastExitStatus: null,
      pid: null,
      latestRunStatus: latestRun?.status ?? null,
      latestRunAt: latestRun?.timestamp ?? null,
      status: 'missing',
    }
  }

  const launchdState = await readLaunchdState(spec.launchdLabel)
  if (!launchdState) {
    return {
      id: spec.id,
      label: spec.label,
      cadence: spec.cadence,
      sourceType: spec.sourceType,
      schedule: spec.schedule,
      launchdLabel: spec.launchdLabel,
      plistPath: spec.plistPath,
      target,
      stdoutPath,
      stderrPath,
      outputs: [...spec.outputs],
      lastExitStatus: null,
      pid: null,
      latestRunStatus: latestRun?.status ?? null,
      latestRunAt: latestRun?.timestamp ?? null,
      status: 'missing',
    }
  }

  const status =
    launchdState.pid !== null
      ? 'running'
      : latestRun?.status === 'ok' && launchdState.lastExitStatus !== 0
        ? isIsoAfter(latestRun.timestamp, lastLaunchAt)
          ? 'healthy'
          : 'failed'
        : latestRun?.status === 'ok'
        ? 'healthy'
        : latestRun?.status === 'failed'
          ? 'failed'
          : launchdState.lastExitStatus === 0
            ? 'healthy'
            : 'failed'

  return {
    id: spec.id,
    label: spec.label,
    cadence: spec.cadence,
    sourceType: spec.sourceType,
    schedule: spec.schedule,
    launchdLabel: spec.launchdLabel,
    plistPath: spec.plistPath,
    target,
    stdoutPath,
    stderrPath,
    outputs: [...spec.outputs],
    lastExitStatus: launchdState.lastExitStatus,
    pid: launchdState.pid,
    latestRunStatus: latestRun?.status ?? null,
    latestRunAt: latestRun?.timestamp ?? null,
    status,
  }
}

async function readLaunchAgentPlist(plistPath: string): Promise<LaunchAgentPlist | null> {
  try {
    await fs.access(plistPath)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }

  const { stdout } = await execFileAsync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath])
  return JSON.parse(stdout) as LaunchAgentPlist
}

async function readLaunchdState(
  launchdLabel: string,
): Promise<{ lastExitStatus: number | null; pid: number | null } | null> {
  try {
    const { stdout } = await execFileAsync('/bin/launchctl', ['list', launchdLabel])
    return {
      lastExitStatus: readLaunchctlNumber(stdout, 'LastExitStatus'),
      pid: readLaunchctlNumber(stdout, 'PID'),
    }
  } catch (error) {
    if (isLaunchctlMissing(error)) return null
    throw error
  }
}

function resolveLaunchAgentTarget(plist: LaunchAgentPlist | null): string | null {
  if (!plist?.ProgramArguments?.length) return null

  const rawTarget = plist.ProgramArguments[1] ?? plist.ProgramArguments[0]
  if (rawTarget.startsWith('/')) return rawTarget
  if (!plist.WorkingDirectory) return rawTarget
  return path.join(plist.WorkingDirectory, rawTarget)
}

function readLaunchctlNumber(output: string, key: string): number | null {
  const match = output.match(new RegExp(`"${key}" = (-?\\d+);`))
  if (!match) return null
  return Number(match[1])
}

async function readLatestRunLogEntry(runLogPath: string | null | undefined): Promise<MonitoringRunLogEntry | null> {
  if (!runLogPath) return null

  try {
    const content = await fs.readFile(runLogPath, 'utf8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .reverse()

    for (const line of lines) {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }

      const timestamp = readString((parsed as { timestamp?: unknown }).timestamp)
      const status = readString((parsed as { status?: unknown }).status)
      if (!timestamp) continue
      if (status !== 'ok' && status !== 'failed') continue

      return { timestamp, status }
    }

    return null
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

async function readLatestTimestamp(...paths: Array<string | null | undefined>): Promise<string | null> {
  let latest: Date | null = null

  for (const candidate of paths) {
    if (!candidate) continue

    try {
      const stats = await fs.stat(candidate)
      if (!latest || stats.mtime > latest) {
        latest = stats.mtime
      }
    } catch (error) {
      if (isMissing(error)) continue
      throw error
    }
  }

  return latest ? latest.toISOString() : null
}

function isIsoAfter(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false

  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false

  return leftTime > rightTime
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

function isLaunchctlMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 113
  )
}
