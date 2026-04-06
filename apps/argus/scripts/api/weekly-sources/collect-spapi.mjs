#!/usr/bin/env node

import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  REPO_ROOT,
  MONITORING_BASE,
  ensureDir,
  flattenRows,
  latestCompleteWeek,
  loadMonitoringEnv,
  orderHeaders,
  requireEnv,
  weekContextForRange,
  writeCsv,
} from './lib/common.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HERO_ASIN = 'B09HXC3NL8'
const COMPETITOR_ASIN = 'B0DQDWV1SV'
const TST_TARGET_ASINS = [HERO_ASIN, COMPETITOR_ASIN]
const TST_REPORT_TYPE = 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT'
const TALOS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/talos/package.json')
const ACTIVE_REPORT_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS'])
const DONE_REPORT_STATUSES = new Set(['DONE'])
const REPORT_WAIT_TIMEOUT_MS = 120 * 60 * 1000

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const SPAPI_MANIFEST_DIR = path.join(MONITORING_BASE, 'Logs', 'weekly-api-sources', 'metadata')
const BA_BASE = path.join(WEEKLY_ROOT, 'Brand Analytics (API)')
const BR_BASE = path.join(WEEKLY_ROOT, 'Business Reports (API)')

const SCP_DIR = path.join(BA_BASE, 'SCP - Search Catalog Performance (API)')
const SQP_DIR = path.join(BA_BASE, 'SQP - Search Query Performance (API)')
const TST_DIR = path.join(BA_BASE, 'TST - Top Search Terms (API)')
const SALES_DIR = path.join(BR_BASE, 'Sales & Traffic (API)')

const SCP_HEADERS = [
  'startDate',
  'endDate',
  'asin',
  'impressionData.impressionCount',
  'impressionData.impressionMedianPrice.amount',
  'impressionData.impressionMedianPrice.currencyCode',
  'impressionData.sameDayShippingImpressionCount',
  'impressionData.oneDayShippingImpressionCount',
  'impressionData.twoDayShippingImpressionCount',
  'clickData.clickCount',
  'clickData.clickRate',
  'clickData.clickedMedianPrice.amount',
  'clickData.clickedMedianPrice.currencyCode',
  'clickData.sameDayShippingClickCount',
  'clickData.oneDayShippingClickCount',
  'clickData.twoDayShippingClickCount',
  'cartAddData.cartAddCount',
  'cartAddData.cartAddedMedianPrice.amount',
  'cartAddData.cartAddedMedianPrice.currencyCode',
  'cartAddData.sameDayShippingCartAddCount',
  'cartAddData.oneDayShippingCartAddCount',
  'cartAddData.twoDayShippingCartAddCount',
  'purchaseData.purchaseCount',
  'purchaseData.searchTrafficSales.amount',
  'purchaseData.searchTrafficSales.currencyCode',
  'purchaseData.conversionRate',
  'purchaseData.purchaseMedianPrice.amount',
  'purchaseData.purchaseMedianPrice.currencyCode',
  'purchaseData.sameDayShippingPurchaseCount',
  'purchaseData.oneDayShippingPurchaseCount',
  'purchaseData.twoDayShippingPurchaseCount',
]

const SQP_HEADERS = [
  'startDate',
  'endDate',
  'asin',
  'searchQueryData.searchQuery',
  'searchQueryData.searchQueryScore',
  'searchQueryData.searchQueryVolume',
  'impressionData.totalQueryImpressionCount',
  'impressionData.asinImpressionCount',
  'impressionData.asinImpressionShare',
  'clickData.totalClickCount',
  'clickData.totalClickRate',
  'clickData.asinClickCount',
  'clickData.asinClickShare',
  'clickData.totalMedianClickPrice.amount',
  'clickData.totalMedianClickPrice.currencyCode',
  'clickData.asinMedianClickPrice.amount',
  'clickData.asinMedianClickPrice.currencyCode',
  'clickData.totalSameDayShippingClickCount',
  'clickData.totalOneDayShippingClickCount',
  'clickData.totalTwoDayShippingClickCount',
  'cartAddData.totalCartAddCount',
  'cartAddData.totalCartAddRate',
  'cartAddData.asinCartAddCount',
  'cartAddData.asinCartAddShare',
  'cartAddData.totalMedianCartAddPrice.amount',
  'cartAddData.totalMedianCartAddPrice.currencyCode',
  'cartAddData.asinMedianCartAddPrice.amount',
  'cartAddData.asinMedianCartAddPrice.currencyCode',
  'cartAddData.totalSameDayShippingCartAddCount',
  'cartAddData.totalOneDayShippingCartAddCount',
  'cartAddData.totalTwoDayShippingCartAddCount',
  'purchaseData.totalPurchaseCount',
  'purchaseData.totalPurchaseRate',
  'purchaseData.asinPurchaseCount',
  'purchaseData.asinPurchaseShare',
  'purchaseData.totalMedianPurchasePrice.amount',
  'purchaseData.totalMedianPurchasePrice.currencyCode',
  'purchaseData.asinMedianPurchasePrice.amount',
  'purchaseData.asinMedianPurchasePrice.currencyCode',
  'purchaseData.totalSameDayShippingPurchaseCount',
  'purchaseData.totalOneDayShippingPurchaseCount',
  'purchaseData.totalTwoDayShippingPurchaseCount',
]

const SALES_BY_DATE_HEADERS = [
  'date',
  'salesByDate.orderedProductSales.amount',
  'salesByDate.orderedProductSales.currencyCode',
  'salesByDate.orderedProductSalesB2B.amount',
  'salesByDate.orderedProductSalesB2B.currencyCode',
  'salesByDate.unitsOrdered',
  'salesByDate.unitsOrderedB2B',
  'salesByDate.totalOrderItems',
  'salesByDate.totalOrderItemsB2B',
  'salesByDate.averageSalesPerOrderItem.amount',
  'salesByDate.averageSalesPerOrderItem.currencyCode',
  'salesByDate.averageSalesPerOrderItemB2B.amount',
  'salesByDate.averageSalesPerOrderItemB2B.currencyCode',
  'salesByDate.averageUnitsPerOrderItem',
  'salesByDate.averageUnitsPerOrderItemB2B',
  'salesByDate.averageSellingPrice.amount',
  'salesByDate.averageSellingPrice.currencyCode',
  'salesByDate.averageSellingPriceB2B.amount',
  'salesByDate.averageSellingPriceB2B.currencyCode',
  'salesByDate.unitsRefunded',
  'salesByDate.refundRate',
  'salesByDate.claimsGranted',
  'salesByDate.claimsAmount.amount',
  'salesByDate.claimsAmount.currencyCode',
  'salesByDate.shippedProductSales.amount',
  'salesByDate.shippedProductSales.currencyCode',
  'salesByDate.unitsShipped',
  'salesByDate.ordersShipped',
  'trafficByDate.browserPageViews',
  'trafficByDate.browserPageViewsB2B',
  'trafficByDate.mobileAppPageViews',
  'trafficByDate.mobileAppPageViewsB2B',
  'trafficByDate.pageViews',
  'trafficByDate.pageViewsB2B',
  'trafficByDate.browserSessions',
  'trafficByDate.browserSessionsB2B',
  'trafficByDate.mobileAppSessions',
  'trafficByDate.mobileAppSessionsB2B',
  'trafficByDate.sessions',
  'trafficByDate.sessionsB2B',
  'trafficByDate.buyBoxPercentage',
  'trafficByDate.buyBoxPercentageB2B',
  'trafficByDate.orderItemSessionPercentage',
  'trafficByDate.orderItemSessionPercentageB2B',
  'trafficByDate.unitSessionPercentage',
  'trafficByDate.unitSessionPercentageB2B',
  'trafficByDate.averageOfferCount',
  'trafficByDate.averageParentItems',
  'trafficByDate.feedbackReceived',
  'trafficByDate.negativeFeedbackReceived',
  'trafficByDate.receivedNegativeFeedbackRate',
]

const SALES_BY_ASIN_HEADERS = [
  'parentAsin',
  'childAsin',
  'salesByAsin.unitsOrdered',
  'salesByAsin.unitsOrderedB2B',
  'salesByAsin.orderedProductSales.amount',
  'salesByAsin.orderedProductSales.currencyCode',
  'salesByAsin.orderedProductSalesB2B.amount',
  'salesByAsin.orderedProductSalesB2B.currencyCode',
  'salesByAsin.totalOrderItems',
  'salesByAsin.totalOrderItemsB2B',
  'trafficByAsin.browserSessions',
  'trafficByAsin.browserSessionsB2B',
  'trafficByAsin.mobileAppSessions',
  'trafficByAsin.mobileAppSessionsB2B',
  'trafficByAsin.sessions',
  'trafficByAsin.sessionsB2B',
  'trafficByAsin.browserSessionPercentage',
  'trafficByAsin.browserSessionPercentageB2B',
  'trafficByAsin.mobileAppSessionPercentage',
  'trafficByAsin.mobileAppSessionPercentageB2B',
  'trafficByAsin.sessionPercentage',
  'trafficByAsin.sessionPercentageB2B',
  'trafficByAsin.browserPageViews',
  'trafficByAsin.browserPageViewsB2B',
  'trafficByAsin.mobileAppPageViews',
  'trafficByAsin.mobileAppPageViewsB2B',
  'trafficByAsin.pageViews',
  'trafficByAsin.pageViewsB2B',
  'trafficByAsin.browserPageViewsPercentage',
  'trafficByAsin.browserPageViewsPercentageB2B',
  'trafficByAsin.mobileAppPageViewsPercentage',
  'trafficByAsin.mobileAppPageViewsPercentageB2B',
  'trafficByAsin.pageViewsPercentage',
  'trafficByAsin.pageViewsPercentageB2B',
  'trafficByAsin.buyBoxPercentage',
  'trafficByAsin.buyBoxPercentageB2B',
  'trafficByAsin.unitSessionPercentage',
  'trafficByAsin.unitSessionPercentageB2B',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs() {
  const argv = process.argv.slice(2)
  let dryRun = false
  let startDate = null
  let endDate = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--start-date') {
      startDate = argv[index + 1] ?? null
      index += 1
      continue
    }
    if (arg === '--end-date') {
      endDate = argv[index + 1] ?? null
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw new Error('Both --start-date and --end-date are required together.')
  }

  return {
    dryRun,
    week: startDate && endDate ? weekContextForRange(startDate, endDate) : latestCompleteWeek(),
  }
}

export function createManifestState(existingManifest, { weekCode, weekStart, weekEnd }) {
  return {
    generatedAt: new Date().toISOString(),
    weekCode,
    weekStart,
    weekEnd,
    heroAsin: HERO_ASIN,
    competitorAsin: COMPETITOR_ASIN,
    filterMode: 'clickedAsinAny',
    targetAsins: [...TST_TARGET_ASINS],
    reports: { ...(existingManifest?.reports ?? {}) },
  }
}

export function writeManifest(file, manifestState) {
  manifestState.generatedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(manifestState, null, 2))
}

export function persistManifestReportId(file, manifestState, reportKey, reportId) {
  manifestState.reports[reportKey] = reportId
  writeManifest(file, manifestState)
}

async function createAndWaitReport(client, body, label, onReportCreated = null) {
  const created = await client.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body,
  })
  const reportId = created?.reportId
  if (!reportId) throw new Error(`${label}: missing reportId`)
  if (onReportCreated) {
    onReportCreated(reportId)
  }

  return waitForReport(client, reportId, label)
}

async function waitForReport(client, reportId, label) {
  const deadline = Date.now() + REPORT_WAIT_TIMEOUT_MS
  while (true) {
    const report = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })

    const status = report?.processingStatus
    console.log(`[SP-API] ${label} reportId=${reportId} status=${status}`)

    if (status === 'DONE') return reportId
    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`${label}: report failed with status ${status}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`${label}: report timed out`)
    }
    await sleep(8000)
  }
}

function sameInstant(left, right) {
  if (!left || !right) return false

  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false

  return leftTime === rightTime
}

function normalizeReportOptions(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeReportOptions(entry))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeReportOptions(value[key])
        return result
      }, {})
  }

  return value ?? null
}

function sameReportOptions(left, right) {
  return JSON.stringify(normalizeReportOptions(left)) === JSON.stringify(normalizeReportOptions(right))
}

function canBlindlyReuseReport(report, reportOptions) {
  if (!reportOptions) return true
  if (!report?.reportOptions) return false
  return sameReportOptions(report.reportOptions, reportOptions)
}

async function findReusableReport(client, { reportType, marketplaceId, dataStartTime, dataEndTime, reportOptions = null, statuses }) {
  const response = await client.callAPI({
    operation: 'getReports',
    endpoint: 'reports',
    query: {
      reportTypes: [reportType],
      pageSize: 100,
    },
  })

  const reports = response?.reports ?? []
  return (
    reports
      .filter((report) => report?.marketplaceIds?.includes(marketplaceId))
      .filter((report) => sameInstant(report?.dataStartTime, dataStartTime))
      .filter((report) => sameInstant(report?.dataEndTime, dataEndTime))
      .filter((report) => canBlindlyReuseReport(report, reportOptions))
      .filter((report) => statuses.has(report?.processingStatus))
      .sort((left, right) => String(right?.createdTime ?? '').localeCompare(String(left?.createdTime ?? '')))[0] ?? null
  )
}

function matchesReusableReport(report, { reportType, marketplaceId, dataStartTime, dataEndTime }) {
  return (
    report?.reportType === reportType &&
    report?.marketplaceIds?.includes(marketplaceId) &&
    sameInstant(report?.dataStartTime, dataStartTime) &&
    sameInstant(report?.dataEndTime, dataEndTime)
  )
}

async function loadManifestReport(client, manifestReportId, criteria) {
  if (!manifestReportId) return null

  try {
    const report = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId: manifestReportId },
    })

    if (!matchesReusableReport(report, criteria)) {
      return null
    }

    return report
  } catch {
    return null
  }
}

async function resolveReportId(client, { reportType, reportWindow, label, reportOptions = null, manifestReportId = '', onReportCreated = null }) {
  const criteria = {
    reportType,
    marketplaceId: reportWindow.marketplaceIds[0],
    dataStartTime: reportWindow.dataStartTime,
    dataEndTime: reportWindow.dataEndTime,
    reportOptions,
  }

  const manifestReport = await loadManifestReport(client, manifestReportId, criteria)
  const manifestStatus = manifestReport?.processingStatus
  if (DONE_REPORT_STATUSES.has(manifestStatus)) {
    console.log(`[SP-API] ${label} reusing manifest DONE reportId=${manifestReport.reportId}`)
    return manifestReport.reportId
  }

  if (ACTIVE_REPORT_STATUSES.has(manifestStatus)) {
    console.log(`[SP-API] ${label} reusing manifest active reportId=${manifestReport.reportId}`)
    return waitForReport(client, manifestReport.reportId, label)
  }

  const completedReport = await findReusableReport(client, { ...criteria, statuses: DONE_REPORT_STATUSES })
  if (completedReport?.reportId) {
    console.log(`[SP-API] ${label} reusing DONE reportId=${completedReport.reportId}`)
    return completedReport.reportId
  }

  const activeReport = await findReusableReport(client, { ...criteria, statuses: ACTIVE_REPORT_STATUSES })
  if (activeReport?.reportId) {
    console.log(`[SP-API] ${label} reusing active reportId=${activeReport.reportId}`)
    return waitForReport(client, activeReport.reportId, label)
  }

  const body = {
    reportType,
    ...reportWindow,
  }

  if (reportOptions) {
    body.reportOptions = reportOptions
  }

  return createAndWaitReport(client, body, label, onReportCreated)
}

async function downloadJsonReport(client, reportId) {
  const report = await client.callAPI({
    operation: 'getReport',
    endpoint: 'reports',
    path: { reportId },
  })

  const reportDocumentId = report?.reportDocumentId
  if (!reportDocumentId) {
    throw new Error(`Report ${reportId} missing reportDocumentId`)
  }

  const document = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId },
  })

  const raw = await client.download(document)
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
  return {
    parsed: JSON.parse(text),
    reportDocument: document,
  }
}

async function reportDocumentInfo(client, reportId) {
  const report = await client.callAPI({
    operation: 'getReport',
    endpoint: 'reports',
    path: { reportId },
  })
  const reportDocumentId = report?.reportDocumentId
  if (!reportDocumentId) throw new Error(`Report ${reportId} missing reportDocumentId`)

  return client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId },
  })
}

async function downloadUrlToFile(url, file) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(file)
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed with HTTP ${response.statusCode}`))
          return
        }
        response.pipe(output)
        output.on('finish', () => {
          output.close(resolve)
        })
        response.on('error', reject)
        output.on('error', reject)
      })
      .on('error', reject)
  })
}

function rowsToCsv(file, rows, canonicalHeaders) {
  const { rows: flatRows } = flattenRows(rows)
  const orderedHeaders = orderHeaders(canonicalHeaders, flatRows)
  const safeHeaders = orderedHeaders.length ? orderedHeaders : ['value']
  writeCsv(file, safeHeaders, flatRows)
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return null

  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sameStringArray(left, right) {
  if (!Array.isArray(left)) return false
  if (!Array.isArray(right)) return false
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function runTstFilter(rawPath, outputPath) {
  const filterScript = path.join(__dirname, 'filter-tst.py')
  const args = [filterScript, '--input', rawPath, '--output', outputPath]
  for (const asin of TST_TARGET_ASINS) {
    args.push('--target-asin', asin)
  }
  const result = spawnSync(
    'python3',
    args,
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error(`TST filter failed for ${rawPath}`)
  }
}

async function main() {
  const { dryRun, week } = parseArgs()
  const { weekCode, weekStart, weekEnd } = week

  const weekPrefix = `${weekCode}_${weekEnd}`
  const scopeLabel = `${weekCode} ${weekStart}..${weekEnd}`

  ensureDir(SCP_DIR)
  ensureDir(SQP_DIR)
  ensureDir(TST_DIR)
  ensureDir(SALES_DIR)
  ensureDir(SPAPI_MANIFEST_DIR)

  const scpPath = path.join(SCP_DIR, `${weekPrefix}_SCP.csv`)
  const sqpPath = path.join(SQP_DIR, `${weekPrefix}_SQP.csv`)
  const salesByDatePath = path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByDate.csv`)
  const salesByAsinPath = path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByAsin.csv`)
  const filteredTstPath = path.join(TST_DIR, `${weekPrefix}_TST.csv`)
  const manifestPath = path.join(SPAPI_MANIFEST_DIR, `${weekPrefix}_SPAPI-Manifest.json`)
  const existingManifest = readJsonFile(manifestPath)
  const manifestState = createManifestState(existingManifest, { weekCode, weekStart, weekEnd })

  if (dryRun) {
    console.log(`[SP-API][dry-run] scope=${scopeLabel}`)
    console.log(`[SP-API][dry-run] ${scpPath}`)
    console.log(`[SP-API][dry-run] ${sqpPath}`)
    console.log(`[SP-API][dry-run] ${filteredTstPath}`)
    console.log(`[SP-API][dry-run] ${salesByDatePath}`)
    console.log(`[SP-API][dry-run] ${salesByAsinPath}`)
    return
  }

  loadMonitoringEnv()

  const appClientId = requireEnv('AMAZON_SP_APP_CLIENT_ID')
  const appClientSecret = requireEnv('AMAZON_SP_APP_CLIENT_SECRET')
  const refreshToken = requireEnv('AMAZON_REFRESH_TOKEN_US')
  const region = requireEnv('AMAZON_SP_API_REGION_US')
  const marketplaceId = requireEnv('AMAZON_MARKETPLACE_ID_US')

  const requireFromTalos = createRequire(TALOS_PACKAGE_JSON)
  const SellingPartnerAPI = requireFromTalos('amazon-sp-api')
  const client = new SellingPartnerAPI({
    region,
    refresh_token: refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: appClientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: appClientSecret,
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: false,
    },
  })

  const reportWindow = {
    dataStartTime: `${weekStart}T00:00:00Z`,
    dataEndTime: `${weekEnd}T23:59:59Z`,
    marketplaceIds: [marketplaceId],
  }
  const rememberReportId = (reportKey) => (reportId) => persistManifestReportId(manifestPath, manifestState, reportKey, reportId)

  const scpReportId = await resolveReportId(client, {
    reportType: 'GET_BRAND_ANALYTICS_SEARCH_CATALOG_PERFORMANCE_REPORT',
    reportWindow,
    label: `${scopeLabel} SCP`,
    reportOptions: { reportPeriod: 'WEEK' },
    manifestReportId: existingManifest?.reports?.scpReportId,
    onReportCreated: rememberReportId('scpReportId'),
  })
  rememberReportId('scpReportId')(scpReportId)
  const canReuseScpOutput = existingManifest?.reports?.scpReportId === scpReportId && fs.existsSync(scpPath)
  if (canReuseScpOutput) {
    console.log(`[SP-API] ${scopeLabel} SCP output already current for reportId=${scpReportId}`)
  } else {
    const scpData = await downloadJsonReport(client, scpReportId)
    rowsToCsv(scpPath, scpData.parsed?.dataByAsin || [], SCP_HEADERS)
  }

  const sqpReportId = await resolveReportId(client, {
    reportType: 'GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT',
    reportWindow,
    label: `${scopeLabel} SQP`,
    reportOptions: { reportPeriod: 'WEEK', asin: HERO_ASIN },
    manifestReportId: existingManifest?.reports?.sqpReportId,
    onReportCreated: rememberReportId('sqpReportId'),
  })
  rememberReportId('sqpReportId')(sqpReportId)
  const canReuseSqpOutput = existingManifest?.reports?.sqpReportId === sqpReportId && fs.existsSync(sqpPath)
  if (canReuseSqpOutput) {
    console.log(`[SP-API] ${scopeLabel} SQP output already current for reportId=${sqpReportId}`)
  } else {
    const sqpData = await downloadJsonReport(client, sqpReportId)
    rowsToCsv(sqpPath, sqpData.parsed?.dataByAsin || [], SQP_HEADERS)
  }

  const salesReportId = await resolveReportId(client, {
    reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
    reportWindow,
    label: `${scopeLabel} SalesTraffic`,
    reportOptions: { dateGranularity: 'DAY', asinGranularity: 'CHILD' },
    manifestReportId: existingManifest?.reports?.salesReportId,
    onReportCreated: rememberReportId('salesReportId'),
  })
  rememberReportId('salesReportId')(salesReportId)
  const canReuseSalesOutput =
    existingManifest?.reports?.salesReportId === salesReportId &&
    fs.existsSync(salesByDatePath) &&
    fs.existsSync(salesByAsinPath)
  if (canReuseSalesOutput) {
    console.log(`[SP-API] ${scopeLabel} SalesTraffic output already current for reportId=${salesReportId}`)
  } else {
    const salesData = await downloadJsonReport(client, salesReportId)
    rowsToCsv(salesByDatePath, salesData.parsed?.salesAndTrafficByDate || [], SALES_BY_DATE_HEADERS)
    rowsToCsv(salesByAsinPath, salesData.parsed?.salesAndTrafficByAsin || [], SALES_BY_ASIN_HEADERS)
  }

  const tstReportId = await resolveReportId(client, {
    reportType: TST_REPORT_TYPE,
    reportWindow,
    label: `${scopeLabel} TST`,
    reportOptions: { reportPeriod: 'WEEK' },
    manifestReportId: existingManifest?.reports?.tstReportId,
    onReportCreated: rememberReportId('tstReportId'),
  })
  rememberReportId('tstReportId')(tstReportId)

  const canReuseFilteredTst =
    existingManifest?.reports?.tstReportId === tstReportId &&
    existingManifest?.filterMode === 'clickedAsinAny' &&
    sameStringArray(existingManifest?.targetAsins, TST_TARGET_ASINS) &&
    fs.existsSync(filteredTstPath)

  if (canReuseFilteredTst) {
    console.log(`[SP-API] ${scopeLabel} TST output already current for reportId=${tstReportId}`)
  } else {
    const tstDoc = await reportDocumentInfo(client, tstReportId)
    const rawTstPath = path.join('/tmp', `${weekPrefix}_TST.raw.json${String(tstDoc?.compressionAlgorithm || '').toUpperCase() === 'GZIP' ? '.gz' : ''}`)

    await downloadUrlToFile(tstDoc.url, rawTstPath)
    runTstFilter(rawTstPath, filteredTstPath)
    fs.rmSync(rawTstPath, { force: true })
  }

  writeManifest(manifestPath, manifestState)

  console.log(`[SP-API] Completed ${scopeLabel}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error))
    process.exit(1)
  })
}
