export interface DashboardOverviewPurchaseOrderInput {
  id: string
  orderNumber: string
  status: 'MANUFACTURING' | 'OCEAN'
  counterpartyName: string | null
  warehouseCode: string | null
  warehouseName: string | null
  totalCartons: number
  totalPallets: number
  totalUnits: number
}

export interface DashboardOverviewBalanceInput {
  warehouseCode: string
  warehouseName: string
  skuCode: string
  currentCartons: number
  currentPallets: number
  currentUnits: number
}

export interface DashboardOverviewSnapshot {
  summary: {
    factory: { cartons: number; pallets: number; units: number; poCount: number }
    transit: { cartons: number; pallets: number; units: number; poCount: number }
    warehouses: { cartons: number; pallets: number; units: number; warehouseCount: number }
  }
  warehouses: Array<{
    warehouseCode: string
    warehouseName: string
    cartons: number
    pallets: number
    units: number
    skuCount: number
  }>
}

function hasOnHandInventory(balance: DashboardOverviewBalanceInput) {
  if (balance.currentCartons > 0) {
    return true
  }
  if (balance.currentPallets > 0) {
    return true
  }
  return balance.currentUnits > 0
}

export function buildDashboardOverviewSnapshot({
  purchaseOrders,
  balances,
}: {
  purchaseOrders: DashboardOverviewPurchaseOrderInput[]
  balances: DashboardOverviewBalanceInput[]
}): DashboardOverviewSnapshot {
  const factoryOrders = purchaseOrders.filter(order => order.status === 'MANUFACTURING')
  const transitOrders = purchaseOrders.filter(order => order.status === 'OCEAN')

  const warehouseMap = new Map<
    string,
    DashboardOverviewSnapshot['warehouses'][number] & { skuCodes: Set<string> }
  >()

  for (const balance of balances) {
    if (!hasOnHandInventory(balance)) {
      continue
    }

    const key = balance.warehouseCode.trim()
    if (key.length === 0) {
      throw new Error('warehouseCode is required')
    }

    const existing = warehouseMap.get(key)

    if (existing === undefined) {
      warehouseMap.set(key, {
        warehouseCode: balance.warehouseCode,
        warehouseName: balance.warehouseName,
        cartons: balance.currentCartons,
        pallets: balance.currentPallets,
        units: balance.currentUnits,
        skuCount: 1,
        skuCodes: new Set([balance.skuCode]),
      })
      continue
    }

    existing.cartons += balance.currentCartons
    existing.pallets += balance.currentPallets
    existing.units += balance.currentUnits
    existing.skuCodes.add(balance.skuCode)
    existing.skuCount = existing.skuCodes.size
  }

  const warehouses = Array.from(warehouseMap.values())
    .map(({ skuCodes: _skuCodes, ...row }) => row)
    .sort((left, right) => right.cartons - left.cartons)

  return {
    summary: {
      factory: {
        cartons: factoryOrders.reduce((sum, order) => sum + order.totalCartons, 0),
        pallets: factoryOrders.reduce((sum, order) => sum + order.totalPallets, 0),
        units: factoryOrders.reduce((sum, order) => sum + order.totalUnits, 0),
        poCount: factoryOrders.length,
      },
      transit: {
        cartons: transitOrders.reduce((sum, order) => sum + order.totalCartons, 0),
        pallets: transitOrders.reduce((sum, order) => sum + order.totalPallets, 0),
        units: transitOrders.reduce((sum, order) => sum + order.totalUnits, 0),
        poCount: transitOrders.length,
      },
      warehouses: {
        cartons: warehouses.reduce((sum, row) => sum + row.cartons, 0),
        pallets: warehouses.reduce((sum, row) => sum + row.pallets, 0),
        units: warehouses.reduce((sum, row) => sum + row.units, 0),
        warehouseCount: warehouses.length,
      },
    },
    warehouses,
  }
}
