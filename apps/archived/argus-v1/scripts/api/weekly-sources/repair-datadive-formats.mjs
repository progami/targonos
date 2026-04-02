#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { MONITORING_BASE, writeCsv } from './lib/common.mjs'

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const DATADIVE_BASE = path.join(WEEKLY_ROOT, 'Datadive (API)')
const KEYWORDS_DIR = path.join(DATADIVE_BASE, 'DD-Keywords - Datadive Keywords (API)')
const COMPETITORS_DIR = path.join(DATADIVE_BASE, 'DD-Competitors - Datadive Competitors (API)')
const RANK_RADAR_DIR = path.join(DATADIVE_BASE, 'Rank Radar - Datadive Rank Radar (API)')

const KEYWORD_BASE_HEADERS = ['keyword', 'searchVolume', 'relevancy']
const COMPETITOR_HEADERS = [
  'imageUrl',
  'brand',
  'asin',
  'rating',
  'reviewCount',
  'listingCreationDate',
  'listingCreationDateEvaluation',
  'price',
  'sales',
  'revenue',
  'outlierKws',
  'outlierSV',
  'kwRankedOnP1',
  'kwRankedOnP1Percent',
  'kwRankedOnP1Evaluation',
  'svRankedOnP1',
  'svRankedOnP1Percent',
  'svRankedOnP1Evaluation',
  'advertisedKws',
  'advertisedKwsPercent',
  'advertisedKwsEvaluation',
  'tosKwsAds',
  'tosKwsAdsPercent',
  'tosKwsAdsEvaluation',
  'tosSvAds',
  'tosSvAdsPercent',
  'tosSvAdsEvaluation',
  'fulfillment',
  'numberOfActiveSellers',
  'sellerCountry',
  'listingRankingJuice.value',
  'listingRankingJuice.contribution.title.rankingJuice',
  'listingRankingJuice.contribution.title.weight',
  'listingRankingJuice.contribution.title.listingRankingJuice',
  'listingRankingJuice.contribution.bullets.rankingJuice',
  'listingRankingJuice.contribution.bullets.weight',
  'listingRankingJuice.contribution.bullets.listingRankingJuice',
  'listingRankingJuice.contribution.description.rankingJuice',
  'listingRankingJuice.contribution.description.weight',
  'listingRankingJuice.contribution.description.listingRankingJuice',
  'numberOfVariations',
  'asinCatalog',
  'category',
  'categoryTree',
]
const RANK_RADAR_HEADERS = [
  'Week Code',
  'Week Start',
  'Week End',
  'Niche ID',
  'Rank Radar ID',
  'Hero ASIN',
  'Keyword ID',
  'Keyword',
  'Search Volume',
  'Relevancy',
  'Rank Date',
  'Organic Rank',
  'Impression Rank',
]

function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
  }
}

function csvFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.csv'))
    .map((entry) => path.join(dir, entry.name))
    .sort()
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false
  const source = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(value)
      value = ''
      continue
    }

    if (char === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
      continue
    }

    if (char === '\r') continue
    value += char
  }

  if (value.length || row.length) {
    row.push(value)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell !== ''))
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'))
}

function toObjects(header, rows) {
  return rows.map((cells) => {
    const obj = {}
    for (let index = 0; index < header.length; index += 1) {
      obj[header[index]] = cells[index] ?? ''
    }
    return obj
  })
}

function parseNumber(value) {
  const text = String(value).trim()
  if (!text) return ''
  const cleaned = text.replace(/[$,%]/g, '').replace(/,/g, '')
  if (!/[0-9]/.test(cleaned)) return ''
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : ''
}

function parsePercent(value) {
  const parsed = parseNumber(value)
  if (parsed === '') return ''
  return parsed / 100
}

function blankCompetitorRow() {
  return Object.fromEntries(COMPETITOR_HEADERS.map((header) => [header, '']))
}

function keywordHeaders(files) {
  const asinSet = new Set()
  for (const file of files) {
    const [header] = readCsv(file)
    if (!header?.length) continue
    const first = header[0]
    if (first === 'keyword') {
      for (const asin of header.slice(KEYWORD_BASE_HEADERS.length)) asinSet.add(asin)
      continue
    }
    for (const asin of header.slice(6)) asinSet.add(asin)
  }
  return [...KEYWORD_BASE_HEADERS, ...[...asinSet].sort()]
}

function normalizeKeywordFile(file, headers, dryRun) {
  const rows = readCsv(file)
  if (!rows.length) return

  const [header, ...dataRows] = rows
  const outputRows = []

  if (header[0] === 'keyword') {
    for (const row of toObjects(header, dataRows)) {
      const output = {
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        relevancy: row.relevancy,
      }
      for (const asin of headers.slice(KEYWORD_BASE_HEADERS.length)) output[asin] = row[asin] ?? ''
      outputRows.push(output)
    }
  } else {
    const asinColumns = header.slice(6)
    for (const cells of dataRows) {
      if (!cells.some((value) => value)) continue
      const output = {
        keyword: cells[1] ?? '',
        searchVolume: cells[2] ?? '',
        relevancy: cells[3] ?? '',
      }
      for (let index = 0; index < asinColumns.length; index += 1) {
        output[asinColumns[index]] = cells[index + 6] ?? ''
      }
      for (const asin of headers.slice(KEYWORD_BASE_HEADERS.length)) output[asin] = output[asin] ?? ''
      outputRows.push(output)
    }
  }

  if (dryRun) {
    console.log(`[Datadive repair][dry-run] keywords ${path.basename(file)} -> ${headers.length} columns`)
    return
  }

  writeCsv(file, headers, outputRows)
}

function normalizeCompetitorFile(file, dryRun) {
  const rows = readCsv(file)
  if (!rows.length) return

  const [header, ...dataRows] = rows
  const outputRows = []

  if (header[0] === 'imageUrl') {
    for (const row of toObjects(header, dataRows)) {
      const output = {}
      for (const key of COMPETITOR_HEADERS) output[key] = row[key] ?? ''
      outputRows.push(output)
    }
  } else {
    const asins = header.slice(6)
    const outputByAsin = new Map(asins.map((asin) => [asin, { ...blankCompetitorRow(), asin }]))

    for (const cells of dataRows) {
      const label = cells[1] ?? ''
      for (let index = 0; index < asins.length; index += 1) {
        const asin = asins[index]
        const row = outputByAsin.get(asin)
        const rawValue = cells[index + 6] ?? ''

        switch (label) {
          case 'Brand':
            row.brand = rawValue
            break
          case 'Variations':
            row.numberOfVariations = parseNumber(rawValue)
            break
          case 'Rating':
            row.rating = parseNumber(rawValue)
            break
          case 'Review Count':
            row.reviewCount = parseNumber(rawValue)
            break
          case 'Price':
            row.price = parseNumber(rawValue)
            break
          case 'Sales':
            row.sales = parseNumber(rawValue)
            break
          case 'Revenue':
            row.revenue = parseNumber(rawValue)
            break
          case 'KWs on P1':
            row.kwRankedOnP1 = parseNumber(rawValue)
            break
          case 'SV on P1 (Share of Voice)':
            row.svRankedOnP1 = parseNumber(rawValue)
            break
          case "Seller's Country":
            row.sellerCountry = rawValue
            break
          case 'ASIN':
            row.asin = rawValue
            break
          case 'Outlier Search Volume':
            row.outlierSV = parseNumber(rawValue)
            break
          case 'Outlier Keywords':
            row.outlierKws = parseNumber(rawValue)
            break
          case 'Fulfillment':
            row.fulfillment = rawValue
            break
          case 'KWs on P1 Percentage':
            row.kwRankedOnP1Percent = parsePercent(rawValue)
            break
          case 'SV on P1 Percentage':
            row.svRankedOnP1Percent = parsePercent(rawValue)
            break
          case 'Advertised KWs':
            row.advertisedKws = parseNumber(rawValue)
            break
          case 'Advertised KWs Percentage':
            row.advertisedKwsPercent = parsePercent(rawValue)
            break
          case 'KWs with TOS Ads':
            row.tosKwsAds = parseNumber(rawValue)
            break
          case 'KWs with TOS Ads Percentage':
            row.tosKwsAdsPercent = parsePercent(rawValue)
            break
          case 'SV with TOS Ads':
            row.tosSvAds = parseNumber(rawValue)
            break
          case 'SV with TOS Ads Percentage':
            row.tosSvAdsPercent = parsePercent(rawValue)
            break
          case 'Category':
            row.category = rawValue
            break
        }
      }
    }

    outputRows.push(...outputByAsin.values())
  }

  if (dryRun) {
    console.log(`[Datadive repair][dry-run] competitors ${path.basename(file)} -> ${COMPETITOR_HEADERS.length} columns`)
    return
  }

  writeCsv(file, COMPETITOR_HEADERS, outputRows)
}

function normalizeRankRadarFile(file, dryRun) {
  const rows = readCsv(file)
  if (!rows.length) return

  const [header, ...dataRows] = rows
  const outputRows = toObjects(header, dataRows).map((row) => {
    const output = {}
    for (const key of RANK_RADAR_HEADERS) output[key] = row[key] ?? ''
    return output
  })

  if (dryRun) {
    console.log(`[Datadive repair][dry-run] rank-radar ${path.basename(file)} -> ${RANK_RADAR_HEADERS.length} columns`)
    return
  }

  writeCsv(file, RANK_RADAR_HEADERS, outputRows)
}

function main() {
  const { dryRun } = parseArgs()
  const keywordFiles = csvFiles(KEYWORDS_DIR)
  const competitorFiles = csvFiles(COMPETITORS_DIR)
  const rankRadarFiles = csvFiles(RANK_RADAR_DIR)
  const headers = keywordHeaders(keywordFiles)

  for (const file of keywordFiles) normalizeKeywordFile(file, headers, dryRun)
  for (const file of competitorFiles) normalizeCompetitorFile(file, dryRun)
  for (const file of rankRadarFiles) normalizeRankRadarFile(file, dryRun)

  console.log(
    `[Datadive repair] ${dryRun ? 'validated' : 'normalized'} keywords=${keywordFiles.length} competitors=${competitorFiles.length} rankRadar=${rankRadarFiles.length}`,
  )
}

main()
