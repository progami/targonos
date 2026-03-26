import { NextResponse } from 'next/server'
import { getTenantPrismaClient } from '@/lib/tenant/prisma-factory'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const prisma = await getTenantPrismaClient('UK')

    // Create the missing global_reference_counters table in dev_talos_uk schema
    await prisma.$executeRawUnsafe(`SET search_path TO dev_talos_uk`)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "dev_talos_uk"."global_reference_counters" (
        "counter_key" TEXT NOT NULL,
        "next_value" BIGINT NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "global_reference_counters_pkey" PRIMARY KEY ("counter_key")
      )
    `)

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "dev_talos_uk"."global_reference_counters"
        DROP CONSTRAINT IF EXISTS "global_reference_counters_next_value_check"
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "dev_talos_uk"."global_reference_counters"
        ADD CONSTRAINT "global_reference_counters_next_value_check"
        CHECK ("next_value" > 0)
    `)

    return NextResponse.json({ success: true, message: 'global_reference_counters table created in tenant schema' })
  } catch (error) {
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
      storageBillingModel: 'WEEKLY_ARRIVAL_CUTOFF',
      cutoffHour: 12,
      halfWeekRate: 1.95,
      fullWeekRate: 3.90,
    }

    const fmc = await prisma.warehouse.upsert({
      where: { code: 'FMC' },
      update: {
        name: 'FMC Logistics',
        address: 'B-Area, stree 2 london',
        contactEmail: 'fmclogi@gmail.com',
        kind: 'THIRD_PARTY',
        billingConfig,
      },
      create: {
        code: 'FMC',
        name: 'FMC Logistics',
        address: 'B-Area, stree 2 london',
        contactEmail: 'fmclogi@gmail.com',
        kind: 'THIRD_PARTY',
        billingConfig,
      },
    })

    const rate1 = await prisma.costRate.upsert({
      where: {
        warehouseId_costName_effectiveDate: {
          warehouseId: fmc.id,
          costName: "40' Container Handling",
          effectiveDate: new Date('2026-01-01'),
        },
      },
      update: { costValue: 525, costCategory: 'Inbound', unitOfMeasure: 'per_container', isActive: true },
      create: {
        warehouseId: fmc.id,
        costCategory: 'Inbound',
        costName: "40' Container Handling",
        costValue: 525,
        unitOfMeasure: 'per_container',
        effectiveDate: new Date('2026-01-01'),
        isActive: true,
        createdById: admin.id,
      },
    })

    const rate2 = await prisma.costRate.upsert({
      where: {
        warehouseId_costName_effectiveDate: {
          warehouseId: fmc.id,
          costName: 'Warehouse Storage',
          effectiveDate: new Date('2026-01-01'),
        },
      },
      update: { costValue: 0.557142857, costCategory: 'Storage', unitOfMeasure: 'per_pallet_day', isActive: true },
      create: {
        warehouseId: fmc.id,
        costCategory: 'Storage',
        costName: 'Warehouse Storage',
        costValue: 0.557142857,
        unitOfMeasure: 'per_pallet_day',
        effectiveDate: new Date('2026-01-01'),
        isActive: true,
        createdById: admin.id,
      },
    })

    // FMC does not charge Pallet & Shrink Wrap Fee — seed at £0 so the rate lookup doesn't fail
    const rate3 = await prisma.costRate.upsert({
      where: {
        warehouseId_costName_effectiveDate: {
          warehouseId: fmc.id,
          costName: 'Pallet & Shrink Wrap Fee',
          effectiveDate: new Date('2026-01-01'),
        },
      },
      update: { costValue: 0, costCategory: 'Inbound', unitOfMeasure: 'per_pallet', isActive: true },
      create: {
        warehouseId: fmc.id,
        costCategory: 'Inbound',
        costName: 'Pallet & Shrink Wrap Fee',
        costValue: 0,
        unitOfMeasure: 'per_pallet',
        effectiveDate: new Date('2026-01-01'),
        isActive: true,
        createdById: admin.id,
      },
    })

    const ukMainWarehouses = await prisma.warehouse.findMany({
      where: { code: { not: 'FMC' } },
      select: { id: true, code: true },
    })

    const ukMain = ukMainWarehouses.find(w => w.code !== 'FMC') ?? null
    const configResults: { skuCode: string; storage: number | null; shipping: number | null }[] = []

    if (ukMain) {
      const existingConfigs = await prisma.warehouseSkuStorageConfig.findMany({
        where: { warehouseId: ukMain.id },
        include: { sku: { select: { skuCode: true, isActive: true } } },
      })

      for (const cfg of existingConfigs) {
        if (!cfg.sku.isActive) continue
        const result = await prisma.warehouseSkuStorageConfig.upsert({
          where: { warehouseId_skuId: { warehouseId: fmc.id, skuId: cfg.skuId } },
          update: {
            storageCartonsPerPallet: cfg.storageCartonsPerPallet,
            shippingCartonsPerPallet: cfg.shippingCartonsPerPallet,
          },
          create: {
            warehouseId: fmc.id,
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
      warehouse: { id: fmc.id, code: fmc.code, name: fmc.name, address: fmc.address, email: fmc.contactEmail, kind: fmc.kind },
      rates: [
        { name: rate1.costName, category: rate1.costCategory, value: Number(rate1.costValue), unit: rate1.unitOfMeasure },
        { name: rate2.costName, category: rate2.costCategory, value: Number(rate2.costValue), unit: rate2.unitOfMeasure },
        { name: rate3.costName, category: rate3.costCategory, value: Number(rate3.costValue), unit: rate3.unitOfMeasure },
      ],
      skuConfigsSeeded: configResults.length,
      skuConfigs: configResults,
      sourceWarehouse: ukMain?.code ?? 'none found',
    })
  } catch (error) {
    console.error('Seed FMC error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
