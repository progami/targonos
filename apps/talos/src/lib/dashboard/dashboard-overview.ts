export interface DashboardOverviewPurchaseOrderInput {
  id: string
  orderNumber: string
  status: 'MANUFACTURING' | 'OCEAN'
  counterpartyName: string | null
  warehouseCode: string | null
  warehouseName: string | null
  totalCartons: number
  totalPallets: number | null
  totalUnits: number
}

export type DashboardOverviewPurchaseOrderRow = {
  id: string
  orderNumber: string
  status: string
  counterpartyName: string | null
  warehouseCode: string | null
  warehouseName: string | null
  totalCartons: number
  totalPallets: number | null
  lines: Array<{ unitsOrdered: number }>
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
  return !(
    balance.currentCartons === 0 &&
    balance.currentPallets === 0 &&
    balance.currentUnits === 0
  )
}

function sumRequiredPallets(orders: DashboardOverviewPurchaseOrderInput[]) {
  let total = 0

  for (const order of orders) {
    if (order.totalPallets === null) {
      throw new Error('totalPallets is required')
    }

    total += order.totalPallets
  }

  return total
}

function parseDashboardOverviewStatus(
  status: string
): DashboardOverviewPurchaseOrderInput['status'] {
  if (status === 'MANUFACTURING') {
    return status
  }

  if (status === 'OCEAN') {
    return status
  }

  throw new Error(`Unsupported purchase order status: ${status}`)
}

export function mapPurchaseOrderToDashboardOverviewInput(
  order: DashboardOverviewPurchaseOrderRow
): DashboardOverviewPurchaseOrderInput {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: parseDashboardOverviewStatus(order.status),
    counterpartyName: order.counterpartyName,
    warehouseCode: order.warehouseCode,
    warehouseName: order.warehouseName,
    totalCartons: order.totalCartons,
    totalPallets: order.totalPallets,
    totalUnits: order.lines.reduce((sum, line) => sum + line.unitsOrdered, 0),
  }
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
    const key = balance.warehouseCode.trim()
    if (key.length === 0) {
      throw new Error('warehouseCode is required')
    }

    if (!hasOnHandInventory(balance)) {
      continue
    }

    const existing = warehouseMap.get(key)

    if (existing === undefined) {
      warehouseMap.set(key, {
        warehouseCode: key,
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
        pallets: sumRequiredPallets(factoryOrders),
        units: factoryOrders.reduce((sum, order) => sum + order.totalUnits, 0),
        poCount: factoryOrders.length,
      },
      transit: {
        cartons: transitOrders.reduce((sum, order) => sum + order.totalCartons, 0),
        pallets: sumRequiredPallets(transitOrders),
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
