import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBreadcrumbItems } from '../../src/components/ui/breadcrumb'

test('breadcrumb uses the current SKU info label for the Amazon SKU page', () => {
  const labels = buildBreadcrumbItems('/talos/amazon/fba-fee-discrepancies').map(
    (item) => item.label
  )

  assert.deepEqual(labels, ['Amazon', 'SKU Info'])
  assert.equal(labels.includes('Fba Fee Discrepancies'), false)
})

test('breadcrumb uses the outbound label for the operations shipment page', () => {
  const labels = buildBreadcrumbItems('/talos/operations/outbound').map(
    (item) => item.label
  )

  assert.deepEqual(labels, ['Outbound'])
  assert.equal(labels.includes('Outbound Orders'), false)
})
