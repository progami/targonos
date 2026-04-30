import assert from 'node:assert/strict'
import test from 'node:test'

import { ConflictError } from '../../src/lib/api/errors'
import {
  ACTIVE_INBOUND_STATUSES,
  CANCELABLE_INBOUND_STATUSES,
  assertInboundOrderMutable,
  getInboundOrderDisplayStatus,
  getRenderableInboundOrderStatuses,
  getValidNextInboundOrderStatuses,
  isCancelableInboundOrderStatus,
  isInboundOrderReadOnlyForUi,
  isPostedInboundOrderReadOnly,
} from '../../src/lib/inbound/workflow'

test('active inbound workflow statuses are limited to inbound stages plus cancelled', () => {
  assert.deepEqual(ACTIVE_INBOUND_STATUSES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
  ])
})

test('valid next inbound statuses follow the approved workflow', () => {
  assert.deepEqual(getValidNextInboundOrderStatuses('ISSUED'), ['MANUFACTURING', 'CANCELLED'])
  assert.deepEqual(getValidNextInboundOrderStatuses('MANUFACTURING'), ['OCEAN', 'CANCELLED'])
  assert.deepEqual(getValidNextInboundOrderStatuses('OCEAN'), ['WAREHOUSE', 'CANCELLED'])
  assert.deepEqual(getValidNextInboundOrderStatuses('WAREHOUSE'), ['CANCELLED'])
})

test('valid next inbound statuses are returned as defensive copies', () => {
  const nextStatuses = getValidNextInboundOrderStatuses('ISSUED')
  nextStatuses.push('WAREHOUSE')

  assert.deepEqual(getValidNextInboundOrderStatuses('ISSUED'), ['MANUFACTURING', 'CANCELLED'])
})

test('only inbound inbound statuses are cancellable', () => {
  assert.deepEqual(CANCELABLE_INBOUND_STATUSES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
  ])
})

test('renderable inbound statuses stay on the simplified inbound workflow', () => {
  assert.deepEqual(getRenderableInboundOrderStatuses(), [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
  ])
})

test('legacy inbound statuses collapse into the simplified display workflow', () => {
  assert.equal(getInboundOrderDisplayStatus('RFQ'), 'ISSUED')
  assert.equal(getInboundOrderDisplayStatus('AWAITING_PROOF'), 'WAREHOUSE')
  assert.equal(getInboundOrderDisplayStatus('REVIEW'), 'WAREHOUSE')
  assert.equal(getInboundOrderDisplayStatus('POSTED'), 'WAREHOUSE')
  assert.equal(getInboundOrderDisplayStatus('ARCHIVED'), 'CANCELLED')
  assert.equal(getInboundOrderDisplayStatus('SHIPPED'), 'WAREHOUSE')
  assert.equal(getInboundOrderDisplayStatus('CLOSED'), 'CANCELLED')
  assert.equal(getInboundOrderDisplayStatus('REJECTED'), 'CANCELLED')
  assert.equal(getInboundOrderDisplayStatus('WAREHOUSE'), 'WAREHOUSE')
})

test('only active inbound stages remain transitionable after normalization', () => {
  assert.equal(isCancelableInboundOrderStatus('ISSUED'), true)
  assert.equal(isCancelableInboundOrderStatus('WAREHOUSE'), true)
  assert.equal(isCancelableInboundOrderStatus('CANCELLED'), false)
  assert.equal(isCancelableInboundOrderStatus('POSTED'), false)
  assert.equal(isCancelableInboundOrderStatus('SHIPPED'), false)
  assert.equal(isCancelableInboundOrderStatus('CLOSED'), false)
})

test('posted inbound are read-only and non-posted inbound remain mutable', () => {
  assert.equal(isPostedInboundOrderReadOnly({ postedAt: null }), false)
  assert.equal(isPostedInboundOrderReadOnly({ postedAt: '2026-04-16T12:00:00.000Z' }), true)
  assert.equal(isInboundOrderReadOnlyForUi({ status: 'WAREHOUSE', postedAt: null }), false)
  assert.equal(
    isInboundOrderReadOnlyForUi({
      status: 'WAREHOUSE',
      postedAt: '2026-04-16T12:00:00.000Z',
    }),
    true
  )
  assert.equal(isInboundOrderReadOnlyForUi({ status: 'CANCELLED', postedAt: null }), true)
  assert.equal(isInboundOrderReadOnlyForUi({ status: 'AWAITING_PROOF', postedAt: null }), true)
  assert.equal(isInboundOrderReadOnlyForUi({ status: 'POSTED', postedAt: null }), true)
  assert.equal(isInboundOrderReadOnlyForUi({ status: 'ARCHIVED', postedAt: null }), true)

  assert.doesNotThrow(() =>
    assertInboundOrderMutable({ status: 'WAREHOUSE', postedAt: null })
  )

  assert.throws(
    () => assertInboundOrderMutable({ status: 'WAREHOUSE', postedAt: '2026-04-16T12:00:00.000Z' }),
    error => {
      assert.ok(error instanceof ConflictError)
      assert.match(error.message, /posted inbound are read-only/)
      return true
    }
  )

  assert.throws(
    () => assertInboundOrderMutable({ status: 'POSTED', postedAt: null }),
    /legacy inbound are read-only/
  )

  assert.throws(
    () => assertInboundOrderMutable({ status: 'CANCELLED', postedAt: null }),
    /cancelled inbound are read-only/
  )
})
