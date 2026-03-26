import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

type CostRateSnapshot = {
  costName: string
  costValue: number
  unitOfMeasure: string
}

type CostEstimationItem = {
  costCategory: string
  costName: string
  quantity: number
  unitRate: number
  totalCost: number
}

// POST /api/cost-estimation
// Estimates costs for inbound (RECEIVE) or outbound (SHIP) based on parameters
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prisma = await getTenantPrisma()
    const body = await request.json()
    const {
      warehouseCode,
      transactionType, // 'RECEIVE' | 'SHIP'
      receiveType,     // 'CONTAINER_20' | 'CONTAINER_40' | 'CONTAINER_40_HQ' | 'CONTAINER_45_HQ' | 'LCL'
      shipMode,        // 'PALLETS' | 'CARTONS'
      expectedCartons,
      expectedPallets,
      expectedSkuCount,
    } = body

    if (!warehouseCode) {
      return NextResponse.json({ error: 'warehouseCode is required' }, { status: 400 })
    }

    if (!transactionType || !['RECEIVE', 'SHIP'].includes(transactionType)) {
      return NextResponse.json({ error: 'transactionType must be RECEIVE or SHIP' }, { status: 400 })
    }

    // Get warehouse
    const warehouse = await prisma.warehouse.findUnique({
      where: { code: warehouseCode }
    })

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    // Get active cost rates for the warehouse
    const costRates = await prisma.costRate.findMany({
      where: {
        warehouseId: warehouse.id,
        isActive: true,
      },
    })

    const ratesByCostName = new Map<string, CostRateSnapshot>()
    for (const rate of costRates) {
      ratesByCostName.set(rate.costName, {
        costName: rate.costName,
        costValue: Number(rate.costValue),
        unitOfMeasure: rate.unitOfMeasure,
      })
    }

    const items: CostEstimationItem[] = []
    let totalEstimate = 0

    if (transactionType === 'RECEIVE') {
      if (!receiveType) {
        return NextResponse.json({ error: 'receiveType is required for RECEIVE' }, { status: 400 })
      }

      const cartons = expectedCartons ?? 0
      const pallets = expectedPallets ?? 0
      const skuCount = expectedSkuCount ?? 1

      // Container/LCL handling
      if (receiveType === 'LCL') {
        const rate = ratesByCostName.get('LCL Handling')
        if (rate) {
          const totalCost = rate.costValue * cartons
          items.push({
            costCategory: 'Inbound',
            costName: rate.costName,
            quantity: cartons,
            unitRate: rate.costValue,
            totalCost: roundMoney(totalCost),
          })
          totalEstimate += totalCost
        }
      } else {
        const containerName = inboundContainerCostName(receiveType)
        const rate = ratesByCostName.get(containerName)
        if (rate) {
          items.push({
            costCategory: 'Inbound',
            costName: rate.costName,
            quantity: 1,
            unitRate: rate.costValue,
            totalCost: roundMoney(rate.costValue),
          })
          totalEstimate += rate.costValue
        }
      }

      // Additional SKU fee (over 10 SKUs)
      const includedSkus = 10
      const additionalSkuCount = Math.max(0, skuCount - includedSkus)
      if (additionalSkuCount > 0) {
        const rate = ratesByCostName.get('Additional SKU Fee')
        if (rate) {
          const totalCost = rate.costValue * additionalSkuCount
          items.push({
            costCategory: 'Inbound',
            costName: rate.costName,
            quantity: additionalSkuCount,
            unitRate: rate.costValue,
            totalCost: roundMoney(totalCost),
          })
          totalEstimate += totalCost
        }
      }

      // Cartons over 1200
      const cartonThreshold = 1200
      const overageCartons = Math.max(0, cartons - cartonThreshold)
      if (overageCartons > 0) {
        const rate = ratesByCostName.get('Cartons Over 1200')
        if (rate) {
          const totalCost = rate.costValue * overageCartons
          items.push({
            costCategory: 'Inbound',
            costName: rate.costName,
            quantity: overageCartons,
            unitRate: rate.costValue,
            totalCost: roundMoney(totalCost),
          })
          totalEstimate += totalCost
        }
      }

      // Pallet & Shrink Wrap Fee
      if (pallets > 0) {
        const rate = ratesByCostName.get('Pallet & Shrink Wrap Fee')
        if (rate) {
          const totalCost = rate.costValue * pallets
          items.push({
            costCategory: 'Inbound',
            costName: rate.costName,
            quantity: pallets,
            unitRate: rate.costValue,
            totalCost: roundMoney(totalCost),
          })
          totalEstimate += totalCost
        }
      }
    } else if (transactionType === 'SHIP') {
      if (!shipMode) {
        return NextResponse.json({ error: 'shipMode is required for SHIP' }, { status: 400 })
      }

      const cartons = expectedCartons ?? 0
      const pallets = expectedPallets ?? 0

      if (shipMode === 'CARTONS') {
        const handlingRate = ratesByCostName.get('Replenishment Handling')
        const minimumRate = ratesByCostName.get('Replenishment Minimum')

        if (handlingRate && minimumRate) {
          const handlingCost = handlingRate.costValue * cartons
          const minimumCost = minimumRate.costValue

          if (handlingCost >= minimumCost) {
            items.push({
              costCategory: 'Outbound',
              costName: handlingRate.costName,
              quantity: cartons,
              unitRate: handlingRate.costValue,
              totalCost: roundMoney(handlingCost),
            })
            totalEstimate += handlingCost
          } else {
            items.push({
              costCategory: 'Outbound',
              costName: minimumRate.costName,
              quantity: 1,
              unitRate: minimumRate.costValue,
              totalCost: roundMoney(minimumCost),
            })
            totalEstimate += minimumCost
          }
        }
      } else if (shipMode === 'PALLETS') {
        if (pallets > 0 && pallets <= 28) {
          const truckingName = outboundTruckingCostName(pallets)
          const rate = ratesByCostName.get(truckingName)
          if (rate) {
            const totalCost = rate.unitOfMeasure.startsWith('per_pallet')
              ? rate.costValue * pallets
              : rate.costValue
            items.push({
              costCategory: 'Outbound',
              costName: rate.costName,
              quantity: pallets,
              unitRate: rate.costValue,
              totalCost: roundMoney(totalCost),
            })
            totalEstimate += totalCost
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      warehouseCode,
      warehouseName: warehouse.name,
      transactionType,
      receiveType: transactionType === 'RECEIVE' ? receiveType : null,
      shipMode: transactionType === 'SHIP' ? shipMode : null,
      inputs: {
        expectedCartons,
        expectedPallets,
        expectedSkuCount,
      },
      items,
      totalEstimate: roundMoney(totalEstimate),
    })
  } catch (error) {
    console.error('Error estimating costs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to estimate costs' },
      { status: 500 }
    )
  }
}

function inboundContainerCostName(receiveType: string): string {
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
    default:
      return ''
  }
}

function outboundTruckingCostName(pallets: number): string {
  if (pallets <= 8) return 'FBA Trucking - Up to 8 Pallets'
  if (pallets <= 12) return 'FBA Trucking - 9-12 Pallets'
  return 'FBA Trucking - 13-28 Pallets (FTL)'
}

function roundMoney(amount: number): number {
  return Number(amount.toFixed(2))
}
