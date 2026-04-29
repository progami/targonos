import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readRouteSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('case market pages keep supported-market data load failures out of Next 404s', () => {
  const latestMarketSource = readRouteSource('./[market]/page.tsx')
  const datedMarketSource = readRouteSource('./[market]/[reportDate]/page.tsx')

  assert.match(latestMarketSource, /resolveLatestCaseReportRouteState/)
  assert.match(latestMarketSource, /CasesUnavailablePage/)
  assert.doesNotMatch(latestMarketSource, /try\s*\{/)
  assert.doesNotMatch(latestMarketSource, /catch\s*\{\s*notFound\(\)\s*;?\s*\}/)

  assert.match(datedMarketSource, /resolveDatedCaseReportRouteState/)
  assert.match(datedMarketSource, /CasesUnavailablePage/)
  assert.doesNotMatch(datedMarketSource, /try\s*\{/)
  assert.doesNotMatch(datedMarketSource, /catch\s*\{\s*notFound\(\)\s*;?\s*\}/)
})
