#!/usr/bin/env npx tsx

/**
 * Setup script: sample purchase orders
 * --------------------------------------------------
 * Usage:
 *   pnpm --filter @targon/talos exec tsx scripts/setup/purchase-orders.ts [--skip-clean] [--verbose]
 */

import { PrismaClient, PurchaseOrderType, PurchaseOrderStatus, Prisma } from '@targon/prisma-talos'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const skipClean = args.includes('--skip-clean')
const verbose = args.includes('--verbose')

function log(message: string, data?: unknown) {
  console.log(`[setup][purchase-orders] ${message}`)
  if (verbose && data !== undefined) {
    console.log(JSON.stringify(data, null, 2))
  }
}

async function cleanPurchaseOrders() {
  if (skipClean) {
    log('Skipping purchase order clean up')
    return
  }

  await prisma.grnLine.deleteMany()
  await prisma.grn.deleteMany()
  await prisma.inventoryTransaction.deleteMany()
  await prisma.purchaseOrderLine.deleteMany()
  await prisma.purchaseOrder.deleteMany()
  log('Removed existing purchase orders')
}

type SampleOrder = {
  orderNumber: string
  type: PurchaseOrderType
  status: PurchaseOrderStatus
  counterpartyName: string
  expectedInDays: number
  notes: string
  posted?: boolean
  /** quantity = cartons ordered; units are derived from SKU unitsPerCarton */
  lines: Array<{ skuIndex: number; quantity: number; unitCost: number; batchSuffix?: number }>
}

async function createPurchaseOrders() {
  const warehouse = await prisma.warehouse.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!warehouse) {
    log('No warehouse available; run warehouse setup first')
    return
  }

  const skus = await prisma.sku.findMany({ orderBy: { skuCode: 'asc' } })
  if (skus.length === 0) {
    log('No SKUs available; run product setup first')
    return
  }

  const now = new Date()
  const samples: SampleOrder[] = [
    {
      orderNumber: 'PO-1001',
      type: PurchaseOrderType.PURCHASE,
      status: PurchaseOrderStatus.RFQ,
      counterpartyName: 'CS Suppliers',
      expectedInDays: 7,
      notes: 'Draft order staged for initial inventory build.',
      lines: [
        { skuIndex: 0, quantity: 120, unitCost: 18 },
        { skuIndex: 1, quantity: 80, unitCost: 22 },
      ],
    },
    {
      orderNumber: 'PO-1002',
      type: PurchaseOrderType.PURCHASE,
      status: PurchaseOrderStatus.ISSUED,
      counterpartyName: 'FMC Manufacturing',
      expectedInDays: 3,
      notes: 'Supplier accepted; signed PI received and queued for production.',
      lines: [
        { skuIndex: 2, quantity: 60, unitCost: 25 },
        { skuIndex: 3, quantity: 42, unitCost: 28 },
      ],
    },
    {
      orderNumber: 'PO-1003',
      type: PurchaseOrderType.PURCHASE,
      status: PurchaseOrderStatus.MANUFACTURING,
      counterpartyName: 'Vglobal Fulfilment',
      expectedInDays: -2,
      notes: 'In production – manufacturing started with initial PO quantities.',
      lines: [
        { skuIndex: 4, quantity: 90, unitCost: 30 },
        { skuIndex: 5, quantity: 36, unitCost: 34 },
      ],
    },
    {
      orderNumber: 'PO-1004',
      type: PurchaseOrderType.PURCHASE,
      status: PurchaseOrderStatus.WAREHOUSE,
      counterpartyName: 'West Coast Retail',
      expectedInDays: -5,
      notes: 'Received at warehouse and ready for downstream fulfillment flows.',
      posted: true,
      lines: [
        { skuIndex: 0, quantity: 40, unitCost: 18, batchSuffix: 7 },
        { skuIndex: 2, quantity: 24, unitCost: 25, batchSuffix: 8 },
      ],
    },
  ]

  for (const sample of samples) {
    const expectedDate = new Date(now.getTime() + sample.expectedInDays * 24 * 60 * 60 * 1000)
    const postedAt = sample.posted ? expectedDate : null

    const lines = sample.lines
      .map(({ skuIndex, quantity, unitCost, batchSuffix }, index) => {
        const sku = skus[skuIndex]
        if (!sku) return null
        const cartonsOrdered = quantity
        const unitsPerCarton = sku.unitsPerCarton ?? 1
        const unitsOrdered = cartonsOrdered * unitsPerCarton
        const unitCostDecimal = new Prisma.Decimal(unitCost)
	        return {
	          skuCode: sku.skuCode,
	          skuDescription: sku.description,
	          lotRef: `Lot-${batchSuffix ?? index + 1}-SETUP-${sku.skuCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
	          unitsOrdered,
	          unitsPerCarton,
	          quantity: cartonsOrdered,
          unitCost: unitCostDecimal,
          totalCost: unitCostDecimal.mul(unitsOrdered),
        }
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line))

    if (lines.length === 0) {
      log(`Skipping ${sample.orderNumber} – no valid SKUs found`)
      continue
    }

    await prisma.purchaseOrder.upsert({
      where: {
        orderNumber: sample.orderNumber,
      },
      update: {
        type: sample.type,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        counterpartyName: sample.counterpartyName,
        expectedDate,
        notes: sample.notes,
        status: sample.status,
        postedAt,
        lines: {
          deleteMany: {},
          create: lines,
        },
      },
      create: {
        orderNumber: sample.orderNumber,
        type: sample.type,
        status: sample.status,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        counterpartyName: sample.counterpartyName,
        expectedDate,
        postedAt,
        notes: sample.notes,
        lines: {
          create: lines,
        },
      },
    })
    log(`Purchase order ready: ${sample.orderNumber} (${sample.status})`)
  }
}

async function main() {
  try {
    await cleanPurchaseOrders()
    await createPurchaseOrders()
    log('Purchase order setup complete')
  } catch (error) {
    console.error('[setup][purchase-orders] failed', error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()

export {}
