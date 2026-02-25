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

  const dashboardCsv = await downloadCsv(dashboardUrl)
  const ordersCsv = await downloadCsv(ordersUrl)

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
