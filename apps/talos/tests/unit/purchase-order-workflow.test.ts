import assert from 'node:assert/strict'
import test from 'node:test'

import { ConflictError } from '../../src/lib/api/errors'
import {
  ACTIVE_PURCHASE_ORDER_STATUSES,
  CANCELABLE_PURCHASE_ORDER_STATUSES,
  assertPurchaseOrderMutable,
  getPurchaseOrderDisplayStatus,
  getRenderablePurchaseOrderStatuses,
  getValidNextPurchaseOrderStatuses,
  isCancelablePurchaseOrderStatus,
  isPurchaseOrderReadOnlyForUi,
  isPostedPurchaseOrderReadOnly,
} from '../../src/lib/purchase-orders/workflow'

test('active purchase-order workflow statuses are limited to inbound stages plus cancelled', () => {
  assert.deepEqual(ACTIVE_PURCHASE_ORDER_STATUSES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
  ])
})

test('valid next purchase-order statuses follow the approved workflow', () => {
  assert.deepEqual(getValidNextPurchaseOrderStatuses('ISSUED'), ['MANUFACTURING', 'CANCELLED'])
  assert.deepEqual(getValidNextPurchaseOrderStatuses('MANUFACTURING'), ['OCEAN', 'CANCELLED'])
  assert.deepEqual(getValidNextPurchaseOrderStatuses('OCEAN'), ['WAREHOUSE', 'CANCELLED'])
  assert.deepEqual(getValidNextPurchaseOrderStatuses('WAREHOUSE'), ['CANCELLED'])
})

test('valid next purchase-order statuses are returned as defensive copies', () => {
  const nextStatuses = getValidNextPurchaseOrderStatuses('ISSUED')
  nextStatuses.push('WAREHOUSE')

  assert.deepEqual(getValidNextPurchaseOrderStatuses('ISSUED'), ['MANUFACTURING', 'CANCELLED'])
})

test('only inbound purchase-order statuses are cancellable', () => {
  assert.deepEqual(CANCELABLE_PURCHASE_ORDER_STATUSES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
  ])
})

test('renderable purchase-order statuses stay on the simplified inbound workflow', () => {
  assert.deepEqual(getRenderablePurchaseOrderStatuses(), [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
  ])
})

test('legacy purchase-order statuses collapse into the simplified display workflow', () => {
  assert.equal(getPurchaseOrderDisplayStatus('RFQ'), 'ISSUED')
  assert.equal(getPurchaseOrderDisplayStatus('SHIPPED'), 'WAREHOUSE')
  assert.equal(getPurchaseOrderDisplayStatus('CLOSED'), 'CANCELLED')
  assert.equal(getPurchaseOrderDisplayStatus('REJECTED'), 'CANCELLED')
  assert.equal(getPurchaseOrderDisplayStatus('WAREHOUSE'), 'WAREHOUSE')
})

test('only active inbound stages remain transitionable after normalization', () => {
  assert.equal(isCancelablePurchaseOrderStatus('ISSUED'), true)
  assert.equal(isCancelablePurchaseOrderStatus('WAREHOUSE'), true)
  assert.equal(isCancelablePurchaseOrderStatus('CANCELLED'), false)
  assert.equal(isCancelablePurchaseOrderStatus('SHIPPED'), false)
  assert.equal(isCancelablePurchaseOrderStatus('CLOSED'), false)
})

test('posted purchase orders are read-only and non-posted purchase orders remain mutable', () => {
  assert.equal(isPostedPurchaseOrderReadOnly({ postedAt: null }), false)
  assert.equal(isPostedPurchaseOrderReadOnly({ postedAt: '2026-04-16T12:00:00.000Z' }), true)
  assert.equal(isPurchaseOrderReadOnlyForUi({ status: 'WAREHOUSE', postedAt: null }), false)
  assert.equal(
    isPurchaseOrderReadOnlyForUi({
      status: 'WAREHOUSE',
      postedAt: '2026-04-16T12:00:00.000Z',
    }),
    true
  )
  assert.equal(isPurchaseOrderReadOnlyForUi({ status: 'CANCELLED', postedAt: null }), true)

  assert.doesNotThrow(() =>
    assertPurchaseOrderMutable({ status: 'WAREHOUSE', postedAt: null })
  )

  assert.throws(
    () => assertPurchaseOrderMutable({ status: 'WAREHOUSE', postedAt: '2026-04-16T12:00:00.000Z' }),
    error => {
      assert.ok(error instanceof ConflictError)
      assert.match(error.message, /posted purchase orders are read-only/)
      return true
    }
  )

  assert.throws(
    () => assertPurchaseOrderMutable({ status: 'CANCELLED', postedAt: null }),
    /cancelled purchase orders are read-only/
  )
})
