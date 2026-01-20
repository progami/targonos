import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function parseArgs(argv) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index]
    if (!entry.startsWith('--')) continue

    const [rawKey, inlineValue] = entry.split('=')
    const key = rawKey.slice(2)

    if (key === 'help') {
      args.help = true
      continue
    }

    if (inlineValue !== undefined) {
      args[key] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }

    args[key] = next
    index += 1
  }

  return args
}

function getEnvVar(name) {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function loadEnvFile(envFilePath) {
  const content = fs.readFileSync(envFilePath, 'utf8')
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    if (!key.startsWith('AMAZON_') && !key.startsWith('AWS_')) continue

    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function parseDay(value, kind) {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (match) {
    const suffix = kind === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
    return new Date(value + suffix)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --${kind} value "${value}" (use YYYY-MM-DD or ISO timestamp)`)
  }
  return parsed
}

function printUsage() {
  const script = 'node scripts/amazon-sp-api-smoke.mjs'
  console.log('Amazon SP-API smoke test (Reports + Listings + Catalog)')
  console.log('')
  console.log('Usage:')
  console.log(`  ${script} --tenant US --start 2026-01-01 --end 2026-01-14`)
  console.log(`  ${script} --tenant UK --start 2026-01-01 --end 2026-01-14`)
  console.log(`  ${script} --tenant US --report-type GET_FLAT_FILE_OPEN_LISTINGS_DATA`)
  console.log('')
  console.log('Options:')
  console.log('  --env-file <path>        Defaults to ../../../targonos-main/apps/talos/.env.local')
  console.log('  --tenant <US|UK>         Required (US or UK)')
  console.log('  --start <YYYY-MM-DD>     Optional (defaults to last 2 days)')
  console.log('  --end <YYYY-MM-DD>       Optional (defaults to today)')
  console.log('  --report-type <type>     Optional (default GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2)')
  console.log('  --poll-interval-ms <n>   Optional (default 10000)')
  console.log('  --max-wait-ms <n>        Optional (default 600000)')
  console.log('  --sku <sellerSku>        Optional (override SKU for Listings/Catalog test)')
  console.log('  --asin <asin>            Optional (override ASIN for Catalog test)')
  console.log('  --help                   Show help')
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  printUsage()
  process.exit(0)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')

const defaultEnvFile = path.resolve(__dirname, '../../../targonos-main/apps/talos/.env.local')
const envFilePath = String(args['env-file'] ?? defaultEnvFile)

if (!fs.existsSync(envFilePath)) {
  throw new Error(`Env file not found: ${envFilePath}`)
}

loadEnvFile(envFilePath)

const tenant = String(args.tenant ?? '').trim().toUpperCase()
if (tenant !== 'US' && tenant !== 'UK') {
  throw new Error(`Invalid --tenant "${tenant}". Expected US or UK.`)
}

const appClientId = getEnvVar('AMAZON_SP_APP_CLIENT_ID')
const appClientSecret = getEnvVar('AMAZON_SP_APP_CLIENT_SECRET')
const refreshToken = getEnvVar(`AMAZON_REFRESH_TOKEN_${tenant}`) ?? getEnvVar('AMAZON_REFRESH_TOKEN')
const marketplaceId =
  getEnvVar(`AMAZON_MARKETPLACE_ID_${tenant}`) ?? getEnvVar('AMAZON_MARKETPLACE_ID')
const region = getEnvVar(`AMAZON_SP_API_REGION_${tenant}`) ?? getEnvVar('AMAZON_SP_API_REGION')
const sellerId = getEnvVar(`AMAZON_SELLER_ID_${tenant}`) ?? getEnvVar('AMAZON_SELLER_ID')

const missing = []
if (!appClientId) missing.push('AMAZON_SP_APP_CLIENT_ID')
if (!appClientSecret) missing.push('AMAZON_SP_APP_CLIENT_SECRET')
if (!refreshToken) missing.push(`AMAZON_REFRESH_TOKEN_${tenant}` + ' (or AMAZON_REFRESH_TOKEN)')
if (!marketplaceId) missing.push(`AMAZON_MARKETPLACE_ID_${tenant}` + ' (or AMAZON_MARKETPLACE_ID)')
if (!region) missing.push(`AMAZON_SP_API_REGION_${tenant}` + ' (or AMAZON_SP_API_REGION)')

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

const pollIntervalMs = Number(args['poll-interval-ms'] ?? 10_000)
const maxWaitMs = Number(args['max-wait-ms'] ?? 600_000)

const now = new Date()
const startDate =
  args.start !== undefined ? parseDay(String(args.start), 'start') : new Date(now.getTime() - 2 * 86400000)
const endDate = args.end !== undefined ? parseDay(String(args.end), 'end') : now

const talosRequire = createRequire(path.join(repoRoot, 'apps/talos/package.json'))
const SellingPartnerAPI = talosRequire('amazon-sp-api')

const spClient = new SellingPartnerAPI({
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

console.log('--- Amazon SP-API Smoke Test ---')
console.log(`Tenant: ${tenant}`)
console.log(`Region: ${region}`)
console.log(`MarketplaceId: ${marketplaceId}`)
console.log(`SellerId: ${sellerId}`)
console.log(`Date range: ${startDate.toISOString()} -> ${endDate.toISOString()}`)

// 1) Reports: createReport -> getReport -> getReportDocument -> download
const reportType = String(args['report-type'] ?? 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2').trim()
const createReportBody = {
  reportType,
  marketplaceIds: [marketplaceId],
  dataStartTime: startDate.toISOString(),
  dataEndTime: endDate.toISOString(),
}

console.log('\n[reports.createReport] body:')
console.log(JSON.stringify(createReportBody, null, 2))

const createReportResponse = await spClient.callAPI({
  operation: 'createReport',
  endpoint: 'reports',
  body: createReportBody,
})

const reportId = createReportResponse?.reportId
if (!reportId) {
  throw new Error('createReport did not return reportId')
}

console.log(`[reports.createReport] reportId: ${reportId}`)

const deadline = Date.now() + maxWaitMs
let report
while (true) {
  report = await spClient.callAPI({
    operation: 'getReport',
    endpoint: 'reports',
    path: { reportId },
  })

  const processingStatus = report?.processingStatus
  console.log(`[reports.getReport] status: ${processingStatus ?? 'UNKNOWN'}`)

  if (processingStatus === 'DONE') break
  if (processingStatus === 'FATAL' || processingStatus === 'CANCELLED') {
    throw new Error(`Report ${reportId} failed with status ${processingStatus}`)
  }
  if (Date.now() > deadline) {
    throw new Error(`Timed out waiting for report ${reportId} (last status: ${processingStatus ?? 'UNKNOWN'})`)
  }

  await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
}

const reportDocumentId = report?.reportDocumentId
if (!reportDocumentId) {
  throw new Error(`Report ${reportId} is DONE but reportDocumentId is missing`)
}

console.log(`[reports.getReport] reportDocumentId: ${reportDocumentId}`)

const reportDocument = await spClient.callAPI({
  operation: 'getReportDocument',
  endpoint: 'reports',
  path: { reportDocumentId },
})

console.log('[reports.getReportDocument] response:')
console.log(
  JSON.stringify(
    {
      reportDocumentId: reportDocument?.reportDocumentId,
      compressionAlgorithm: reportDocument?.compressionAlgorithm,
      urlPresent: Boolean(reportDocument?.url),
    },
    null,
    2
  )
)

const downloaded = await spClient.download(reportDocument)
const downloadedText = Buffer.isBuffer(downloaded) ? downloaded.toString('utf8') : String(downloaded)

const firstLine = downloadedText.split(/\r?\n/)[0] ?? ''
const columns = firstLine.split('\t').map(value => value.trim()).filter(Boolean)

console.log(`[reports.download] bytes: ${Buffer.byteLength(downloadedText, 'utf8')}`)
console.log(`[reports.download] columns (${columns.length}): ${columns.join(', ')}`)

const skuOverride = args.sku !== undefined ? String(args.sku).trim() : undefined
const asinOverride = args.asin !== undefined ? String(args.asin).trim().toUpperCase() : undefined

const skuColumnIndex = columns.findIndex(column => column.toLowerCase() === 'sku')
const asinColumnIndex = columns.findIndex(column => column.toLowerCase() === 'asin')

let sampleSku
let sampleAsin

if (skuColumnIndex !== -1) {
  const lines = downloadedText.split(/\r?\n/)
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    const parts = line.split('\t')
    const sku = (parts[skuColumnIndex] ?? '').trim()
    if (!sku) continue

    sampleSku = sku
    if (asinColumnIndex !== -1) {
      const asin = (parts[asinColumnIndex] ?? '').trim().toUpperCase()
      if (asin) sampleAsin = asin
    }
    break
  }
}

const detectedSku = skuOverride ?? sampleSku

if (!detectedSku) {
  console.log('\n[listingsItems.getListingsItem] skipped (no SKU detected in report; pass --sku)')
  console.log('[catalogItems.getCatalogItem] skipped (no ASIN available; pass --asin)')
  process.exit(0)
}

console.log(`\nDetected SKU: ${detectedSku}`)

let listingSummary
if (sellerId) {
  try {
    const listingItem = await spClient.callAPI({
      operation: 'getListingsItem',
      endpoint: 'listingsItems',
      options: { version: '2021-08-01' },
      path: { sellerId, sku: detectedSku },
      query: { marketplaceIds: [marketplaceId], includedData: ['summaries'] },
    })

    listingSummary = Array.isArray(listingItem?.summaries) ? listingItem.summaries[0] : undefined
    console.log('[listingsItems.getListingsItem] response:')
    console.log(
      JSON.stringify(
        {
          asin: listingSummary?.asin,
          sku: listingItem?.sku,
          status: listingSummary?.status,
        },
        null,
        2
      )
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`[listingsItems.getListingsItem] error: ${message}`)
  }
} else {
  console.log('[listingsItems.getListingsItem] skipped (missing AMAZON_SELLER_ID)')
}

const detectedAsin = asinOverride ?? sampleAsin ?? listingSummary?.asin

if (!detectedAsin) {
  console.log('\n[catalogItems.getCatalogItem] skipped (no ASIN found; pass --asin)')
  process.exit(0)
}

console.log(`\nUsing ASIN: ${detectedAsin}`)

const catalogItem = await spClient.callAPI({
  operation: 'getCatalogItem',
  endpoint: 'catalogItems',
  options: { version: '2022-04-01' },
  path: { asin: detectedAsin },
  query: { marketplaceIds: [marketplaceId], includedData: ['attributes', 'summaries', 'relationships'] },
})

const firstSummary = Array.isArray(catalogItem?.summaries) ? catalogItem.summaries[0] : undefined
const attributes = catalogItem?.attributes
const dimensions = Array.isArray(attributes?.item_dimensions) ? attributes.item_dimensions[0] : undefined

console.log('[catalogItems.getCatalogItem] response (trimmed):')
console.log(
  JSON.stringify(
    {
      asin: catalogItem?.asin,
      itemName: firstSummary?.itemName,
      itemDimensions: dimensions ?? null,
    },
    null,
    2
  )
)
