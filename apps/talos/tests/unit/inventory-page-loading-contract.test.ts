import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('inventory page renders loading state before reading summary totals', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/operations/inventory/page.tsx'),
    'utf8',
  )

  const loadingGuardIndex = source.indexOf('if (loading) {')
  const summaryTotalIndex = source.indexOf('summary.totalSkuCount')

  assert.notEqual(summaryTotalIndex, -1, 'inventory page should render summary total SKU count')
  assert.notEqual(loadingGuardIndex, -1, 'inventory page must guard the loading state')
  assert.equal(
    loadingGuardIndex < summaryTotalIndex,
    true,
    'inventory page must not read summary totals while balances are still loading',
  )
})
