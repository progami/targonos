import { CostCategory, type Prisma } from '@targon/prisma-talos'

type CostRateSnapshot = {
  costName: string
  costValue: number
  unitOfMeasure: string
}

export type TacticalCostingLine = {
  transactionId: string
  skuCode: string
  cartons: number
  pallets: number | null
  cartonDimensionsCm: string | null
}

type CostComponent = {
  costCategory: CostCategory
  costName: string
  totalCents: number
}

export type TacticalInboundReceiveType =
  | 'CONTAINER_20'
  | 'CONTAINER_40'
  | 'CONTAINER_40_HQ'
  | 'CONTAINER_40_HQ_LARGE'
  | 'CONTAINER_45_HQ'
  | 'LCL'

export type TacticalOutboundShipMode = 'PALLETS' | 'CARTONS'

export function buildTacticalCostLedgerEntries(params: {
  transactionType: 'RECEIVE' | 'SHIP'
  receiveType: TacticalInboundReceiveType | null
  shipMode: TacticalOutboundShipMode | null
  ratesByCostName: Map<string, CostRateSnapshot>
  lines: TacticalCostingLine[]
  warehouseCode: string
  warehouseName: string
  createdAt: Date
  createdByName: string
}): Prisma.CostLedgerCreateManyInput[] {
  if (params.lines.length === 0) {
    return []
  }

  const lineVolumes = params.lines.map((line) => ({
    transactionId: line.transactionId,
    cartons: line.cartons,
    volumeCm3: computeLineVolumeCm3(line),
  }))

  const missingVolumeSkus = params.lines
    .filter((line, index) => lineVolumes[index]?.volumeCm3 == null)
    .map((line) => line.skuCode)

  if (missingVolumeSkus.length > 0) {
    const uniqueSkus = Array.from(new Set(missingVolumeSkus))
    throw new Error(
      `Missing/invalid carton dimensions for volume attribution: ${uniqueSkus.join(', ')}`
    )
  }

  const totalVolumeCm3 = lineVolumes.reduce((sum, line) => sum + (line.volumeCm3 ?? 0), 0)
  if (totalVolumeCm3 <= 0) {
    throw new Error('Unable to compute volume attribution (total volume is zero)')
  }

  const totalCartons = params.lines.reduce((sum, line) => sum + line.cartons, 0)
  const totalPallets = params.lines.reduce((sum, line) => sum + (line.pallets ?? 0), 0)

  const components: CostComponent[] =
    params.transactionType === 'RECEIVE'
      ? buildInboundComponents({
          receiveType: params.receiveType,
          totalCartons,
          totalPallets,
          skuCount: new Set(params.lines.map((l) => l.skuCode)).size,
          ratesByCostName: params.ratesByCostName,
        })
      : buildOutboundComponents({
          shipMode: params.shipMode,
          totalCartons,
          totalPallets,
          ratesByCostName: params.ratesByCostName,
        })

  const ledgerEntries: Prisma.CostLedgerCreateManyInput[] = []

  for (const component of components) {
    if (component.totalCents <= 0) continue

    const allocations = allocateCentsByVolume(component.totalCents, lineVolumes, totalVolumeCm3)

    for (let i = 0; i < lineVolumes.length; i += 1) {
      const allocatedCents = allocations[i] ?? 0
      if (allocatedCents === 0) continue

      const cartons = Math.max(1, lineVolumes[i]?.cartons ?? 1)
      const totalCost = allocatedCents / 100
      const unitRate = roundMoney(totalCost / cartons)

      ledgerEntries.push({
        transactionId: lineVolumes[i]!.transactionId,
        costCategory: component.costCategory,
        costName: component.costName,
        quantity: cartons,
        unitRate,
        totalCost,
        warehouseCode: params.warehouseCode,
        warehouseName: params.warehouseName,
        createdAt: params.createdAt,
        createdByName: params.createdByName,
      })
    }
  }

  return ledgerEntries
}

function buildInboundComponents(params: {
  receiveType: TacticalInboundReceiveType | null
  totalCartons: number
  totalPallets: number
  skuCount: number
  ratesByCostName: Map<string, CostRateSnapshot>
}): CostComponent[] {
  const receiveType = params.receiveType
  if (!receiveType) {
    throw new Error('Missing receiveType for inbound costing')
  }

  const components: CostComponent[] = []

  if (receiveType === 'LCL') {
    const lclRate = requireRate(params.ratesByCostName, 'LCL Handling')
    components.push({
      costCategory: CostCategory.Inbound,
      costName: lclRate.costName,
      totalCents: roundCents(lclRate.costValue * params.totalCartons),
    })
  } else {
    const containerName = inboundContainerCostName(receiveType)
    const containerRate = requireRate(params.ratesByCostName, containerName)
    components.push({
      costCategory: CostCategory.Inbound,
      costName: containerRate.costName,
      totalCents: roundCents(containerRate.costValue),
    })
  }

  // Optional per-warehouse inbound charges — only applied when the rate is seeded

  const includedSkus = 10
  const additionalSkuCount = Math.max(0, params.skuCount - includedSkus)
  const skuRate = additionalSkuCount > 0 ? params.ratesByCostName.get('Additional SKU Fee') : undefined
  if (skuRate && additionalSkuCount > 0) {
    components.push({
      costCategory: CostCategory.Inbound,
      costName: skuRate.costName,
      totalCents: roundCents(skuRate.costValue * additionalSkuCount),
    })
  }

  const cartonThreshold = 1200
  const overageCartons = Math.max(0, params.totalCartons - cartonThreshold)
  const overageRate = overageCartons > 0 ? params.ratesByCostName.get('Cartons Over 1200') : undefined
  if (overageRate && overageCartons > 0) {
    components.push({
      costCategory: CostCategory.Inbound,
      costName: overageRate.costName,
      totalCents: roundCents(overageRate.costValue * overageCartons),
    })
  }

  const palletWrapRate = params.totalPallets > 0 ? params.ratesByCostName.get('Pallet & Shrink Wrap Fee') : undefined
  if (palletWrapRate && params.totalPallets > 0) {
    components.push({
      costCategory: CostCategory.Inbound,
      costName: palletWrapRate.costName,
      totalCents: roundCents(palletWrapRate.costValue * params.totalPallets),
    })
  }

  // V Global-specific inbound charges
  const labelRate = params.ratesByCostName.get('Label Printed')
  if (labelRate && params.totalCartons > 0) {
    components.push({
      costCategory: CostCategory.Inbound,
      costName: labelRate.costName,
      totalCents: roundCents(labelRate.costValue * params.totalCartons),
    })
  }

  const putawayRate = params.ratesByCostName.get('Pallets Putaway')
  if (putawayRate && params.totalPallets > 0) {
    components.push({
      costCategory: CostCategory.Inbound,
      costName: putawayRate.costName,
      totalCents: roundCents(putawayRate.costValue * params.totalPallets),
    })
  }

  return components
}

function buildOutboundComponents(params: {
  shipMode: TacticalOutboundShipMode | null
  totalCartons: number
  totalPallets: number
  ratesByCostName: Map<string, CostRateSnapshot>
}): CostComponent[] {
  const shipMode = params.shipMode
  if (!shipMode) {
    throw new Error('Missing shipMode for outbound costing')
  }

  if (shipMode === 'CARTONS') {
    const handlingRate = requireRate(params.ratesByCostName, 'Replenishment Handling')
    const minimumRate = requireRate(params.ratesByCostName, 'Replenishment Minimum')

    const handlingCents = roundCents(handlingRate.costValue * params.totalCartons)
    const minimumCents = roundCents(minimumRate.costValue)

    if (handlingCents >= minimumCents) {
      return [
        {
          costCategory: CostCategory.Outbound,
          costName: handlingRate.costName,
          totalCents: handlingCents,
        },
      ]
    }

    return [
      {
        costCategory: CostCategory.Outbound,
        costName: minimumRate.costName,
        totalCents: minimumCents,
      },
    ]
  }

  const pallets = params.totalPallets
  if (!Number.isFinite(pallets) || pallets <= 0) {
    throw new Error('Total pallets is required for pallet shipments')
  }

  const truckingName = outboundTruckingCostName(pallets)
  const truckingRate = requireRate(params.ratesByCostName, truckingName)

  const cost =
    truckingRate.unitOfMeasure.startsWith('per_pallet')
      ? truckingRate.costValue * pallets
      : truckingRate.costValue

  return [
    {
      costCategory: CostCategory.Outbound,
      costName: truckingRate.costName,
      totalCents: roundCents(cost),
    },
  ]
}

function inboundContainerCostName(receiveType: TacticalInboundReceiveType): string {
  switch (receiveType) {
    case 'CONTAINER_20':
      return "20' Container Handling"
    case 'CONTAINER_40':
      return "40' Container Handling"
    case 'CONTAINER_40_HQ':
      return "40' HQ Container Handling"
    case 'CONTAINER_40_HQ_LARGE':
      return "40' HQ Container Handling (1000+ Cartons)"
    case 'CONTAINER_45_HQ':
      return "45' HQ Container Handling"
    case 'LCL':
      return 'LCL Handling'
  }
}

function outboundTruckingCostName(pallets: number): string {
  if (pallets <= 8) return 'FBA Trucking - Up to 8 Pallets'
  if (pallets <= 12) return 'FBA Trucking - 9-12 Pallets'
  if (pallets <= 28) return 'FBA Trucking - 13-28 Pallets (FTL)'
  throw new Error('Pallet count exceeds configured trucking tiers (max 28)')
}

function requireRate(map: Map<string, CostRateSnapshot>, costName: string): CostRateSnapshot {
  const rate = map.get(costName)
  if (!rate) {
    throw new Error(`Missing required rate: ${costName}`)
  }
  return rate
}

function allocateCentsByVolume(
  totalCents: number,
  lines: Array<{ transactionId: string; cartons: number; volumeCm3: number | null }>,
  totalVolumeCm3: number
): number[] {
  const weights = lines.map((line) => (line.volumeCm3 ?? 0) / totalVolumeCm3)
  const raw = weights.map((w) => w * totalCents)
  const floors = raw.map((value) => Math.floor(value))
  let remainder = totalCents - floors.reduce((sum, value) => sum + value, 0)

  const indicesByFraction = raw
    .map((value, index) => ({ index, fraction: value - floors[index]! }))
    .sort((a, b) => b.fraction - a.fraction)

  for (let i = 0; i < indicesByFraction.length && remainder > 0; i += 1) {
    floors[indicesByFraction[i]!.index] += 1
    remainder -= 1
  }

  return floors
}

function computeLineVolumeCm3(line: TacticalCostingLine): number | null {
  const dims = parseCartonDimensionsCm(line.cartonDimensionsCm)
  if (!dims) return null
  const cartons = Number(line.cartons)
  if (!Number.isFinite(cartons) || cartons <= 0) return null
  return cartons * dims.side1Cm * dims.side2Cm * dims.side3Cm
}

function parseCartonDimensionsCm(value: string | null): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  if (!value) return null
  const normalized = value
    .trim()
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/cm$/i, '')

  if (!normalized) return null

  const parts = normalized.split(/[xX×*]/).filter(Boolean)
  if (parts.length !== 3) return null

  const nums = parts.map((part) => Number(part.replace(/[^0-9.]/g, '')))
  if (nums.some((num) => !Number.isFinite(num) || num <= 0)) return null

  const [side1Cm, side2Cm, side3Cm] = nums
  return { side1Cm, side2Cm, side3Cm }
}

function roundCents(amount: number): number {
  return Math.round(amount * 100)
}

function roundMoney(amount: number): number {
  return Number(amount.toFixed(2))
}
