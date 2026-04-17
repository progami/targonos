import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_PURCHASE_ORDER_DOCUMENT_STAGES,
  getActivePurchaseOrderDocumentStageFromStoredStage,
  getPurchaseOrderDocumentStageForStatus,
} from '../../src/lib/purchase-orders/document-stages'

test('active purchase-order document stages stop at warehouse', () => {
  assert.deepEqual(ACTIVE_PURCHASE_ORDER_DOCUMENT_STAGES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
  ])
})

test('purchase-order statuses map only to active document stages', () => {
  assert.equal(getPurchaseOrderDocumentStageForStatus('RFQ'), 'ISSUED')
  assert.equal(getPurchaseOrderDocumentStageForStatus('ISSUED'), 'ISSUED')
  assert.equal(getPurchaseOrderDocumentStageForStatus('MANUFACTURING'), 'MANUFACTURING')
  assert.equal(getPurchaseOrderDocumentStageForStatus('OCEAN'), 'OCEAN')
  assert.equal(getPurchaseOrderDocumentStageForStatus('WAREHOUSE'), 'WAREHOUSE')
  assert.equal(getPurchaseOrderDocumentStageForStatus('SHIPPED'), null)
  assert.equal(getPurchaseOrderDocumentStageForStatus('CLOSED'), null)
  assert.equal(getPurchaseOrderDocumentStageForStatus('REJECTED'), null)
  assert.equal(getPurchaseOrderDocumentStageForStatus('CANCELLED'), null)
})

test('stored purchase-order document stages normalize to active document stages only', () => {
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('DRAFT'), 'ISSUED')
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('RFQ'), 'ISSUED')
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('ISSUED'), 'ISSUED')
  assert.equal(
    getActivePurchaseOrderDocumentStageFromStoredStage('MANUFACTURING'),
    'MANUFACTURING'
  )
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('OCEAN'), 'OCEAN')
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('WAREHOUSE'), 'WAREHOUSE')
  assert.equal(getActivePurchaseOrderDocumentStageFromStoredStage('SHIPPED'), null)
})
