#!/usr/bin/env node

import fs from 'node:fs'

const STATE_PATH = '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Hourly/Listing Attributes (API)/latest_state.json'

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
