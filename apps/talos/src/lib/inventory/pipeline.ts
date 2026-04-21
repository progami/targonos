export interface InventoryPipelinePurchaseOrderLineInput {
  skuCode: string
  quantity: number
  unitsOrdered: number
}

export interface InventoryPipelinePurchaseOrderInput {
  id: string
  orderNumber: string
  status: string
  counterpartyName: string | null
  warehouseCode: string | null
  warehouseName: string | null
  stageData: {
    manufacturing: {
      factoryName: string | null
      expectedCompletionDate: string | null
      totalCartons: number | null
    }
    ocean: {
      portOfLoading: string | null
      portOfDischarge: string | null
      estimatedArrival: string | null
    }
    warehouse: {
      warehouseCode: string | null
      warehouseName: string | null
    }
  }
  lines: InventoryPipelinePurchaseOrderLineInput[]
}

export interface InventoryPipelineBalanceInput {
  warehouseId: string | null
  warehouse: {
    code: string
    name: string
  }
  sku: {
    skuCode: string
  }
  lotRef: string
  currentCartons: number
  currentPallets: number
  currentUnits: number
}

interface InventoryPipelineStageSummary {
  key: 'manufacturing' | 'transit' | 'warehouse'
  label: string
  count: number
  cartons: number
  units: number
  skuCount: number
}

export interface InventoryPipelineOrderRow {
  id: string
  orderNumber: string
  supplierName: string | null
  skuCount: number
  cartons: number
  units: number
  locationLabel: string | null
  expectedDate: string | null
  routeLabel: string | null
  eta: string | null
  warehouseCode: string | null
  warehouseName: string | null
}

export interface InventoryPipelineWarehouseRow {
  warehouseCode: string
  warehouseName: string
  skuCount: number
  lotCount: number
  cartons: number
  pallets: number
  units: number
  shareOfUnits: number
}

export interface InventoryPipelineSnapshot {
  summary: {
    totalCartons: number
    totalUnits: number
    activeSkus: number
    purchaseOrderCount: number
    warehouseCount: number
  }
  stages: {
    manufacturing: InventoryPipelineStageSummary
    transit: InventoryPipelineStageSummary
    warehouse: InventoryPipelineStageSummary
  }
  manufacturingRows: InventoryPipelineOrderRow[]
  transitRows: InventoryPipelineOrderRow[]
  warehouseRows: InventoryPipelineWarehouseRow[]
}

interface StageAccumulator {
  count: number
  cartons: number
  units: number
  skuCodes: Set<string>
}

function createStageAccumulator(): StageAccumulator {
  return {
    count: 0,
    cartons: 0,
    units: 0,
    skuCodes: new Set<string>(),
  }
}

function sumOrderCartons(order: InventoryPipelinePurchaseOrderInput) {
  const manufacturingTotalCartons = order.stageData.manufacturing.totalCartons
  if (typeof manufacturingTotalCartons === 'number' && manufacturingTotalCartons > 0) {
    return manufacturingTotalCartons
  }

  return order.lines.reduce((sum, line) => sum + line.quantity, 0)
}

function sumOrderUnits(order: InventoryPipelinePurchaseOrderInput) {
  return order.lines.reduce((sum, line) => sum + line.unitsOrdered, 0)
}

function buildOrderSkuSet(order: InventoryPipelinePurchaseOrderInput) {
  const skuCodes = new Set<string>()
  order.lines.forEach((line) => {
    skuCodes.add(line.skuCode)
  })
  return skuCodes
}

function buildRouteLabel(order: InventoryPipelinePurchaseOrderInput) {
  const portOfLoading = order.stageData.ocean.portOfLoading
  const portOfDischarge = order.stageData.ocean.portOfDischarge

  if (portOfLoading && portOfDischarge) {
    return `${portOfLoading} → ${portOfDischarge}`
  }
  if (portOfLoading) {
    return portOfLoading
  }
  if (portOfDischarge) {
    return portOfDischarge
  }
  return null
}

function buildStageOrderRow(order: InventoryPipelinePurchaseOrderInput): InventoryPipelineOrderRow {
  const skuCodes = buildOrderSkuSet(order)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    supplierName: order.counterpartyName,
    skuCount: skuCodes.size,
    cartons: sumOrderCartons(order),
    units: sumOrderUnits(order),
    locationLabel: order.stageData.manufacturing.factoryName,
    expectedDate: order.stageData.manufacturing.expectedCompletionDate,
    routeLabel: buildRouteLabel(order),
    eta: order.stageData.ocean.estimatedArrival,
    warehouseCode: order.stageData.warehouse.warehouseCode,
    warehouseName: order.stageData.warehouse.warehouseName,
  }
}

function addOrderToStage(stage: StageAccumulator, order: InventoryPipelinePurchaseOrderInput) {
  stage.count += 1
  stage.cartons += sumOrderCartons(order)
  stage.units += sumOrderUnits(order)
  buildOrderSkuSet(order).forEach((skuCode) => {
    stage.skuCodes.add(skuCode)
  })
}

function hasOnHandInventory(balance: InventoryPipelineBalanceInput) {
  if (balance.currentCartons > 0) {
    return true
  }
  if (balance.currentPallets > 0) {
    return true
  }
  return balance.currentUnits > 0
}

function getWarehouseGroupKey(balance: InventoryPipelineBalanceInput) {
  if (balance.warehouse.code.trim().length > 0) {
    return balance.warehouse.code.trim()
  }
  if (balance.warehouse.name.trim().length > 0) {
    return balance.warehouse.name.trim()
  }
  if (balance.warehouseId) {
    return balance.warehouseId
  }
  return balance.lotRef
}

function createStageSummary(
  key: InventoryPipelineStageSummary['key'],
  label: string,
  stage: StageAccumulator
): InventoryPipelineStageSummary {
  return {
    key,
    label,
    count: stage.count,
    cartons: stage.cartons,
    units: stage.units,
    skuCount: stage.skuCodes.size,
  }
}

export function buildInventoryPipelineSnapshot(input: {
  purchaseOrders: InventoryPipelinePurchaseOrderInput[]
  balances: InventoryPipelineBalanceInput[]
}): InventoryPipelineSnapshot {
  const manufacturing = createStageAccumulator()
  const transit = createStageAccumulator()
  const warehouse = createStageAccumulator()

  const activeSkuCodes = new Set<string>()
  const manufacturingRows: InventoryPipelineOrderRow[] = []
  const transitRows: InventoryPipelineOrderRow[] = []

  input.purchaseOrders.forEach((order) => {
    const row = buildStageOrderRow(order)
    buildOrderSkuSet(order).forEach((skuCode) => {
      activeSkuCodes.add(skuCode)
    })

    if (order.status === 'MANUFACTURING') {
      addOrderToStage(manufacturing, order)
      manufacturingRows.push(row)
    }

    if (order.status === 'OCEAN') {
      addOrderToStage(transit, order)
      transitRows.push(row)
    }
  })

  const groupedWarehouses = new Map<
    string,
    {
      warehouseCode: string
      warehouseName: string
      skuCodes: Set<string>
      lotRefs: Set<string>
      cartons: number
      pallets: number
      units: number
    }
  >()

  input.balances.forEach((balance) => {
    if (!hasOnHandInventory(balance)) {
      return
    }

    activeSkuCodes.add(balance.sku.skuCode)
    warehouse.count += 0
    warehouse.cartons += Math.max(0, balance.currentCartons)
    warehouse.units += Math.max(0, balance.currentUnits)
    warehouse.skuCodes.add(balance.sku.skuCode)

    const warehouseKey = getWarehouseGroupKey(balance)
    const existingWarehouse = groupedWarehouses.get(warehouseKey)

    if (existingWarehouse) {
      existingWarehouse.skuCodes.add(balance.sku.skuCode)
      existingWarehouse.lotRefs.add(balance.lotRef)
      existingWarehouse.cartons += Math.max(0, balance.currentCartons)
      existingWarehouse.pallets += Math.max(0, balance.currentPallets)
      existingWarehouse.units += Math.max(0, balance.currentUnits)
      return
    }

    groupedWarehouses.set(warehouseKey, {
      warehouseCode: balance.warehouse.code,
      warehouseName: balance.warehouse.name,
      skuCodes: new Set([balance.sku.skuCode]),
      lotRefs: new Set([balance.lotRef]),
      cartons: Math.max(0, balance.currentCartons),
      pallets: Math.max(0, balance.currentPallets),
      units: Math.max(0, balance.currentUnits),
    })
  })

  warehouse.count = groupedWarehouses.size

  const warehouseRows = Array.from(groupedWarehouses.values())
    .map((row): InventoryPipelineWarehouseRow => ({
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      skuCount: row.skuCodes.size,
      lotCount: row.lotRefs.size,
      cartons: row.cartons,
      pallets: row.pallets,
      units: row.units,
      shareOfUnits: warehouse.units > 0 ? (row.units / warehouse.units) * 100 : 0,
    }))
    .sort((left, right) => right.units - left.units)

  manufacturingRows.sort((left, right) => right.units - left.units)
  transitRows.sort((left, right) => right.units - left.units)

  return {
    summary: {
      totalCartons: manufacturing.cartons + transit.cartons + warehouse.cartons,
      totalUnits: manufacturing.units + transit.units + warehouse.units,
      activeSkus: activeSkuCodes.size,
      purchaseOrderCount: manufacturing.count + transit.count,
      warehouseCount: warehouse.count,
    },
    stages: {
      manufacturing: createStageSummary('manufacturing', 'Manufacturing', manufacturing),
      transit: createStageSummary('transit', 'Transit', transit),
      warehouse: createStageSummary('warehouse', 'Warehouse', warehouse),
    },
    manufacturingRows,
    transitRows,
    warehouseRows,
  }
}
