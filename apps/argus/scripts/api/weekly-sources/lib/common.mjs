import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const REPO_ROOT = path.resolve(__dirname, '../../../../../../')
export const MONITORING_BASE = '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000
const BASE_WEEK_START_UTC = Date.UTC(2025, 11, 28)

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\\\n|\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const cleaned = trimmed.replace(/^\d+→/, '')
      const separator = cleaned.indexOf('=')
      if (separator < 0) continue

      const key = cleaned.slice(0, separator).trim()
      let value = cleaned.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (value.endsWith('$')) value = value.slice(0, -1)

      if (!process.env[key]) process.env[key] = value
    }
  }
}

export function loadMonitoringEnv() {
  // Argus carries the concrete monitoring secrets; Talos now carries Bitwarden refs.
  // Load Argus first so the shared loader does not lock in unresolved bw:// placeholders.
  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/talos/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/xplan/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, '.env.local'))
}

export function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

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
