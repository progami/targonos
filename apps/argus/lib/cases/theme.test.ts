import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCaseApprovalStateTone,
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

test('getCaseApprovalStateTone returns a compact warning accent for approval-required states', () => {
  assert.deepEqual(getCaseApprovalStateTone('approval_required', 'light'), {
    color: '#8f5d00',
    background: 'rgba(191, 125, 0, 0.1)',
    border: 'rgba(191, 125, 0, 0.22)',
  })

  assert.deepEqual(getCaseApprovalStateTone('approval_required', 'dark'), {
    color: '#f3cc74',
    background: 'rgba(243, 204, 116, 0.14)',
    border: 'rgba(243, 204, 116, 0.22)',
  })
})
