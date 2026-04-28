#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {
  MONITORING_BASE,
  ensureDir,
  flattenRows,
  latestCompleteWeek,
  loadMonitoringEnv,
  requireEnv,
  wprSourceConfigForMarket,
  writeCsv,
} from './lib/common.mjs'

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

function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
  }
}

async function datadiveJson(url, apiKey) {
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey },
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Datadive request failed: ${response.status} ${url} ${body.slice(0, 400)}`)
  }
  return JSON.parse(body)
}

function parseCsvLine(line) {
  const values = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
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
      values.push(value)
      value = ''
      continue
    }

    value += char
  }

  values.push(value)
  return values
}

function keywordAsinColumnsFromExistingFiles() {
  const asinSet = new Set()
  const files = fs
    .readdirSync(KEYWORDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.csv'))
    .map((entry) => path.join(KEYWORDS_DIR, entry.name))

  for (const file of files) {
    const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0]
    if (!firstLine) continue

    const header = parseCsvLine(firstLine).map((value) => value.replace(/^\uFEFF/, ''))
    if (header[0] === 'keyword') {
      for (const asin of header.slice(KEYWORD_BASE_HEADERS.length)) asinSet.add(asin)
      continue
    }

    for (const asin of header.slice(6)) asinSet.add(asin)
  }

  return asinSet
}

function writeKeywordCsv(file, keywords) {
  const asinSet = new Set()
  for (const keyword of keywords) {
    for (const asin of Object.keys(keyword?.asinRanks || {})) asinSet.add(asin)
  }
  for (const asin of keywordAsinColumnsFromExistingFiles()) asinSet.add(asin)

  const asinColumns = [...asinSet].sort()
  const headers = [...KEYWORD_BASE_HEADERS, ...asinColumns]
  const rows = keywords.map((keyword) => {
    const row = {
      keyword: keyword?.keyword ?? '',
      searchVolume: keyword?.searchVolume ?? '',
      relevancy: keyword?.relevancy ?? '',
    }
    for (const asin of asinColumns) {
      row[asin] = keyword?.asinRanks?.[asin] ?? ''
    }
    return row
  })
  writeCsv(file, headers, rows)
}

function writeCompetitorsCsv(file, competitors) {
  const { rows } = flattenRows(competitors)
  writeCsv(file, COMPETITOR_HEADERS, rows)
}

function writeRankRadarCsv(file, week, sourceConfig, rankRadarId, rows) {
  const headers = [
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

  const outputRows = []
  for (const keywordRow of rows) {
    const keywordId = keywordRow?.id ?? ''
    const keyword = keywordRow?.keyword ?? ''
    const searchVolume = keywordRow?.searchVolume ?? ''
    const relevancy = keywordRow?.relevancy ?? ''
    const ranks = Array.isArray(keywordRow?.ranks) ? keywordRow.ranks : []

    for (const rank of ranks) {
      outputRows.push({
        'Week Code': week.weekCode,
        'Week Start': week.weekStart,
        'Week End': week.weekEnd,
        'Niche ID': sourceConfig.datadiveNicheId,
        'Rank Radar ID': rankRadarId,
        'Hero ASIN': sourceConfig.heroAsin,
        'Keyword ID': keywordId,
        Keyword: keyword,
        'Search Volume': searchVolume,
        Relevancy: relevancy,
        'Rank Date': rank?.date ?? '',
        'Organic Rank': rank?.organicRank ?? '',
        'Impression Rank': rank?.impressionRank ?? '',
      })
    }
  }

  writeCsv(file, headers, outputRows)
}

async function main() {
  const { dryRun } = parseArgs()
  const week = latestCompleteWeek()
  const sourceConfig = wprSourceConfigForMarket()
  const weekPrefix = `${week.weekCode}_${week.weekEnd}`
  const scopeLabel = `${week.weekCode} ${week.weekStart}..${week.weekEnd}`

  ensureDir(KEYWORDS_DIR)
  ensureDir(COMPETITORS_DIR)
  ensureDir(RANK_RADAR_DIR)

  if (dryRun) {
    console.log(`[Datadive][dry-run] scope=${scopeLabel}`)
    console.log(`[Datadive][dry-run] ${path.join(KEYWORDS_DIR, `${weekPrefix}_DD-Keywords.csv`)}`)
    console.log(`[Datadive][dry-run] ${path.join(COMPETITORS_DIR, `${weekPrefix}_DD-Competitors.csv`)}`)
    console.log(`[Datadive][dry-run] ${path.join(RANK_RADAR_DIR, `${weekPrefix}_DD-RankRadar.csv`)}`)
    return
  }

  loadMonitoringEnv()
  const apiKey = requireEnv('DATADIVE_API_KEY')

  const keywordsResponse = await datadiveJson(`https://api.datadive.tools/v1/niches/${sourceConfig.datadiveNicheId}/keywords`, apiKey)
  const competitorsResponse = await datadiveJson(`https://api.datadive.tools/v1/niches/${sourceConfig.datadiveNicheId}/competitors`, apiKey)
  const rankRadarList = await datadiveJson(`https://api.datadive.tools/v1/niches/rank-radars?nicheId=${sourceConfig.datadiveNicheId}`, apiKey)

  const keywords = Array.isArray(keywordsResponse?.data?.keywords) ? keywordsResponse.data.keywords : []
  const competitors = Array.isArray(competitorsResponse?.data?.competitors) ? competitorsResponse.data.competitors : []
  const rankRadars = Array.isArray(rankRadarList?.data?.data) ? rankRadarList.data.data : []

  const selectedRankRadar = rankRadars.find((row) => row?.asin?.asin === sourceConfig.heroAsin)
  if (!selectedRankRadar?.id) {
    throw new Error(`No Datadive rank radar found for hero ASIN ${sourceConfig.heroAsin} in niche ${sourceConfig.datadiveNicheId}`)
  }

  const rankRadarDetail = await datadiveJson(
    `https://api.datadive.tools/v1/niches/rank-radars/${selectedRankRadar.id}?startDate=${week.weekStart}&endDate=${week.weekEnd}`,
    apiKey,
  )
  const rankRows = Array.isArray(rankRadarDetail?.data) ? rankRadarDetail.data : []

  const keywordsFile = path.join(KEYWORDS_DIR, `${weekPrefix}_DD-Keywords.csv`)
  const competitorsFile = path.join(COMPETITORS_DIR, `${weekPrefix}_DD-Competitors.csv`)
  const rankRadarFile = path.join(RANK_RADAR_DIR, `${weekPrefix}_DD-RankRadar.csv`)

  writeKeywordCsv(keywordsFile, keywords)
  writeCompetitorsCsv(competitorsFile, competitors)
  writeRankRadarCsv(rankRadarFile, week, sourceConfig, selectedRankRadar.id, rankRows)

  const manifestPath = path.join(DATADIVE_BASE, `${weekPrefix}_DD-Manifest.json`)
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        market: sourceConfig.market,
        week,
        nicheId: sourceConfig.datadiveNicheId,
        heroAsin: sourceConfig.heroAsin,
        selectedRankRadarId: selectedRankRadar.id,
        counts: {
          keywords: keywords.length,
          competitors: competitors.length,
          rankRadarKeywords: rankRows.length,
        },
      },
      null,
      2,
    ),
  )

  console.log(`[Datadive] Completed ${scopeLabel}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
