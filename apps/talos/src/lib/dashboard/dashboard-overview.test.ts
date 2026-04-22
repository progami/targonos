import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDashboardOverviewSnapshot,
  type DashboardOverviewBalanceInput,
  type DashboardOverviewSnapshot,
  type DashboardOverviewPurchaseOrderInput,
} from './dashboard-overview'

test('buildDashboardOverviewSnapshot snapshot for factory, transit, and warehouse totals', () => {
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
    {
      warehouseCode: 'FMC-UK',
      warehouseName: 'FMC Logistics (UK) Ltd',
      skuCode: 'CS-12LD-8M',
      currentCartons: 150,
      currentPallets: 7,
      currentUnits: 1200,
    },
  ]

  const snapshot = buildDashboardOverviewSnapshot({ purchaseOrders, balances })

  const expectedSnapshot: DashboardOverviewSnapshot = {
    summary: {
      factory: {
        cartons: 120,
        pallets: 8,
        units: 960,
        poCount: 1,
      },
      transit: {
        cartons: 80,
        pallets: 5,
        units: 640,
        poCount: 1,
      },
      warehouses: {
        cartons: 650,
        pallets: 37,
        units: 5200,
        warehouseCount: 2,
      },
    },
    warehouses: [
      {
        warehouseCode: 'FMC-UK',
        warehouseName: 'FMC Logistics (UK) Ltd',
        cartons: 350,
        pallets: 17,
        units: 2800,
        skuCount: 2,
      },
      {
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        cartons: 300,
        pallets: 20,
        units: 2400,
        skuCount: 1,
      },
    ],
  }

  assert.deepEqual(snapshot, expectedSnapshot)
})
