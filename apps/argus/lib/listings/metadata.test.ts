import test from 'node:test'
import assert from 'node:assert/strict'
import { buildListingMetadataUpdate } from './metadata'

test('buildListingMetadataUpdate replaces ASIN labels with catalog identity', () => {
  assert.deepEqual(
    buildListingMetadataUpdate(
      { asin: 'B09HXC3NL8', label: 'B09HXC3NL8', brandName: null },
      { asin: 'B09HXC3NL8', brand: 'HomeNest', title: 'Portable greenhouse kit' },
    ),
    { label: 'Portable greenhouse kit', brandName: 'HomeNest' },
  )
})

test('buildListingMetadataUpdate preserves curated labels', () => {
  assert.deepEqual(
    buildListingMetadataUpdate(
      { asin: 'B09HXC3NL8', label: 'Greenhouse 12 x 9', brandName: null },
      { asin: 'B09HXC3NL8', brand: 'HomeNest', title: 'Portable greenhouse kit' },
    ),
    { brandName: 'HomeNest' },
  )
})

test('buildListingMetadataUpdate replaces generic brand labels with title labels', () => {
  assert.deepEqual(
    buildListingMetadataUpdate(
      { asin: 'B09HXC3NL8', label: 'HomeNest', brandName: 'HomeNest' },
      { asin: 'B09HXC3NL8', brand: 'HomeNest', title: 'HomeNest Portable greenhouse kit with reinforced frame' },
    ),
    { label: 'Portable greenhouse kit with reinforced frame' },
  )
})

test('buildListingMetadataUpdate replaces old brand-prefixed generated labels', () => {
  assert.deepEqual(
    buildListingMetadataUpdate(
      { asin: 'B09HXC3NL8', label: 'HomeNest Portable greenhouse kit with reinforced frame', brandName: 'HomeNest' },
      { asin: 'B09HXC3NL8', brand: 'HomeNest', title: 'HomeNest Portable greenhouse kit with reinforced frame' },
    ),
    { label: 'Portable greenhouse kit with reinforced frame' },
  )
})

test('buildListingMetadataUpdate returns no update when catalog has no usable identity', () => {
  assert.deepEqual(
    buildListingMetadataUpdate(
      { asin: 'B09HXC3NL8', label: 'B09HXC3NL8', brandName: null },
      { asin: 'B09HXC3NL8', brand: null, title: null },
    ),
    {},
  )
})
