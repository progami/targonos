import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ROUTES = [
  {
    path: './bootstrap/route.ts',
    readerCall: /getMonitoringBootstrap\(\{\s*market,/s,
  },
  {
    path: './changes/route.ts',
    readerCall: /getMonitoringChanges\(\{\s*market,/s,
  },
  {
    path: './overview/route.ts',
    readerCall: /getMonitoringOverview\(market\)/,
  },
  {
    path: './health/route.ts',
    readerCall: /getMonitoringHealth\(market\)/,
  },
  {
    path: './asins/[asin]/route.ts',
    readerCall: /getMonitoringAsinDetail\(asin,\s*market\)/,
  },
] as const

test('monitoring routes parse and pass Argus market into reader calls', () => {
  for (const route of ROUTES) {
    const source = readFileSync(new URL(route.path, import.meta.url), 'utf8')
    assert.match(source, /parseArgusMarket/)
    assert.match(source, /searchParams\.get\('market'\)/)
    assert.match(source, route.readerCall)
  }
})
