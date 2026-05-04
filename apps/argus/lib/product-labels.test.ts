import test from 'node:test'
import assert from 'node:assert/strict'
import { formatAmazonTitleLabel, formatAsinDisplayName, formatAsinReference, formatProductLabel } from './product-labels'

test('formatProductLabel prefers a curated non-ASIN label', () => {
  assert.equal(
    formatProductLabel({
      asin: 'B09HXC3NL8',
      label: 'White Greenhouse',
      brand: 'Targon',
      size: '12 x 9',
      title: 'Long Amazon title',
    }),
    'White Greenhouse',
  )
})

test('formatProductLabel ignores labels that are just the ASIN', () => {
  assert.equal(
    formatProductLabel({
      asin: 'B09HXC3NL8',
      label: 'b09hxc3nl8',
      brand: 'HomeNest',
      size: '12 x 9',
      title: 'Long Amazon title',
    }),
    'HomeNest - 12 x 9',
  )
})

test('formatProductLabel falls through to brand, size, title, then ASIN', () => {
  assert.equal(formatProductLabel({ asin: 'B0CR1GSBQ9', size: '10 x 8' }), '10 x 8')
  assert.equal(formatProductLabel({ asin: 'B0CR1GSBQ9', title: 'Portable greenhouse kit' }), 'Portable greenhouse kit')
  assert.equal(formatProductLabel({ asin: 'B0CR1GSBQ9', brand: 'HomeNest' }), 'HomeNest')
  assert.equal(formatProductLabel({ asin: 'b0cr1gsbq9' }), 'B0CR1GSBQ9')
})

test('formatAmazonTitleLabel creates a short title label', () => {
  assert.equal(
    formatAmazonTitleLabel({
      asin: 'B0CR1GSBQ9',
      brand: 'HomeNest',
      title: 'HomeNest Portable greenhouse kit with reinforced cover, shelves, and stakes',
    }),
    'Portable greenhouse kit with reinforced cover',
  )
})

test('formatAsinDisplayName maps tracked ASINs to readable product names', () => {
  assert.equal(formatAsinDisplayName({ asin: 'b09hxc3nl8' }), 'Caelum Star 6 Pack 12x9 ft Extra Large')
  assert.equal(formatAsinDisplayName({ asin: 'B0DQDWV1SV' }), 'Axgatoxe 6-Pack 12 x 9 ft Plastic Drop Cloth')
  assert.equal(formatAsinDisplayName({ asin: 'B08QZHS7V6' }), 'ARVO 3 Pack 12ft x 9ft Plastic Dust Sheets')
})

test('formatAsinDisplayName still prefers explicit product metadata', () => {
  assert.equal(
    formatAsinDisplayName({
      asin: 'B09HXC3NL8',
      label: 'White Greenhouse',
      brand: 'Targon',
      size: '12 x 9',
    }),
    'White Greenhouse',
  )
})

test('formatAsinReference keeps the raw ASIN available after the readable name', () => {
  assert.equal(
    formatAsinReference('B09HXC3NL8'),
    'Caelum Star 6 Pack 12x9 ft Extra Large (B09HXC3NL8)',
  )
  assert.equal(formatAsinReference('B000000001'), 'B000000001')
})
