import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('tracking fetch route scopes ASINs and SP-API calls by Argus market', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

  assert.match(source, /parseArgusMarket\(request\.nextUrl\.searchParams\.get\('market'\)\)/)
  assert.match(source, /marketplaceForMarket\(market\)/)
  assert.match(source, /where:\s*\{\s*enabled:\s*true,\s*marketplace\s*\}/s)
  assert.match(source, /getCompetitivePricing\(asinStrings,\s*market\)/)
  assert.match(source, /getCatalogItemWithRanks\(asin,\s*market\)/)
})
