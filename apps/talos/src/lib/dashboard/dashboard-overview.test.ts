import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDashboardOverviewSnapshot,
  mapPurchaseOrderToDashboardOverviewInput,
  type DashboardOverviewBalanceInput,
  type DashboardOverviewSnapshot,
  type DashboardOverviewPurchaseOrderInput,
} from './dashboard-overview'

process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'
process.env.NEXTAUTH_URL ??= 'http://localhost:3000'
process.env.PORTAL_AUTH_URL ??= 'http://localhost:3000'
process.env.NEXT_PUBLIC_PORTAL_AUTH_URL ??= 'http://localhost:3000'
process.env.COOKIE_DOMAIN ??= 'localhost'
process.env.PORTAL_AUTH_SECRET ??= 'test-secret'

let resolveDashboardOverviewWarehouseCodeFilter:
  | typeof import('../../app/api/dashboard/overview/route')['resolveDashboardOverviewWarehouseCodeFilter']
  | undefined

const loadResolveDashboardOverviewWarehouseCodeFilter = async () => {
  if (resolveDashboardOverviewWarehouseCodeFilter === undefined) {
    const mod = await import('../../app/api/dashboard/overview/route')
    resolveDashboardOverviewWarehouseCodeFilter = mod.resolveDashboardOverviewWarehouseCodeFilter
  }

  return resolveDashboardOverviewWarehouseCodeFilter
}

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

test('buildDashboardOverviewSnapshot sorts warehouses by cartons descending', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    purchaseOrders: [],
    balances: [
      {
        warehouseCode: 'B',
        warehouseName: 'Warehouse B',
        skuCode: 'SKU-2',
        currentCartons: 10,
        currentPallets: 1,
        currentUnits: 100,
      },
      {
        warehouseCode: 'A',
        warehouseName: 'Warehouse A',
        skuCode: 'SKU-1',
        currentCartons: 40,
        currentPallets: 4,
        currentUnits: 400,
      },
    ],
  })

  assert.deepEqual(snapshot.warehouses.map(row => row.warehouseCode), ['A', 'B'])
})

test('buildDashboardOverviewSnapshot skips zero-value warehouse balances', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    purchaseOrders: [],
    balances: [
      {
        warehouseCode: 'A',
        warehouseName: 'Warehouse A',
        skuCode: 'SKU-1',
        currentCartons: 0,
        currentPallets: 0,
        currentUnits: 0,
      },
      {
        warehouseCode: 'B',
        warehouseName: 'Warehouse B',
        skuCode: 'SKU-2',
        currentCartons: 5,
        currentPallets: 0,
        currentUnits: 50,
      },
    ],
  })

  assert.deepEqual(snapshot.warehouses.map(row => row.warehouseCode), ['B'])
  assert.deepEqual(snapshot.summary.warehouses, {
    cartons: 5,
    pallets: 0,
    units: 50,
    warehouseCount: 1,
  })
})

test('buildDashboardOverviewSnapshot keeps negative warehouse balances visible', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    purchaseOrders: [],
    balances: [
      {
        warehouseCode: 'NEG',
        warehouseName: 'Negative Warehouse',
        skuCode: 'SKU-NEG',
        currentCartons: -3,
        currentPallets: -1,
        currentUnits: -30,
      },
      {
        warehouseCode: 'ZERO',
        warehouseName: 'Zero Warehouse',
        skuCode: 'SKU-ZERO',
        currentCartons: 0,
        currentPallets: 0,
        currentUnits: 0,
      },
    ],
  })

  assert.deepEqual(snapshot.warehouses.map(row => row.warehouseCode), ['NEG'])
  assert.deepEqual(snapshot.summary.warehouses, {
    cartons: -3,
    pallets: -1,
    units: -30,
    warehouseCount: 1,
  })
})

test('buildDashboardOverviewSnapshot normalizes warehouse codes to the trimmed grouping key', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    purchaseOrders: [],
    balances: [
      {
        warehouseCode: '  FMC-UK  ',
        warehouseName: 'FMC Logistics (UK) Ltd',
        skuCode: 'SKU-1',
        currentCartons: 10,
        currentPallets: 1,
        currentUnits: 100,
      },
      {
        warehouseCode: 'FMC-UK',
        warehouseName: 'FMC Logistics (UK) Ltd',
        skuCode: 'SKU-2',
        currentCartons: 15,
        currentPallets: 2,
        currentUnits: 150,
      },
    ],
  })

  assert.deepEqual(snapshot.warehouses, [
    {
      warehouseCode: 'FMC-UK',
      warehouseName: 'FMC Logistics (UK) Ltd',
      cartons: 25,
      pallets: 3,
      units: 250,
      skuCount: 2,
    },
  ])
})

test('mapPurchaseOrderToDashboardOverviewInput preserves missing pallet data', () => {
  const mapped = mapPurchaseOrderToDashboardOverviewInput({
    id: 'po-null-pallets',
    orderNumber: 'PO-2001',
    status: 'MANUFACTURING',
    counterpartyName: null,
    warehouseCode: 'TCL-CHINO',
    warehouseName: 'Tactical Warehouse Solutions',
    totalCartons: 42,
    totalPallets: null,
    lines: [{ unitsOrdered: 420 }],
  })

  assert.equal(mapped.totalPallets, null)
  assert.equal(mapped.totalUnits, 420)
})

test('mapPurchaseOrderToDashboardOverviewInput throws on unsupported purchase order status', () => {
  assert.throws(
    () =>
      mapPurchaseOrderToDashboardOverviewInput({
        id: 'po-invalid-status',
        orderNumber: 'PO-2002',
        status: 'CLOSED',
        counterpartyName: null,
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        totalCartons: 42,
        totalPallets: 4,
        lines: [{ unitsOrdered: 420 }],
      }),
    /Unsupported purchase order status: CLOSED/
  )
})

test('buildDashboardOverviewSnapshot throws when warehouseCode is blank even on zero balances', () => {
  assert.throws(
    () =>
      buildDashboardOverviewSnapshot({
        purchaseOrders: [],
        balances: [
          {
            warehouseCode: '   ',
            warehouseName: 'Blank Warehouse',
            skuCode: 'CS-000',
            currentCartons: 0,
            currentPallets: 0,
            currentUnits: 0,
          },
        ],
      }),
    /warehouseCode is required/
  )
})

test('buildDashboardOverviewSnapshot throws when pallet data is missing', () => {
  assert.throws(
    () =>
      buildDashboardOverviewSnapshot({
        purchaseOrders: [
          {
            id: 'po-null-pallets',
            orderNumber: 'PO-2001',
            status: 'MANUFACTURING',
            counterpartyName: null,
            warehouseCode: 'TCL-CHINO',
            warehouseName: 'Tactical Warehouse Solutions',
            totalCartons: 42,
            totalPallets: null,
            totalUnits: 420,
          },
        ],
        balances: [],
      }),
    /totalPallets is required/
  )
})

test('resolveDashboardOverviewWarehouseCodeFilter fails closed when staff has no warehouseId', async () => {
  const helper = await loadResolveDashboardOverviewWarehouseCodeFilter()

  const prisma = {
    warehouse: {
      findUnique: async () => {
        throw new Error('should not query warehouse lookup without warehouseId')
      },
    },
  }

  const response = await helper(prisma as never, {
    user: { role: 'staff', warehouseId: null },
  })

  assert.ok(response instanceof Response)
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'No warehouse assigned' })
})

test('resolveDashboardOverviewWarehouseCodeFilter fails closed when staff warehouse lookup is unresolved', async () => {
  const helper = await loadResolveDashboardOverviewWarehouseCodeFilter()

  const prisma = {
    warehouse: {
      findUnique: async () => null,
    },
  }

  const response = await helper(prisma as never, {
    user: { role: 'staff', warehouseId: 'warehouse-missing' },
  })

  assert.ok(response instanceof Response)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Warehouse not found' })
})
