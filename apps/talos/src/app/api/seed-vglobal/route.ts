import { NextResponse } from 'next/server'
import { getTenantPrismaClient } from '@/lib/tenant/prisma-factory'
import { recordStorageCostEntry } from '@/services/storageCost.service'
import { endOfWeek, addWeeks } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const warehouseCode = url.searchParams.get('warehouseCode') ?? 'VGLOBAL'
    const prisma = await getTenantPrismaClient('UK')

    // Find all lots with receives at this warehouse
    const lots = await prisma.inventoryTransaction.groupBy({
      by: ['warehouseCode', 'warehouseName', 'skuCode', 'skuDescription', 'lotRef'],
      _min: { transactionDate: true },
      where: { warehouseCode },
    })

    const targetWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const lot of lots) {
      try {
        const firstDate = lot._min.transactionDate
        if (!firstDate) { skipped++; continue }

        const firstWeekEnd = endOfWeek(firstDate, { weekStartsOn: 1 })
        let currentWeekEnd = firstWeekEnd

        while (currentWeekEnd <= targetWeekEnd) {
          const exists = await prisma.storageLedger.findUnique({
            where: {
              warehouseCode_skuCode_lotRef_weekEndingDate: {
                warehouseCode: lot.warehouseCode,
                skuCode: lot.skuCode,
                lotRef: lot.lotRef,
                weekEndingDate: currentWeekEnd,
              },
            },
            select: { id: true },
          })

          if (!exists) {
            const balance = await prisma.inventoryTransaction.aggregate({
              _sum: { cartonsIn: true, cartonsOut: true },
              where: {
                warehouseCode: lot.warehouseCode,
                skuCode: lot.skuCode,
                lotRef: lot.lotRef,
                transactionDate: { lte: currentWeekEnd },
              },
            })
            const net = Number(balance._sum.cartonsIn ?? 0) - Number(balance._sum.cartonsOut ?? 0)

            if (net > 0) {
              const result = await recordStorageCostEntry({
                warehouseCode: lot.warehouseCode,
                warehouseName: lot.warehouseName,
                skuCode: lot.skuCode,
                skuDescription: lot.skuDescription,
                lotRef: lot.lotRef,
                transactionDate: currentWeekEnd,
              })
              if (result) created++
              else skipped++
            } else {
              skipped++
            }
          } else {
            skipped++
          }

          currentWeekEnd = addWeeks(currentWeekEnd, 1)
        }
      } catch (error) {
        errors.push(`${lot.skuCode}/${lot.lotRef}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    return NextResponse.json({ success: true, created, skipped, errors })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    const prisma = await getTenantPrismaClient('UK')

    const admin = await prisma.user.findFirst({
      where: { role: 'admin', isActive: true },
      select: { id: true, fullName: true },
    })
    if (!admin) return NextResponse.json({ error: 'No admin user found' }, { status: 500 })

    const billingConfig = {
      storageBillingModel: 'WEEKLY_PALLET',
      weeklyPalletRate: 2.60,
      graceDays: 2,
      maxPalletHeightMm: 1600,
    }

    const vglobal = await prisma.warehouse.upsert({
      where: { code: 'VGLOBAL' },
      update: {
        name: 'V Global Logistics',
        address: '123 Warehouse Road, London',
        contactEmail: 'info@vglobal.co.uk',
        kind: 'THIRD_PARTY',
        billingConfig,
      },
      create: {
        code: 'VGLOBAL',
        name: 'V Global Logistics',
        address: '123 Warehouse Road, London',
        contactEmail: 'info@vglobal.co.uk',
        kind: 'THIRD_PARTY',
        billingConfig,
      },
    })

    const effectiveDate = new Date('2026-01-01')

    const rateDefinitions = [
      // Inbound - Container handling
      { costName: "20' Container Handling", costValue: 220, costCategory: 'Inbound' as const, unitOfMeasure: 'per_container' },
      { costName: "40' HQ Container Handling", costValue: 390, costCategory: 'Inbound' as const, unitOfMeasure: 'per_container' },
      { costName: "40' HQ Container Handling (1000+ Cartons)", costValue: 445, costCategory: 'Inbound' as const, unitOfMeasure: 'per_container' },
      // Inbound - Per carton/pallet charges (mandatory)
      { costName: 'Label Printed', costValue: 0.45, costCategory: 'Inbound' as const, unitOfMeasure: 'per_carton' },
      { costName: 'Pallets Putaway', costValue: 2.10, costCategory: 'Inbound' as const, unitOfMeasure: 'per_pallet' },
      // Inbound - Optional charges (seeded for reference)
      { costName: 'Pallets Supplied', costValue: 7.75, costCategory: 'Inbound' as const, unitOfMeasure: 'per_pallet' },
      { costName: 'Pallet Wrapping', costValue: 1.85, costCategory: 'Inbound' as const, unitOfMeasure: 'per_pallet' },
      // Storage
      { costName: 'Warehouse Storage', costValue: 2.60, costCategory: 'Storage' as const, unitOfMeasure: 'per_pallet_week' },
    ]

    const seededRates = []
    for (const def of rateDefinitions) {
      const rate = await prisma.costRate.upsert({
        where: {
          warehouseId_costName_effectiveDate: {
            warehouseId: vglobal.id,
            costName: def.costName,
            effectiveDate,
          },
        },
        update: { costValue: def.costValue, costCategory: def.costCategory, unitOfMeasure: def.unitOfMeasure, isActive: true },
        create: {
          warehouseId: vglobal.id,
          costCategory: def.costCategory,
          costName: def.costName,
          costValue: def.costValue,
          unitOfMeasure: def.unitOfMeasure,
          effectiveDate,
          isActive: true,
          createdById: admin.id,
        },
      })
      seededRates.push({
        name: rate.costName,
        category: rate.costCategory,
        value: Number(rate.costValue),
        unit: rate.unitOfMeasure,
      })
    }

    // Copy SKU storage configs from existing UK warehouse (FMC or other)
    const otherUkWarehouses = await prisma.warehouse.findMany({
      where: { code: { not: 'VGLOBAL' } },
      select: { id: true, code: true },
    })

    const sourceWarehouse = otherUkWarehouses.find(w => w.code === 'FMC') ?? otherUkWarehouses[0] ?? null
    const configResults: { skuCode: string; storage: number | null; shipping: number | null }[] = []

    if (sourceWarehouse) {
      const existingConfigs = await prisma.warehouseSkuStorageConfig.findMany({
        where: { warehouseId: sourceWarehouse.id },
        include: { sku: { select: { skuCode: true, isActive: true } } },
      })

      for (const cfg of existingConfigs) {
        if (!cfg.sku.isActive) continue
        const result = await prisma.warehouseSkuStorageConfig.upsert({
          where: { warehouseId_skuId: { warehouseId: vglobal.id, skuId: cfg.skuId } },
          update: {
            storageCartonsPerPallet: cfg.storageCartonsPerPallet,
            shippingCartonsPerPallet: cfg.shippingCartonsPerPallet,
          },
          create: {
            warehouseId: vglobal.id,
            skuId: cfg.skuId,
            storageCartonsPerPallet: cfg.storageCartonsPerPallet,
            shippingCartonsPerPallet: cfg.shippingCartonsPerPallet,
          },
        })
        configResults.push({
          skuCode: cfg.sku.skuCode,
          storage: result.storageCartonsPerPallet,
          shipping: result.shippingCartonsPerPallet,
        })
      }
    }

    return NextResponse.json({
      success: true,
      warehouse: {
        id: vglobal.id,
        code: vglobal.code,
        name: vglobal.name,
        address: vglobal.address,
        email: vglobal.contactEmail,
        kind: vglobal.kind,
        billingConfig,
      },
      rates: seededRates,
      skuConfigsSeeded: configResults.length,
      skuConfigs: configResults,
      sourceWarehouse: sourceWarehouse?.code ?? 'none found',
    })
  } catch (error) {
    console.error('Seed V Global error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
