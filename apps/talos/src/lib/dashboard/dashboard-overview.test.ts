import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDashboardOverviewSnapshot,
  type DashboardOverviewBalanceInput,
  type DashboardOverviewPurchaseOrderInput,
} from './dashboard-overview'

test('buildDashboardOverviewSnapshot groups stock into factory, transit, and warehouse totals', () => {
  const purchaseOrders: DashboardOverviewPurchaseOrderInput[] = [
    {
      id: 'po-mfg-1',
      orderNumber: 'PO-1001',
      status: 'MANUFACTURING',
      counterpartyName: 'Ningbo Mills',
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      totalCartons: 120,
      totalPallets: 8,
      totalUnits: 960,
    },
    {
      id: 'po-ocean-1',
      orderNumber: 'PO-1002',
      status: 'OCEAN',
      counterpartyName: 'Ningbo Mills',
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      totalCartons: 80,
      totalPallets: 5,
      totalUnits: 640,
    },
  ]

  const balances: DashboardOverviewBalanceInput[] = [
    {
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      skuCode: 'CS-007',
      currentCartons: 300,
      currentPallets: 20,
      currentUnits: 2400,
    },
    {
      warehouseCode: 'FMC-UK',
      warehouseName: 'FMC Logistics (UK) Ltd',
      skuCode: 'CS-12LD-7M',
      currentCartons: 200,
      currentPallets: 10,
      currentUnits: 1600,
    },
  ]

  const snapshot = buildDashboardOverviewSnapshot({ purchaseOrders, balances })

  assert.equal(snapshot.summary.factory.cartons, 120)
  assert.equal(snapshot.summary.factory.pallets, 8)
  assert.equal(snapshot.summary.factory.units, 960)
  assert.equal(snapshot.summary.factory.poCount, 1)

  assert.equal(snapshot.summary.transit.cartons, 80)
  assert.equal(snapshot.summary.transit.pallets, 5)
  assert.equal(snapshot.summary.transit.units, 640)
  assert.equal(snapshot.summary.transit.poCount, 1)

  assert.equal(snapshot.summary.warehouses.cartons, 500)
  assert.equal(snapshot.summary.warehouses.pallets, 30)
  assert.equal(snapshot.summary.warehouses.units, 4000)
  assert.equal(snapshot.summary.warehouses.warehouseCount, 2)

  assert.deepEqual(
    snapshot.warehouses.map(row => row.warehouseCode),
    ['TCL-CHINO', 'FMC-UK']
  )
})
