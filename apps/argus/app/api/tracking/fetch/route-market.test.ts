import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('tracking fetch route scopes ASINs and SP-API calls by Argus market', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

  assert.match(source, /parseArgusMarket\(request\.nextUrl\.searchParams\.get\('market'\)\)/)
  assert.match(source, /marketplaceForMarket\(market\)/)
  assert.match(source, /normalizeTrackingAsinSeeds\(\(body as \{ trackedAsins\?: unknown \}\)\.trackedAsins\)/)
  assert.match(source, /ensureTrackedAsins\(marketplace,\s*trackedAsins\)/)
  assert.match(source, /where:\s*\{\s*enabled:\s*true,\s*marketplace\s*\}/s)
  assert.match(source, /status:\s*'FAILED'/)
  assert.match(source, /No enabled tracked ASINs configured/)
  assert.match(source, /getCompetitivePricing\(asinStrings,\s*market\)/)
  assert.match(source, /getCatalogItemWithRanks\(asin,\s*market\)/)
})
