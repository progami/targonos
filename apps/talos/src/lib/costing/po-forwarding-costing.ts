import { CostCategory, type Prisma } from '@targon/prisma-talos'

export type PoForwardingCostingLine = {
  transactionId: string
  skuCode: string
  cartons: number
  cartonDimensionsCm: string | null
}

export function buildPoForwardingCostLedgerEntries(params: {
  costName: string
  totalCost: number
  lines: PoForwardingCostingLine[]
  warehouseCode: string
  warehouseName: string
  createdAt: Date
  createdByName: string
}): Prisma.CostLedgerCreateManyInput[] {
  if (params.lines.length === 0) {
    return []
  }

  if (!Number.isFinite(params.totalCost) || params.totalCost <= 0) {
    return []
  }

  const totalCents = roundCents(params.totalCost)
  if (totalCents <= 0) {
    return []
  }

  const lineVolumes = params.lines.map(line => {
    const volumeCm3 = computeLineVolumeCm3(line)
    return {
      transactionId: line.transactionId,
      skuCode: line.skuCode,
      cartons: line.cartons,
      volumeCm3,
    }
  })

  const missingVolumeSkus = lineVolumes
    .filter(line => line.volumeCm3 == null)
    .map(line => line.skuCode)

  if (missingVolumeSkus.length > 0) {
    const uniqueSkus = Array.from(new Set(missingVolumeSkus))
    throw new Error(`Missing/invalid carton dimensions for volume attribution: ${uniqueSkus.join(', ')}`)
  }

  const totalVolumeCm3 = lineVolumes.reduce((sum, line) => sum + (line.volumeCm3 ?? 0), 0)
  if (totalVolumeCm3 <= 0) {
    throw new Error('Unable to compute volume attribution (total volume is zero)')
  }

  const allocations = allocateCentsByVolume(totalCents, lineVolumes, totalVolumeCm3)

  const ledgerEntries: Prisma.CostLedgerCreateManyInput[] = []

  for (let i = 0; i < lineVolumes.length; i += 1) {
    const allocatedCents = allocations[i] ?? 0
    if (allocatedCents === 0) continue

    const cartons = Number(lineVolumes[i]!.cartons)
    if (!Number.isFinite(cartons) || cartons <= 0) {
      throw new Error(`Invalid cartons for volume attribution: ${lineVolumes[i]!.skuCode}`)
    }

    const totalCost = allocatedCents / 100
    const unitRate = roundMoney(totalCost / cartons)

    ledgerEntries.push({
      transactionId: lineVolumes[i]!.transactionId,
      costCategory: CostCategory.Forwarding,
      costName: params.costName,
      quantity: cartons,
      unitRate,
      totalCost,
      warehouseCode: params.warehouseCode,
      warehouseName: params.warehouseName,
      createdAt: params.createdAt,
      createdByName: params.createdByName,
    })
  }

  return ledgerEntries
}

function allocateCentsByVolume(
  totalCents: number,
  lines: Array<{ volumeCm3: number | null }>,
  totalVolumeCm3: number
): number[] {
  const weights = lines.map(line => (line.volumeCm3 ?? 0) / totalVolumeCm3)
  const raw = weights.map(w => w * totalCents)
  const floors = raw.map(value => Math.floor(value))
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

function computeLineVolumeCm3(line: PoForwardingCostingLine): number | null {
  const dims = parseCartonDimensionsCm(line.cartonDimensionsCm)
  if (!dims) return null
  const cartons = Number(line.cartons)
  if (!Number.isFinite(cartons) || cartons <= 0) return null
  return cartons * dims.side1Cm * dims.side2Cm * dims.side3Cm
}

function parseCartonDimensionsCm(
  value: string | null
): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  if (!value) return null
  const normalized = value
    .trim()
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/cm$/i, '')

  if (!normalized) return null

  const parts = normalized.split(/[xX\u00d7*]/).filter(Boolean)
  if (parts.length !== 3) return null

  const nums = parts.map(part => Number(part.replace(/[^0-9.]/g, '')))
  if (nums.some(num => !Number.isFinite(num) || num <= 0)) return null

  const [side1Cm, side2Cm, side3Cm] = nums
  return { side1Cm, side2Cm, side3Cm }
}

function roundCents(amount: number): number {
  return Math.round(amount * 100)
}

function roundMoney(amount: number): number {
  return Number(amount.toFixed(2))
}
