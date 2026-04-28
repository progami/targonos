import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDashboardOverviewSnapshot,
  mapInboundOrderToDashboardOverviewInput,
  type DashboardOverviewBalanceInput,
  type DashboardOverviewSnapshot,
  type DashboardOverviewInboundOrderInput,
} from './dashboard-overview'

process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'
process.env.NEXTAUTH_URL ??= 'http://localhost:3000'
process.env.PORTAL_AUTH_URL ??= 'http://localhost:3000'
process.env.NEXT_PUBLIC_PORTAL_AUTH_URL ??= 'http://localhost:3000'
process.env.COOKIE_DOMAIN ??= 'localhost'
process.env.PORTAL_AUTH_SECRET ??= 'test-secret'

let resolveDashboardOverviewWarehouseCodeFilter:
  | (typeof import('../../app/api/dashboard/overview/route'))['resolveDashboardOverviewWarehouseCodeFilter']
  | undefined

const loadResolveDashboardOverviewWarehouseCodeFilter = async () => {
  if (resolveDashboardOverviewWarehouseCodeFilter === undefined) {
    const mod = await import('../../app/api/dashboard/overview/route')
    resolveDashboardOverviewWarehouseCodeFilter = mod.resolveDashboardOverviewWarehouseCodeFilter
  }

  return resolveDashboardOverviewWarehouseCodeFilter
}

test('buildDashboardOverviewSnapshot snapshot for factory, transit, and warehouse totals', () => {
  const inboundOrders: DashboardOverviewInboundOrderInput[] = [
    {
      id: 'inbound-mfg-1',
      orderNumber: 'IN-1001',
      status: 'MANUFACTURING',
      counterpartyName: 'Ningbo Mills',
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      totalCartons: 120,
      totalPallets: 8,
      totalUnits: 960,
    },
    {
      id: 'inbound-ocean-1',
      orderNumber: 'IN-1002',
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

  const snapshot = buildDashboardOverviewSnapshot({ inboundOrders, balances, movements: [] })

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
        carriesPallets: true,
      },
      {
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        cartons: 300,
        pallets: 20,
        units: 2400,
        skuCount: 1,
        carriesPallets: true,
      },
    ],
    recentIn: [],
    recentOut: [],
  }

  assert.deepEqual(snapshot, expectedSnapshot)
})

test('buildDashboardOverviewSnapshot sorts warehouses by cartons descending', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    movements: [],
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

  assert.deepEqual(
    snapshot.warehouses.map(row => row.warehouseCode),
    ['A', 'B']
  )
})

test('buildDashboardOverviewSnapshot skips zero-value warehouse balances', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    movements: [],
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

  assert.deepEqual(
    snapshot.warehouses.map(row => row.warehouseCode),
    ['B']
  )
  assert.deepEqual(snapshot.summary.warehouses, {
    cartons: 5,
    pallets: 0,
    units: 50,
    warehouseCount: 1,
  })
})

test('buildDashboardOverviewSnapshot keeps negative warehouse balances visible', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    movements: [],
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

  assert.deepEqual(
    snapshot.warehouses.map(row => row.warehouseCode),
    ['NEG']
  )
  assert.deepEqual(snapshot.summary.warehouses, {
    cartons: -3,
    pallets: -1,
    units: -30,
    warehouseCount: 1,
  })
})

test('buildDashboardOverviewSnapshot excludes Amazon FBA pallets from warehouse totals', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    movements: [],
    balances: [
      {
        warehouseCode: 'AMZN-US',
        warehouseName: 'Amazon FBA US',
        skuCode: 'SKU-FBA',
        currentCartons: 120,
        currentPallets: 12,
        currentUnits: 1200,
      },
      {
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        skuCode: 'SKU-3PL',
        currentCartons: 80,
        currentPallets: 5,
        currentUnits: 800,
      },
    ],
  })

  assert.deepEqual(snapshot.summary.warehouses, {
    cartons: 200,
    pallets: 5,
    units: 2000,
    warehouseCount: 2,
  })
  assert.deepEqual(
    snapshot.warehouses.map(row => ({
      warehouseCode: row.warehouseCode,
      pallets: row.pallets,
      carriesPallets: row.carriesPallets,
    })),
    [
      { warehouseCode: 'AMZN-US', pallets: 0, carriesPallets: false },
      { warehouseCode: 'TCL-CHINO', pallets: 5, carriesPallets: true },
    ]
  )
})

test('buildDashboardOverviewSnapshot returns recent inbound and outbound movements', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    balances: [],
    movements: [
      {
        id: 'old-receive',
        transactionType: 'RECEIVE',
        transactionDate: new Date('2026-04-10T12:00:00.000Z'),
        createdAt: new Date('2026-04-10T12:01:00.000Z'),
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        skuCode: 'SKU-OLD',
        skuDescription: 'Older item',
        lotRef: 'LOT-OLD',
        cartonsIn: 3,
        cartonsOut: 0,
        storagePalletsIn: 1,
        shippingPalletsOut: 0,
        unitsPerCarton: 10,
      },
      {
        id: 'recent-receive',
        transactionType: 'RECEIVE',
        transactionDate: new Date('2026-04-13T12:00:00.000Z'),
        createdAt: new Date('2026-04-13T12:01:00.000Z'),
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        skuCode: 'SKU-IN',
        skuDescription: 'Inbound item',
        lotRef: 'LOT-IN',
        cartonsIn: 7,
        cartonsOut: 0,
        storagePalletsIn: 2,
        shippingPalletsOut: 0,
        unitsPerCarton: 12,
      },
      {
        id: 'recent-ship',
        transactionType: 'SHIP',
        transactionDate: new Date('2026-04-14T12:00:00.000Z'),
        createdAt: new Date('2026-04-14T12:01:00.000Z'),
        warehouseCode: 'AMZN-US',
        warehouseName: 'Amazon FBA US',
        skuCode: 'SKU-OUT',
        skuDescription: 'Outbound item',
        lotRef: 'LOT-OUT',
        cartonsIn: 0,
        cartonsOut: 4,
        storagePalletsIn: 0,
        shippingPalletsOut: 3,
        unitsPerCarton: 6,
      },
    ],
  })

  assert.deepEqual(
    snapshot.recentIn.map(row => row.id),
    ['recent-receive', 'old-receive']
  )
  assert.deepEqual(
    snapshot.recentOut.map(row => row.id),
    ['recent-ship']
  )
  assert.deepEqual(snapshot.recentIn[0], {
    id: 'recent-receive',
    transactionType: 'RECEIVE',
    transactionDate: '2026-04-13T12:00:00.000Z',
    warehouseCode: 'TCL-CHINO',
    warehouseName: 'Tactical Warehouse Solutions',
    skuCode: 'SKU-IN',
    skuDescription: 'Inbound item',
    lotRef: 'LOT-IN',
    cartons: 7,
    pallets: 2,
    units: 84,
    carriesPallets: true,
  })
  assert.equal(snapshot.recentOut[0].pallets, 0)
  assert.equal(snapshot.recentOut[0].carriesPallets, false)
})

test('buildDashboardOverviewSnapshot uses createdAt to rank same-day recent movements', () => {
  const movements = Array.from({ length: 6 }, (_, index) => ({
    id: `same-day-${index + 1}`,
    transactionType: 'RECEIVE',
    transactionDate: new Date('2026-04-15T00:00:00.000Z'),
    createdAt: new Date(`2026-04-15T00:0${index}:00.000Z`),
    warehouseCode: 'TCL-CHINO',
    warehouseName: 'Tactical Warehouse Solutions',
    skuCode: `SKU-${index + 1}`,
    skuDescription: `Same day item ${index + 1}`,
    lotRef: `LOT-${index + 1}`,
    cartonsIn: 1,
    cartonsOut: 0,
    storagePalletsIn: 1,
    shippingPalletsOut: 0,
    unitsPerCarton: 10,
  }))

  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    balances: [],
    movements,
  })

  assert.deepEqual(
    snapshot.recentIn.map(row => row.id),
    ['same-day-6', 'same-day-5', 'same-day-4', 'same-day-3', 'same-day-2']
  )
})

test('buildDashboardOverviewSnapshot normalizes warehouse codes to the trimmed grouping key', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    inboundOrders: [],
    movements: [],
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
      carriesPallets: true,
    },
  ])
})

test('mapInboundOrderToDashboardOverviewInput preserves missing pallet data', () => {
  const mapped = mapInboundOrderToDashboardOverviewInput({
    id: 'inbound-null-pallets',
    orderNumber: 'IN-2001',
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

test('mapInboundOrderToDashboardOverviewInput throws on unsupported inbound status', () => {
  assert.throws(
    () =>
      mapInboundOrderToDashboardOverviewInput({
        id: 'inbound-invalid-status',
        orderNumber: 'IN-2002',
        status: 'CLOSED',
        counterpartyName: null,
        warehouseCode: 'TCL-CHINO',
        warehouseName: 'Tactical Warehouse Solutions',
        totalCartons: 42,
        totalPallets: 4,
        lines: [{ unitsOrdered: 420 }],
      }),
    /Unsupported inbound status: CLOSED/
  )
})

test('buildDashboardOverviewSnapshot throws when warehouseCode is blank even on zero balances', () => {
  assert.throws(
    () =>
      buildDashboardOverviewSnapshot({
        inboundOrders: [],
        movements: [],
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
        movements: [],
        inboundOrders: [
          {
            id: 'inbound-null-pallets',
            orderNumber: 'IN-2001',
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
