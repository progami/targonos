import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const categoryInsights = readFileSync(new URL('./weekly-category-insights/collect.sh', import.meta.url), 'utf8')
const poe = readFileSync(new URL('./weekly-poe/collect.sh', import.meta.url), 'utf8')
const scaleInsights = readFileSync(new URL('./weekly-scaleinsights/collect.sh', import.meta.url), 'utf8')
const brandMetrics = readFileSync(new URL('./weekly-brand-metrics/collect.sh', import.meta.url), 'utf8')
const runWeekly = readFileSync(new URL('./run-weekly.sh', import.meta.url), 'utf8')

test('weekly browser collectors require market-specific source config', () => {
  assert.match(categoryInsights, /require_market_env ARGUS_CATEGORY_INSIGHTS_URL/)
  assert.match(categoryInsights, /require_market_env ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID/)
  assert.match(poe, /require_market_env ARGUS_POE_TARGET_URL_BASE/)
  assert.match(scaleInsights, /require_market_env ARGUS_SCALEINSIGHTS_COUNTRY_CODE/)
  assert.match(brandMetrics, /require_market_env ARGUS_BRAND_METRICS_URL_BASE/)
})

test('weekly browser collectors no longer hardcode US-only source ids', () => {
  assert.doesNotMatch(poe, /84dd9c9ba70c2b6df8c7bacb37f9a326/)
  assert.doesNotMatch(scaleInsights, /COUNTRY_CODE="US"/)
  assert.doesNotMatch(brandMetrics, /ENTITY2JBRT701DBI1P/)
  assert.doesNotMatch(categoryInsights, /TARGET_MARKETPLACE_ID="ATVPDKIKX0DER"/)
})

test('weekly browser runner passes market-specific detail logs into child collectors', () => {
  assert.match(runWeekly, /argus_tmp_log_path weekly-category-insights/)
  assert.match(runWeekly, /ARGUS_CATEGORY_INSIGHTS_LOG/)
  assert.match(runWeekly, /argus_tmp_log_path weekly-poe/)
  assert.match(runWeekly, /ARGUS_POE_LOG/)
  assert.match(runWeekly, /argus_tmp_log_path weekly-scaleinsights/)
  assert.match(runWeekly, /ARGUS_SCALEINSIGHTS_LOG/)
  assert.match(runWeekly, /argus_tmp_log_path weekly-brand-metrics/)
  assert.match(runWeekly, /ARGUS_BRAND_METRICS_LOG/)
})

test('ScaleInsights reruns reuse an existing same-week XLSX', () => {
  assert.match(scaleInsights, /target_file="\$DEST\/\$\{PREFIX\}_SI-KeywordRanking\.xlsx"/)
  assert.match(scaleInsights, /target_size="\$\(stat -f '%z' "\$target_file"\)"/)
  assert.match(scaleInsights, /Saved: \$\{PREFIX\}_SI-KeywordRanking\.xlsx already current/)
})
