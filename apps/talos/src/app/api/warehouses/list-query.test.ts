import assert from 'node:assert/strict'
import test from 'node:test'

import { warehouseListSelect } from './list-query'

test('warehouse list query excludes billingConfig from the selected columns', () => {
  assert.equal('billingConfig' in warehouseListSelect, false)
})
