import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatWprChangeCategory,
  normalizeWprChangeCategoryKey,
  WPR_CHANGE_CATEGORY_OPTIONS,
} from './change-log-categories'

test('normalizeWprChangeCategoryKey collapses legacy manual entries into content', () => {
  assert.equal(normalizeWprChangeCategoryKey('MANUAL'), 'CONTENT')
  assert.equal(normalizeWprChangeCategoryKey('Manual'), 'CONTENT')
  assert.equal(normalizeWprChangeCategoryKey('CONTENT'), 'CONTENT')
  assert.equal(normalizeWprChangeCategoryKey('Pricing'), 'PRICING')
})

test('formatWprChangeCategory returns the user-facing label for supported categories', () => {
  assert.equal(formatWprChangeCategory('MANUAL'), 'Content')
  assert.equal(formatWprChangeCategory('CONTENT'), 'Content')
  assert.equal(formatWprChangeCategory('IMAGES'), 'Images')
  assert.equal(formatWprChangeCategory('Offer'), 'Offer')
  assert.equal(formatWprChangeCategory('Catalog'), 'Catalog')
})

test('new changelog entries only expose the kept category set', () => {
  assert.deepEqual(
    WPR_CHANGE_CATEGORY_OPTIONS,
    [
      { value: 'CONTENT', label: 'Content' },
      { value: 'PRICING', label: 'Pricing' },
      { value: 'IMAGES', label: 'Images' },
      { value: 'OFFER', label: 'Offer' },
      { value: 'CATALOG', label: 'Catalog' },
    ],
  )
})
