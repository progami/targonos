#!/usr/bin/env npx tsx

/**
 * Setup script: sample inbound
 * --------------------------------------------------
 * Usage:
 *   pnpm --filter @targon/talos exec tsx scripts/setup/inbound.ts [--skip-clean] [--verbose]
 */

import { PrismaClient, InboundOrderType, InboundOrderStatus, Prisma } from '@targon/prisma-talos'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const skipClean = args.includes('--skip-clean')
const verbose = args.includes('--verbose')

function log(message: string, data?: unknown) {
  console.log(`[setup][inbound] ${message}`)
  if (verbose && data !== undefined) {
    console.log(JSON.stringify(data, null, 2))
  }
}

async function cleanInboundOrders() {
  if (skipClean) {
    log('Skipping inbound clean up')
    return
  }

  await prisma.grnLine.deleteMany()
  await prisma.grn.deleteMany()
  await prisma.inventoryTransaction.deleteMany()
  await prisma.inboundOrderLine.deleteMany()
  await prisma.inboundOrder.deleteMany()
  log('Removed existing inbound')
}

type SampleOrder = {
  orderNumber: string
  type: InboundOrderType
  status: InboundOrderStatus
  counterpartyName: string
  expectedInDays: number
  notes: string
  posted?: boolean
  /** quantity = cartons ordered; units are derived from SKU unitsPerCarton */
  lines: Array<{ skuIndex: number; quantity: number; unitCost: number; batchSuffix?: number }>
}

async function createInboundOrders() {
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
      orderNumber: 'IN-1001',
      type: InboundOrderType.PURCHASE,
      status: InboundOrderStatus.ISSUED,
      counterpartyName: 'CS Suppliers',
      expectedInDays: 7,
      notes: 'Issued order staged for initial inventory build.',
      lines: [
        { skuIndex: 0, quantity: 120, unitCost: 18 },
        { skuIndex: 1, quantity: 80, unitCost: 22 },
      ],
    },
    {
      orderNumber: 'IN-1002',
      type: InboundOrderType.PURCHASE,
      status: InboundOrderStatus.ISSUED,
      counterpartyName: 'FMC Manufacturing',
      expectedInDays: 3,
      notes: 'Supplier accepted; signed PI received and queued for production.',
      lines: [
        { skuIndex: 2, quantity: 60, unitCost: 25 },
        { skuIndex: 3, quantity: 42, unitCost: 28 },
      ],
    },
    {
      orderNumber: 'IN-1003',
      type: InboundOrderType.PURCHASE,
      status: InboundOrderStatus.MANUFACTURING,
      counterpartyName: 'Vglobal Fulfilment',
      expectedInDays: -2,
      notes: 'In production – manufacturing started with initial Inbound quantities.',
      lines: [
        { skuIndex: 4, quantity: 90, unitCost: 30 },
        { skuIndex: 5, quantity: 36, unitCost: 34 },
      ],
    },
    {
      orderNumber: 'IN-1004',
      type: InboundOrderType.PURCHASE,
      status: InboundOrderStatus.WAREHOUSE,
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

    await prisma.inboundOrder.upsert({
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
    log(`Inbound ready: ${sample.orderNumber} (${sample.status})`)
  }
}

async function main() {
  try {
    await cleanInboundOrders()
    await createInboundOrders()
    log('Inbound setup complete')
  } catch (error) {
    console.error('[setup][inbound] failed', error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()

export {}
