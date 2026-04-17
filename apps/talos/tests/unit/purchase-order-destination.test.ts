import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePurchaseOrderDestination } from '../../src/lib/purchase-orders/destination'

test('purchase-order destination prefers the live warehouse record when it is complete', () => {
  const destination = resolvePurchaseOrderDestination(
    {
      warehouseName: 'Amazon Snapshot',
      shipToName: 'Legacy Name',
      shipToAddress: 'Legacy Address',
    },
    {
      name: 'Amazon LBA1',
      address: '1 Warehouse Way\nLeeds',
    }
  )

  assert.deepEqual(destination, {
    name: 'Amazon LBA1',
    address: '1 Warehouse Way\nLeeds',
  })
})

test('purchase-order destination falls back to stored ship-to fields when warehouse address is missing', () => {
  const destination = resolvePurchaseOrderDestination(
    {
      warehouseName: 'Amazon Snapshot',
      shipToName: 'Legacy Name',
      shipToAddress: 'Legacy Address',
    },
    {
      name: 'Amazon Snapshot',
      address: null,
    }
  )

  assert.deepEqual(destination, {
    name: 'Amazon Snapshot',
    address: 'Legacy Address',
  })
})

test('purchase-order destination uses stored legacy values when no warehouse record is available', () => {
  const destination = resolvePurchaseOrderDestination(
    {
      warehouseName: null,
      shipToName: 'Amazon BHX4',
      shipToAddress: 'Legacy Dock 4',
    },
    null
  )

  assert.deepEqual(destination, {
    name: 'Amazon BHX4',
    address: 'Legacy Dock 4',
  })
})
