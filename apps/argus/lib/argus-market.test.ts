import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  ARGUS_MARKETS,
  appendMarketParam,
  getArgusMarketConfig,
  parseArgusMarket,
} from './argus-market'

test('parseArgusMarket defaults to US and accepts supported slugs', () => {
  assert.equal(parseArgusMarket(null), 'us')
  assert.equal(parseArgusMarket(''), 'us')
  assert.equal(parseArgusMarket('us'), 'us')
  assert.equal(parseArgusMarket('uk'), 'uk')
  assert.deepEqual(ARGUS_MARKETS.map((market) => market.slug), ['us', 'uk'])
})

test('parseArgusMarket rejects unsupported slugs', () => {
  assert.throws(
    () => parseArgusMarket('eu'),
    /Unsupported Argus market: eu/,
  )
})

test('getArgusMarketConfig resolves market-specific sales and WPR paths from env', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'argus-market-config-'))
  const usSalesRoot = path.join(root, 'Dust Sheets - US', 'Sales')
  const ukSalesRoot = path.join(root, 'Dust Sheets - UK', 'Sales')
  const usWprDataDir = path.join(usSalesRoot, 'WPR', 'wpr-workspace', 'output')
  const ukWprDataDir = path.join(ukSalesRoot, 'WPR', 'wpr-workspace', 'output')

  process.env.ARGUS_SALES_ROOT_US = usSalesRoot
  process.env.ARGUS_SALES_ROOT_UK = ukSalesRoot
  process.env.WPR_DATA_DIR_US = usWprDataDir
  process.env.WPR_DATA_DIR_UK = ukWprDataDir

  assert.deepEqual(getArgusMarketConfig('uk'), {
    slug: 'uk',
    label: 'UK',
    salesRoot: ukSalesRoot,
    monitoringRoot: path.join(ukSalesRoot, 'Monitoring'),
    wprRoot: path.join(ukSalesRoot, 'WPR'),
    wprDataDir: ukWprDataDir,
  })
})

test('appendMarketParam preserves US default and appends UK explicitly', () => {
  assert.equal(appendMarketParam('/api/wpr/weeks', 'us'), '/api/wpr/weeks')
  assert.equal(appendMarketParam('/api/wpr/weeks', 'uk'), '/api/wpr/weeks?market=uk')
  assert.equal(appendMarketParam('/api/monitoring/bootstrap?window=24h', 'uk'), '/api/monitoring/bootstrap?window=24h&market=uk')
})
