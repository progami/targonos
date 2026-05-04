import test from 'node:test'
import assert from 'node:assert/strict'

import { getBulkSelectionAction } from './bulk-selection'

test('getBulkSelectionAction selects all when nothing is selected', () => {
  assert.equal(getBulkSelectionAction(10, 0), 'select-all')
})

test('getBulkSelectionAction selects all when the selection is partial', () => {
  assert.equal(getBulkSelectionAction(10, 4), 'select-all')
})

test('getBulkSelectionAction clears all when everything is selected', () => {
  assert.equal(getBulkSelectionAction(10, 10), 'clear-all')
})
