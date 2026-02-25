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
  writeCsv,
} from './lib/common.mjs'

const NICHE_ID = '79IvywKLfF'
const HERO_ASIN = 'B09HXC3NL8'

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const DATADIVE_BASE = path.join(WEEKLY_ROOT, 'Datadive (API)')
const KEYWORDS_DIR = path.join(DATADIVE_BASE, 'DD-Keywords - Datadive Keywords (API)')
const COMPETITORS_DIR = path.join(DATADIVE_BASE, 'DD-Competitors - Datadive Competitors (API)')
const RANK_RADAR_DIR = path.join(DATADIVE_BASE, 'Rank Radar - Datadive Rank Radar (API)')

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

function writeKeywordCsv(file, keywords) {
  const asinSet = new Set()
  for (const keyword of keywords) {
    for (const asin of Object.keys(keyword?.asinRanks || {})) asinSet.add(asin)
  }
  const asinColumns = [...asinSet].sort()
  const headers = ['keyword', 'searchVolume', 'relevancy', ...asinColumns]
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
  const { headers, rows } = flattenRows(competitors)
  const safeHeaders = headers.length ? headers : ['asin']
  writeCsv(file, safeHeaders, rows)
}

function writeRankRadarCsv(file, week, rankRadarId, rows) {
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
        'Niche ID': NICHE_ID,
        'Rank Radar ID': rankRadarId,
        'Hero ASIN': HERO_ASIN,
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

  const keywordsResponse = await datadiveJson(`https://api.datadive.tools/v1/niches/${NICHE_ID}/keywords`, apiKey)
  const competitorsResponse = await datadiveJson(`https://api.datadive.tools/v1/niches/${NICHE_ID}/competitors`, apiKey)
  const rankRadarList = await datadiveJson(`https://api.datadive.tools/v1/niches/rank-radars?nicheId=${NICHE_ID}`, apiKey)

  const keywords = Array.isArray(keywordsResponse?.data?.keywords) ? keywordsResponse.data.keywords : []
  const competitors = Array.isArray(competitorsResponse?.data?.competitors) ? competitorsResponse.data.competitors : []
  const rankRadars = Array.isArray(rankRadarList?.data?.data) ? rankRadarList.data.data : []

  const selectedRankRadar = rankRadars.find((row) => row?.asin?.asin === HERO_ASIN) || rankRadars[0]
  if (!selectedRankRadar?.id) {
    throw new Error('No Datadive rank radar found for niche')
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
  writeRankRadarCsv(rankRadarFile, week, selectedRankRadar.id, rankRows)

  const manifestPath = path.join(DATADIVE_BASE, `${weekPrefix}_DD-Manifest.json`)
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        week,
        nicheId: NICHE_ID,
        heroAsin: HERO_ASIN,
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
