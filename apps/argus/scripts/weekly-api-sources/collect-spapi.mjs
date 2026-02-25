#!/usr/bin/env node

import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  REPO_ROOT,
  MONITORING_BASE,
  ensureDir,
  flattenRows,
  latestCompleteWeek,
  loadMonitoringEnv,
  requireEnv,
  writeCsv,
} from './lib/common.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HERO_ASIN = 'B09HXC3NL8'
const TST_FILTER_KEYWORD = 'drop cloth'
const TALOS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/talos/package.json')

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const BA_BASE = path.join(WEEKLY_ROOT, 'Brand Analytics (API)')
const BR_BASE = path.join(WEEKLY_ROOT, 'Business Reports (API)')

const SCP_DIR = path.join(BA_BASE, 'SCP - Search Catalog Performance (API)')
const SQP_DIR = path.join(BA_BASE, 'SQP - Search Query Performance (API)')
const TST_DIR = path.join(BA_BASE, 'TST - Top Search Terms (API)')
const SALES_DIR = path.join(BR_BASE, 'Sales & Traffic (API)')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
  }
}

async function createAndWaitReport(client, body, label) {
  const created = await client.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body,
  })
  const reportId = created?.reportId
  if (!reportId) throw new Error(`${label}: missing reportId`)

  const deadline = Date.now() + 45 * 60 * 1000
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

function rowsToCsv(file, rows) {
  const { headers, rows: flatRows } = flattenRows(rows)
  const safeHeaders = headers.length ? headers : ['value']
  writeCsv(file, safeHeaders, flatRows)
}

function runTstFilter(rawPath, outputPath) {
  const filterScript = path.join(__dirname, 'filter-tst.py')
  const result = spawnSync(
    'python3',
    [filterScript, '--input', rawPath, '--output', outputPath, '--keyword', TST_FILTER_KEYWORD],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error(`TST filter failed for ${rawPath}`)
  }
}

async function main() {
  const { dryRun } = parseArgs()
  const { weekCode, weekStart, weekEnd } = latestCompleteWeek()

  const weekPrefix = `${weekCode}_${weekEnd}`
  const scopeLabel = `${weekCode} ${weekStart}..${weekEnd}`

  ensureDir(SCP_DIR)
  ensureDir(SQP_DIR)
  ensureDir(TST_DIR)
  ensureDir(SALES_DIR)

  if (dryRun) {
    console.log(`[SP-API][dry-run] scope=${scopeLabel}`)
    console.log(`[SP-API][dry-run] ${path.join(SCP_DIR, `${weekPrefix}_SCP.csv`)}`)
    console.log(`[SP-API][dry-run] ${path.join(SQP_DIR, `${weekPrefix}_SQP.csv`)}`)
    console.log(`[SP-API][dry-run] ${path.join(TST_DIR, `${weekPrefix}_TST.csv`)}`)
    console.log(`[SP-API][dry-run] ${path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByDate.csv`)}`)
    console.log(`[SP-API][dry-run] ${path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByAsin.csv`)}`)
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

  const scpReportId = await createAndWaitReport(
    client,
    {
      reportType: 'GET_BRAND_ANALYTICS_SEARCH_CATALOG_PERFORMANCE_REPORT',
      ...reportWindow,
      reportOptions: { reportPeriod: 'WEEK' },
    },
    `${scopeLabel} SCP`,
  )
  const scpData = await downloadJsonReport(client, scpReportId)
  rowsToCsv(path.join(SCP_DIR, `${weekPrefix}_SCP.csv`), scpData.parsed?.dataByAsin || [])

  const sqpReportId = await createAndWaitReport(
    client,
    {
      reportType: 'GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT',
      ...reportWindow,
      reportOptions: { reportPeriod: 'WEEK', asin: HERO_ASIN },
    },
    `${scopeLabel} SQP`,
  )
  const sqpData = await downloadJsonReport(client, sqpReportId)
  rowsToCsv(path.join(SQP_DIR, `${weekPrefix}_SQP.csv`), sqpData.parsed?.dataByAsin || [])

  const salesReportId = await createAndWaitReport(
    client,
    {
      reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
      ...reportWindow,
      reportOptions: { dateGranularity: 'DAY', asinGranularity: 'CHILD' },
    },
    `${scopeLabel} SalesTraffic`,
  )
  const salesData = await downloadJsonReport(client, salesReportId)
  rowsToCsv(path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByDate.csv`), salesData.parsed?.salesAndTrafficByDate || [])
  rowsToCsv(path.join(SALES_DIR, `${weekPrefix}_SalesTraffic-ByAsin.csv`), salesData.parsed?.salesAndTrafficByAsin || [])

  const tstReportId = await createAndWaitReport(
    client,
    {
      reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
      ...reportWindow,
      reportOptions: { reportPeriod: 'WEEK' },
    },
    `${scopeLabel} TST`,
  )

  const tstDoc = await reportDocumentInfo(client, tstReportId)
  const rawTstPath = path.join('/tmp', `${weekPrefix}_TST.raw.json${String(tstDoc?.compressionAlgorithm || '').toUpperCase() === 'GZIP' ? '.gz' : ''}`)
  const filteredTstPath = path.join(TST_DIR, `${weekPrefix}_TST.csv`)

  await downloadUrlToFile(tstDoc.url, rawTstPath)
  runTstFilter(rawTstPath, filteredTstPath)
  fs.rmSync(rawTstPath, { force: true })

  const manifestPath = path.join(BA_BASE, `${weekPrefix}_SPAPI-Manifest.json`)
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        weekCode,
        weekStart,
        weekEnd,
        heroAsin: HERO_ASIN,
        filterKeyword: TST_FILTER_KEYWORD,
        reports: {
          scpReportId,
          sqpReportId,
          salesReportId,
          tstReportId,
        },
      },
      null,
      2,
    ),
  )

  console.log(`[SP-API] Completed ${scopeLabel}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
