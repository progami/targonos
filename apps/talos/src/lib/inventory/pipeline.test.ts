import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInventoryPipelineSnapshot } from './pipeline'

test('buildInventoryPipelineSnapshot groups stock by stage and warehouse', () => {
  const snapshot = buildInventoryPipelineSnapshot({
    inboundOrders: [
      {
        id: 'inbound-mfg',
        orderNumber: 'IN-1001',
        status: 'MANUFACTURING',
        counterpartyName: 'Factory Alpha',
        warehouseCode: null,
        warehouseName: null,
        stageData: {
          manufacturing: {
            factoryName: 'Shenzhen Alpha',
            expectedCompletionDate: '2026-04-28T00:00:00.000Z',
            totalCartons: 100,
          },
          ocean: {
            portOfLoading: null,
            portOfDischarge: null,
            estimatedArrival: null,
          },
          warehouse: {
            warehouseCode: null,
            warehouseName: null,
          },
        },
        lines: [
          { skuCode: 'SKU-RED', quantity: 70, unitsOrdered: 840 },
          { skuCode: 'SKU-BLUE', quantity: 30, unitsOrdered: 360 },
        ],
      },
      {
        id: 'inbound-ocean',
        orderNumber: 'IN-2001',
        status: 'OCEAN',
        counterpartyName: 'Factory Beta',
        warehouseCode: null,
        warehouseName: null,
        stageData: {
          manufacturing: {
            factoryName: null,
            expectedCompletionDate: null,
            totalCartons: null,
          },
          ocean: {
            portOfLoading: 'SHA',
            portOfDischarge: 'LAX',
            estimatedArrival: '2026-05-02T00:00:00.000Z',
          },
          warehouse: {
            warehouseCode: null,
            warehouseName: null,
          },
        },
        lines: [{ skuCode: 'SKU-GREEN', quantity: 50, unitsOrdered: 600 }],
      },
    ],
    balances: [
      {
        warehouseId: 'wh-lax',
        warehouse: { code: 'LAX', name: 'Los Angeles' },
        sku: { skuCode: 'SKU-RED' },
        lotRef: 'LOT-001',
        currentCartons: 20,
        currentPallets: 2,
        currentUnits: 240,
      },
      {
        warehouseId: 'wh-lax',
        warehouse: { code: 'LAX', name: 'Los Angeles' },
        sku: { skuCode: 'SKU-BLUE' },
        lotRef: 'LOT-002',
        currentCartons: 10,
        currentPallets: 1,
        currentUnits: 120,
      },
      {
        warehouseId: 'wh-dal',
        warehouse: { code: 'DAL', name: 'Dallas' },
        sku: { skuCode: 'SKU-RED' },
        lotRef: 'LOT-003',
        currentCartons: 5,
        currentPallets: 1,
        currentUnits: 60,
      },
    ],
  })

  assert.deepEqual(snapshot.summary, {
    totalCartons: 185,
    totalUnits: 2220,
    activeSkus: 3,
    inboundOrderCount: 2,
    warehouseCount: 2,
  })

  assert.deepEqual(snapshot.stages, {
    manufacturing: {
      key: 'manufacturing',
      label: 'Manufacturing',
      count: 1,
      cartons: 100,
      units: 1200,
      skuCount: 2,
    },
    transit: {
      key: 'transit',
      label: 'Transit',
      count: 1,
      cartons: 50,
      units: 600,
      skuCount: 1,
    },
    warehouse: {
      key: 'warehouse',
      label: 'Warehouse',
      count: 2,
      cartons: 35,
      units: 420,
      skuCount: 2,
    },
  })

  assert.equal(snapshot.manufacturingRows[0]?.locationLabel, 'Shenzhen Alpha')
  assert.equal(snapshot.manufacturingRows[0]?.expectedDate, '2026-04-28T00:00:00.000Z')
  assert.equal(snapshot.transitRows[0]?.routeLabel, 'SHA → LAX')
  assert.equal(snapshot.transitRows[0]?.eta, '2026-05-02T00:00:00.000Z')

  assert.deepEqual(snapshot.warehouseRows[0], {
    warehouseCode: 'LAX',
    warehouseName: 'Los Angeles',
    skuCount: 2,
    lotCount: 2,
    cartons: 30,
    pallets: 3,
    units: 360,
    shareOfUnits: 85.71428571428571,
  })
})
