import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCaseQueueActionColor,
  getCaseQueueBorderColor,
  getCaseQueueCategoryTone,
  getCaseQueueMutedTextColor,
  getCaseQueueSelectedRowBackground,
} from './theme'

test('getCaseQueueCategoryTone returns queue-specific category accents', () => {
  assert.deepEqual(getCaseQueueCategoryTone('Action due', 'dark'), {
    color: '#ff8f80',
    background: 'rgba(255, 143, 128, 0.12)',
    border: 'rgba(255, 143, 128, 0.2)',
  })

  assert.deepEqual(getCaseQueueCategoryTone('Watching', 'light'), {
    color: '#0b5c58',
    background: 'rgba(0, 194, 185, 0.08)',
    border: 'rgba(0, 194, 185, 0.18)',
  })
})

test('queue action and chrome colors stay mode-aware', () => {
  assert.equal(getCaseQueueActionColor('approve', 'light'), '#0b5c58')
  assert.equal(getCaseQueueActionColor('approve', 'dark'), '#7ce7e0')
  assert.equal(getCaseQueueActionColor('reject', 'light'), '#9f1d12')
  assert.equal(getCaseQueueActionColor('reject', 'dark'), '#ff8f80')
  assert.equal(getCaseQueueBorderColor('light'), 'rgba(0, 44, 81, 0.1)')
  assert.equal(getCaseQueueBorderColor('dark'), 'rgba(255, 255, 255, 0.1)')
  assert.equal(getCaseQueueMutedTextColor('light'), 'rgba(0, 44, 81, 0.64)')
  assert.equal(getCaseQueueMutedTextColor('dark'), 'rgba(255, 255, 255, 0.64)')
  assert.equal(getCaseQueueSelectedRowBackground('light'), 'rgba(0, 44, 81, 0.03)')
  assert.equal(getCaseQueueSelectedRowBackground('dark'), 'rgba(255, 255, 255, 0.03)')
})
