import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { warehouseListSelect } from './list-query'

test('warehouse list query excludes billingConfig from the selected columns', () => {
  assert.equal('billingConfig' in warehouseListSelect, false)
})

test('warehouses route reads through warehouseListSelect instead of an implicit scalar select', () => {
  const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8')
  assert.match(routeSource, /select:\s*warehouseListSelect/)
})
