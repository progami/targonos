#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs'
import {
  MONITORING_BASE,
  ensureDir,
  latestCompleteWeek,
  loadMonitoringEnv,
  requireEnv,
} from './lib/common.mjs'

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const SELLERBOARD_BASE = path.join(WEEKLY_ROOT, 'Sellerboard (API)')
const DASHBOARD_DIR = path.join(SELLERBOARD_BASE, 'SB - Dashboard Report (API)')
const ORDERS_DIR = path.join(SELLERBOARD_BASE, 'SB - Orders Report (API)')

function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function parseCsv(text) {
  if (!text) return { headers: [], rows: [] }

  const parsedRows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field)
      parsedRows.push(row)
      row = []
      field = ''
      continue
    }
    if (char === '\r') continue

    field += char
  }

  if (field.length || row.length) {
    row.push(field)
    parsedRows.push(row)
  }

  if (!parsedRows.length) return { headers: [], rows: [] }

  const headers = parsedRows[0]
  const rows = []
  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const values = parsedRows[rowIndex]
    if (!values.length || (values.length === 1 && values[0] === '')) continue

    const parsed = {}
    for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
      parsed[headers[headerIndex]] = values[headerIndex] ?? ''
    }
    rows.push(parsed)
  }

  return { headers, rows }
}

function stringifyCsv(headers, rows) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }
  return `${lines.join('\n')}\n`
}

function parseUsDateToIso(value, columnName) {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (!match) {
    throw new Error(`Sellerboard row has invalid ${columnName}: ${text}`)
  }
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  const year = match[3]
  return `${year}-${month}-${day}`
}

function filterRowsToWeek(rows, dateColumn, weekStart, weekEnd) {
  const filtered = []
  for (const row of rows) {
    const isoDate = parseUsDateToIso(row[dateColumn], dateColumn)
    if (isoDate >= weekStart && isoDate <= weekEnd) filtered.push(row)
  }
  return filtered
}

async function downloadCsv(url) {
  const response = await fetch(url)
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Sellerboard download failed: ${response.status} ${body.slice(0, 400)}`)
  }
  return body
}

function writeFile(file, content) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`)
}

async function main() {
  const { dryRun } = parseArgs()
  const week = latestCompleteWeek()
  const weekPrefix = `${week.weekCode}_${week.weekEnd}`
  const scopeLabel = `${week.weekCode} ${week.weekStart}..${week.weekEnd}`

  ensureDir(DASHBOARD_DIR)
  ensureDir(ORDERS_DIR)

  if (dryRun) {
    console.log(`[Sellerboard][dry-run] scope=${scopeLabel}`)
    console.log(`[Sellerboard][dry-run] ${path.join(DASHBOARD_DIR, `${weekPrefix}_SB-Dashboard.csv`)}`)
    console.log(`[Sellerboard][dry-run] ${path.join(ORDERS_DIR, `${weekPrefix}_SB-Orders.csv`)}`)
    return
  }

  loadMonitoringEnv()

  const dashboardUrl = requireEnv('SELLERBOARD_US_DASHBOARD_REPORT_URL')
  const ordersUrl = requireEnv('SELLERBOARD_US_ORDERS_REPORT_URL')

  const dashboardCsvRaw = await downloadCsv(dashboardUrl)
  const ordersCsvRaw = await downloadCsv(ordersUrl)

  const dashboardParsed = parseCsv(dashboardCsvRaw)
  const ordersParsed = parseCsv(ordersCsvRaw)

  if (!dashboardParsed.headers.includes('Date')) {
    throw new Error('Sellerboard dashboard CSV missing Date column')
  }
  if (!ordersParsed.headers.includes('PurchaseDate(UTC)')) {
    throw new Error('Sellerboard orders CSV missing PurchaseDate(UTC) column')
  }

  const dashboardRows = filterRowsToWeek(dashboardParsed.rows, 'Date', week.weekStart, week.weekEnd)
  const ordersRows = filterRowsToWeek(ordersParsed.rows, 'PurchaseDate(UTC)', week.weekStart, week.weekEnd)

  const dashboardCsv = stringifyCsv(dashboardParsed.headers, dashboardRows)
  const ordersCsv = stringifyCsv(ordersParsed.headers, ordersRows)

  const dashboardFile = path.join(DASHBOARD_DIR, `${weekPrefix}_SB-Dashboard.csv`)
  const ordersFile = path.join(ORDERS_DIR, `${weekPrefix}_SB-Orders.csv`)
  writeFile(dashboardFile, dashboardCsv)
  writeFile(ordersFile, ordersCsv)

  const manifestPath = path.join(SELLERBOARD_BASE, `${weekPrefix}_SB-Manifest.json`)
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        week,
        filters: {
          dashboardDateColumn: 'Date',
          ordersDateColumn: 'PurchaseDate(UTC)',
        },
        counts: {
          dashboardRowsBeforeFilter: dashboardParsed.rows.length,
          dashboardRowsAfterFilter: dashboardRows.length,
          ordersRowsBeforeFilter: ordersParsed.rows.length,
          ordersRowsAfterFilter: ordersRows.length,
        },
        files: {
          dashboardFile,
          ordersFile,
        },
      },
      null,
      2,
    ),
  )

  console.log(`[Sellerboard] Completed ${scopeLabel}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
