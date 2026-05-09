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

test('getArgusMarketConfig resolves market-specific local monitoring and WPR paths from env', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'argus-market-config-'))
  const usMonitoringRoot = path.join(root, 'argus-monitoring', 'us')
  const ukMonitoringRoot = path.join(root, 'argus-monitoring', 'uk')
  const usWprRoot = path.join(root, 'argus-wpr', 'us', 'WPR')
  const ukWprRoot = path.join(root, 'argus-wpr', 'uk', 'WPR')
  const usWprDataDir = path.join(usWprRoot, 'wpr-workspace', 'output')
  const ukWprDataDir = path.join(ukWprRoot, 'wpr-workspace', 'output')

  process.env.ARGUS_MONITORING_ROOT_US = usMonitoringRoot
  process.env.ARGUS_MONITORING_ROOT_UK = ukMonitoringRoot
  process.env.WPR_DATA_DIR_US = usWprDataDir
  process.env.WPR_DATA_DIR_UK = ukWprDataDir

  assert.deepEqual(getArgusMarketConfig('uk'), {
    slug: 'uk',
    label: 'UK',
    monitoringRoot: ukMonitoringRoot,
    wprRoot: ukWprRoot,
    wprDataDir: ukWprDataDir,
  })
})

test('getArgusMarketConfig rejects Google Drive mounted roots', () => {
  process.env.ARGUS_MONITORING_ROOT_US = '/Users/test/Library/CloudStorage/GoogleDrive-test/Shared drives/Dust Sheets - US/Sales/Monitoring'
  process.env.WPR_DATA_DIR_US = '/tmp/argus-wpr/us/WPR/wpr-workspace/output'

  assert.throws(
    () => getArgusMarketConfig('us'),
    /ARGUS_MONITORING_ROOT_US must be local, not a Google Drive mount/,
  )
})

test('appendMarketParam preserves US default and appends UK explicitly', () => {
  assert.equal(appendMarketParam('/api/wpr/weeks', 'us'), '/api/wpr/weeks')
  assert.equal(appendMarketParam('/api/wpr/weeks', 'uk'), '/api/wpr/weeks?market=uk')
  assert.equal(appendMarketParam('/api/monitoring/bootstrap?window=24h', 'uk'), '/api/monitoring/bootstrap?window=24h&market=uk')
})
