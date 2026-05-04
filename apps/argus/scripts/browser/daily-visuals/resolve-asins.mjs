#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../../..')
const MARKET = parseMarket(readMarketArg())
const STATE_PATH = path.join(
  monitoringRootForMarket(MARKET),
  'Hourly',
  'Listing Attributes (API)',
  'latest_state.json',
)

function readMarketArg() {
  const argv = process.argv.slice(2)
  const index = argv.indexOf('--market')
  if (index < 0) return process.env.ARGUS_MARKET
  return argv[index + 1]
}

function parseMarket(raw) {
  if (raw === undefined) return 'us'
  const value = String(raw).trim().toLowerCase()
  if (value === '') return 'us'
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported Argus market: ${raw}`)
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\\\n|\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator < 0) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = process.env[key] ?? value
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function monitoringRootForMarket(market) {
  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))
  return path.join(requireEnv(`ARGUS_SALES_ROOT_${market.toUpperCase()}`), 'Monitoring')
}

function normalizeBrand(brandRaw) {
  const brand = String(brandRaw || '').trim()
  if (!brand) return ''

  const key = brand.toLowerCase()
  const canonical = {
    'caelum star': 'Caelum Star',
    'caelum star ': 'Caelum Star',
    axgatoxe: 'Axgatoxe',
    ecotez: 'Ecotez',
  }[key]

  if (canonical) return canonical

  return brand.replace(/\s+/g, ' ')
}

function main() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(`Missing latest_state.json at: ${STATE_PATH}`)
  }

  const raw = fs.readFileSync(STATE_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const byAsin = parsed?.by_asin
  if (!byAsin || typeof byAsin !== 'object') {
    throw new Error('latest_state.json missing by_asin map')
  }

  const rows = []
  for (const [asin, row] of Object.entries(byAsin)) {
    if (!asin || !row || typeof row !== 'object') continue
    const brand = normalizeBrand(row.brand)
    if (!brand) {
      throw new Error(`Missing brand for ASIN ${asin} in latest_state.json`)
    }
    rows.push({ asin, brand })
  }

  if (!rows.length) {
    throw new Error('No ASINs found in latest_state.json by_asin map')
  }

  rows.sort((left, right) => {
    if (left.brand !== right.brand) return left.brand.localeCompare(right.brand)
    return left.asin.localeCompare(right.asin)
  })

  // TSV output: asin\tbrand
  process.stdout.write(rows.map((row) => `${row.asin}\t${row.brand}`).join('\n'))
  process.stdout.write('\n')
}

main()
