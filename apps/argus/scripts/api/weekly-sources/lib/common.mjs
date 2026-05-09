import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  enqueueDriveSync,
  monitoringRootForMarket,
} from '../../../lib/artifacts.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const REPO_ROOT = path.resolve(__dirname, '../../../../../../')
const require = createRequire(import.meta.url)
const { loadEnvForApp } = require(path.join(REPO_ROOT, 'scripts/lib/shared-env.cjs'))

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000
const BASE_WEEK_START_UTC = Date.UTC(2025, 11, 28)

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function loadMonitoringEnv() {
  let mode = 'local'
  if (process.env.ARGUS_ENV_MODE && process.env.ARGUS_ENV_MODE.trim().length > 0) {
    mode = process.env.ARGUS_ENV_MODE
  } else if (process.env.TARGONOS_ENV_MODE && process.env.TARGONOS_ENV_MODE.trim().length > 0) {
    mode = process.env.TARGONOS_ENV_MODE
  }

  loadEnvForApp({
    repoRoot: REPO_ROOT,
    appName: 'argus',
    mode,
    targetEnv: process.env,
  })
}

export function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function readMarketArg(argv) {
  const index = argv.indexOf('--market')
  if (index < 0) return undefined
  return argv[index + 1]
}

export function resolveArgusMarket(raw = readMarketArg(process.argv.slice(2)) ?? process.env.ARGUS_MARKET) {
  if (raw === undefined) return 'us'
  if (raw === null) return 'us'

  const value = String(raw).trim().toLowerCase()
  if (value === '') return 'us'
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported Argus market: ${raw}`)
}

export function marketEnvSuffix(market = resolveArgusMarket()) {
  return market.toUpperCase()
}

export function requireMarketEnv(baseName, market = resolveArgusMarket()) {
  return requireEnv(`${baseName}_${marketEnvSuffix(market)}`)
}

export function parseAsinList(value, envName) {
  const asins = String(value ?? '')
    .split(/[\s,|]+/)
    .map((asin) => asin.trim().toUpperCase())
    .filter(Boolean)

  if (!asins.length) {
    throw new Error(`Missing required ASIN list env var: ${envName}`)
  }

  return asins
}

export function requireMarketAsinList(baseName, market = resolveArgusMarket()) {
  const envName = `${baseName}_${marketEnvSuffix(market)}`
  return parseAsinList(requireEnv(envName), envName)
}

export function wprSourceConfigForMarket(market = resolveArgusMarket()) {
  return {
    market,
    heroAsin: requireMarketEnv('WPR_HERO_ASIN', market).toUpperCase(),
    competitorAsin: requireMarketEnv('WPR_COMPETITOR_ASIN', market).toUpperCase(),
    competitorBrand: requireMarketEnv('WPR_COMPETITOR_BRAND', market),
    datadiveNicheId: requireMarketEnv('DATADIVE_NICHE_ID', market),
    listingOurAsins: requireMarketAsinList('ARGUS_OUR_ASINS', market),
    listingCompetitorSeedAsins: requireMarketAsinList('ARGUS_COMPETITOR_MAIN_ASINS', market),
    listingHeroBsrAsins: requireMarketAsinList('ARGUS_HERO_BSR_ASINS', market),
  }
}

export function monitoringBaseForMarket(market = resolveArgusMarket()) {
  return monitoringRootForMarket(market)
}

loadMonitoringEnv()

export const ARGUS_MARKET = resolveArgusMarket()
export const MONITORING_BASE = monitoringBaseForMarket(ARGUS_MARKET)

export function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function utcDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLIS_PER_DAY)
}

function weekCodeForDate(date) {
  const offsetDays = utcDayNumber(date) - Math.floor(BASE_WEEK_START_UTC / MILLIS_PER_DAY)
  const weekNumber = Math.floor(offsetDays / 7) + 1
  return `W${String(weekNumber).padStart(2, '0')}`
}

export function parseIsoDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  return new Date(year, monthIndex, day)
}

export function weekContextForEndDate(endDate) {
  const weekEndDate = parseIsoDate(endDate)
  const weekStartDate = new Date(weekEndDate)
  weekStartDate.setDate(weekStartDate.getDate() - 6)

  return {
    weekCode: weekCodeForDate(weekStartDate),
    weekStart: formatDate(weekStartDate),
    weekEnd: formatDate(weekEndDate),
  }
}

export function weekContextForRange(startDate, endDate) {
  const weekStartDate = parseIsoDate(startDate)
  const weekEndDate = parseIsoDate(endDate)

  const startDay = utcDayNumber(weekStartDate)
  const endDay = utcDayNumber(weekEndDate)
  if (endDay - startDay !== 6) {
    throw new Error(`Expected a 7-day weekly range, received ${startDate}..${endDate}`)
  }

  return {
    weekCode: weekCodeForDate(weekStartDate),
    weekStart: formatDate(weekStartDate),
    weekEnd: formatDate(weekEndDate),
  }
}

export function latestCompleteWeek() {
  const today = new Date()
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const day = todayLocal.getDay()
  const daysBackToCompletedSaturday = day === 6 ? 7 : (day + 1) % 7
  const weekEndDate = new Date(todayLocal)
  weekEndDate.setDate(weekEndDate.getDate() - daysBackToCompletedSaturday)

  const weekStartDate = new Date(weekEndDate)
  weekStartDate.setDate(weekStartDate.getDate() - 6)

  return {
    weekCode: weekCodeForDate(weekStartDate),
    weekStart: formatDate(weekStartDate),
    weekEnd: formatDate(weekEndDate),
  }
}

export function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function writeCsv(file, headers, rows) {
  ensureDir(path.dirname(file))
  const output = [headers.join(',')]
  for (const row of rows) {
    output.push(headers.map((header) => csvEscape(row?.[header] ?? '')).join(','))
  }
  fs.writeFileSync(file, `${output.join('\n')}\n`)
  enqueueOutputFile(file)
}

export function writeTextFile(file, content) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content)
  enqueueOutputFile(file)
}

export function enqueueOutputFile(file) {
  enqueueDriveSync({ market: ARGUS_MARKET, localPath: file })
}

export function flattenObject(value, prefix = '', out = {}) {
  if (value === null || value === undefined) return out

  if (Array.isArray(value)) {
    const allPrimitive = value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
    if (allPrimitive) {
      out[prefix] = value.filter((item) => item !== null && item !== undefined).join('|')
    } else {
      out[prefix] = JSON.stringify(value)
    }
    return out
  }

  if (typeof value !== 'object') {
    out[prefix] = value
    return out
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (nested === null || nested === undefined) {
      out[nextKey] = ''
      continue
    }
    if (typeof nested === 'object') {
      flattenObject(nested, nextKey, out)
    } else {
      out[nextKey] = nested
    }
  }

  return out
}

export function flattenRows(rows) {
  const flattened = []
  const headers = []
  const headerSet = new Set()

  for (const row of rows) {
    const flat = flattenObject(row)
    flattened.push(flat)
    for (const key of Object.keys(flat)) {
      if (headerSet.has(key)) continue
      headerSet.add(key)
      headers.push(key)
    }
  }

  return { headers, rows: flattened }
}

function hasRowValue(value) {
  return value !== null && value !== undefined && String(value) !== ''
}

export function orderHeaders(canonicalHeaders, rows) {
  const ordered = [...canonicalHeaders]
  const seen = new Set(canonicalHeaders)

  for (const row of rows) {
    for (const [key, value] of Object.entries(row ?? {})) {
      if (seen.has(key)) continue
      if (!hasRowValue(value)) continue
      seen.add(key)
      ordered.push(key)
    }
  }

  return ordered
}
