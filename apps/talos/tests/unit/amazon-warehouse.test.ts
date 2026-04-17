import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canRegionUseWarehouseCode,
  getAmazonWarehouseCodeForRegion,
  getAmazonWarehouseNameForRegion,
  isAmazonWarehouseCode,
} from '../../src/lib/warehouses/amazon-warehouse'

test('US region resolves the renamed Amazon warehouse code', () => {
  assert.equal(getAmazonWarehouseCodeForRegion('US'), 'AMZN-US')
  assert.equal(getAmazonWarehouseNameForRegion('US'), 'Amazon FBA US')
})

test('UK region resolves the UK Amazon warehouse code', () => {
  assert.equal(getAmazonWarehouseCodeForRegion('UK'), 'AMZN-UK')
  assert.equal(getAmazonWarehouseNameForRegion('UK'), 'Amazon FBA UK')
})

test('Amazon warehouse visibility is region scoped', () => {
  assert.equal(canRegionUseWarehouseCode('US', 'AMZN-US'), true)
  assert.equal(canRegionUseWarehouseCode('US', 'AMZN'), true)
  assert.equal(canRegionUseWarehouseCode('US', 'AMZN-UK'), false)
  assert.equal(canRegionUseWarehouseCode('UK', 'AMZN-UK'), true)
  assert.equal(canRegionUseWarehouseCode('UK', 'AMZN-US'), false)
  assert.equal(canRegionUseWarehouseCode('UK', 'AMZN'), false)
})

test('Amazon warehouse detection matches active and legacy Amazon codes', () => {
  assert.equal(isAmazonWarehouseCode('AMZN'), true)
  assert.equal(isAmazonWarehouseCode('AMZN-US'), true)
  assert.equal(isAmazonWarehouseCode('AMZN-UK'), true)
  assert.equal(isAmazonWarehouseCode('CHI'), false)
})
