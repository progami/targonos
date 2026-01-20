import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

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
  const script = 'node scripts/amazon-sp-api-finances-smoke.mjs'
  console.log('Amazon SP-API finances smoke test (Transactions + Event Groups)')
  console.log('')
  console.log('Usage:')
  console.log(`  ${script} --tenant US --start 2025-12-01 --end 2026-01-01`)
  console.log(`  ${script} --tenant UK --start 2025-12-01 --end 2026-01-01`)
  console.log('')
  console.log('Options:')
  console.log('  --env-file <path>    Defaults to ../../../targonos-main/apps/talos/.env.local')
  console.log('  --tenant <US|UK>     Required (US or UK)')
  console.log('  --start <YYYY-MM-DD> Optional (defaults to last 60 days)')
  console.log('  --end <YYYY-MM-DD>   Optional (defaults to now-5min)')
  console.log('  --help               Show help')
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
const region = getEnvVar(`AMAZON_SP_API_REGION_${tenant}`) ?? getEnvVar('AMAZON_SP_API_REGION')

const missing = []
if (!appClientId) missing.push('AMAZON_SP_APP_CLIENT_ID')
if (!appClientSecret) missing.push('AMAZON_SP_APP_CLIENT_SECRET')
if (!refreshToken) missing.push(`AMAZON_REFRESH_TOKEN_${tenant}` + ' (or AMAZON_REFRESH_TOKEN)')
if (!region) missing.push(`AMAZON_SP_API_REGION_${tenant}` + ' (or AMAZON_SP_API_REGION)')
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

const now = Date.now()
const defaultEnd = new Date(now - 5 * 60 * 1000)
const startDate =
  args.start !== undefined ? parseDay(String(args.start), 'start') : new Date(now - 60 * 24 * 60 * 60 * 1000)
const requestedEnd = args.end !== undefined ? parseDay(String(args.end), 'end') : defaultEnd
const endDate = requestedEnd.getTime() < defaultEnd.getTime() ? requestedEnd : defaultEnd

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

console.log('--- Amazon SP-API Finances Smoke Test ---')
console.log(`Tenant: ${tenant}`)
console.log(`Region: ${region}`)
console.log(`Date range: ${startDate.toISOString()} -> ${endDate.toISOString()}`)

// 1) Transactions (newer finance API)
const transactions = await spClient.callAPI({
  operation: 'listTransactions',
  endpoint: 'finances',
  options: { version: '2024-06-19' },
  query: {
    postedAfter: startDate.toISOString(),
    postedBefore: endDate.toISOString(),
  },
})

const txList = Array.isArray(transactions?.transactions) ? transactions.transactions : []
const sampleTx = txList[0]

function getRelatedId(tx, name) {
  const list = Array.isArray(tx?.relatedIdentifiers) ? tx.relatedIdentifiers : []
  const match = list.find(entry => entry?.relatedIdentifierName === name)
  return match?.relatedIdentifierValue
}

console.log('\n[finances.listTransactions] summary:')
console.log(
  JSON.stringify(
    {
      count: txList.length,
      sample: sampleTx
        ? {
            transactionType: sampleTx.transactionType,
            transactionId: sampleTx.transactionId,
            postedDate: sampleTx.postedDate,
            marketplaceId: sampleTx.marketplaceDetails?.marketplaceId,
            settlementId: getRelatedId(sampleTx, 'SETTLEMENT_ID') ?? null,
            financialEventGroupId: getRelatedId(sampleTx, 'FINANCIAL_EVENT_GROUP_ID') ?? null,
          }
        : null,
    },
    null,
    2
  )
)

// 2) Event Groups + Events (v0 finance API)
const eventGroups = await spClient.callAPI({
  operation: 'listFinancialEventGroups',
  endpoint: 'finances',
  options: { version: 'v0' },
  query: {
    FinancialEventGroupStartedAfter: startDate.toISOString(),
    FinancialEventGroupStartedBefore: endDate.toISOString(),
    MaxResultsPerPage: 10,
  },
})

const groupList = Array.isArray(eventGroups?.FinancialEventGroupList) ? eventGroups.FinancialEventGroupList : []
const sampleGroup = groupList[0]

console.log('\n[finances.listFinancialEventGroups] summary:')
console.log(
  JSON.stringify(
    {
      count: groupList.length,
      nextTokenPresent: Boolean(eventGroups?.NextToken),
      sample: sampleGroup
        ? {
            FinancialEventGroupId: sampleGroup.FinancialEventGroupId,
            ProcessingStatus: sampleGroup.ProcessingStatus,
            OriginalTotal: sampleGroup.OriginalTotal,
            FinancialEventGroupStart: sampleGroup.FinancialEventGroupStart,
            FinancialEventGroupEnd: sampleGroup.FinancialEventGroupEnd ?? null,
          }
        : null,
    },
    null,
    2
  )
)

if (!sampleGroup?.FinancialEventGroupId) {
  process.exit(0)
}

const groupEvents = await spClient.callAPI({
  operation: 'listFinancialEventsByGroupId',
  endpoint: 'finances',
  options: { version: 'v0' },
  path: { eventGroupId: sampleGroup.FinancialEventGroupId },
  query: { MaxResultsPerPage: 100 },
})

const financialEvents = groupEvents?.FinancialEvents ?? {}

console.log('\n[finances.listFinancialEventsByGroupId] summary:')
console.log(
  JSON.stringify(
    {
      nextTokenPresent: Boolean(groupEvents?.NextToken),
      eventTypes: Object.keys(financialEvents),
      counts: {
        ShipmentEventList: financialEvents?.ShipmentEventList?.length ?? 0,
        RefundEventList: financialEvents?.RefundEventList?.length ?? 0,
        ServiceFeeEventList: financialEvents?.ServiceFeeEventList?.length ?? 0,
        AdjustmentEventList: financialEvents?.AdjustmentEventList?.length ?? 0,
      },
    },
    null,
    2
  )
)
