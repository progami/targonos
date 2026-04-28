import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_INBOUND_DOCUMENT_STAGES,
  getActiveInboundOrderDocumentStageFromStoredStage,
  getInboundOrderDocumentStageForStatus,
} from '../../src/lib/inbound/document-stages'

test('active inbound document stages stop at warehouse', () => {
  assert.deepEqual(ACTIVE_INBOUND_DOCUMENT_STAGES, [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
  ])
})

test('inbound statuses map only to active document stages', () => {
  assert.equal(getInboundOrderDocumentStageForStatus('RFQ'), 'ISSUED')
  assert.equal(getInboundOrderDocumentStageForStatus('ISSUED'), 'ISSUED')
  assert.equal(getInboundOrderDocumentStageForStatus('MANUFACTURING'), 'MANUFACTURING')
  assert.equal(getInboundOrderDocumentStageForStatus('OCEAN'), 'OCEAN')
  assert.equal(getInboundOrderDocumentStageForStatus('WAREHOUSE'), 'WAREHOUSE')
  assert.equal(getInboundOrderDocumentStageForStatus('SHIPPED'), null)
  assert.equal(getInboundOrderDocumentStageForStatus('CLOSED'), null)
  assert.equal(getInboundOrderDocumentStageForStatus('REJECTED'), null)
  assert.equal(getInboundOrderDocumentStageForStatus('CANCELLED'), null)
})

test('stored inbound document stages normalize to active document stages only', () => {
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('DRAFT'), 'ISSUED')
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('RFQ'), 'ISSUED')
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('ISSUED'), 'ISSUED')
  assert.equal(
    getActiveInboundOrderDocumentStageFromStoredStage('MANUFACTURING'),
    'MANUFACTURING'
  )
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('OCEAN'), 'OCEAN')
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('WAREHOUSE'), 'WAREHOUSE')
  assert.equal(getActiveInboundOrderDocumentStageFromStoredStage('SHIPPED'), null)
})
