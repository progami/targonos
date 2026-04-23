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
