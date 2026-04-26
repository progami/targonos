#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PurchaseOrderLineStatus,
  PurchaseOrderStatus,
  TenantCode,
} from '@targon/prisma-talos'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'

type CleanupMode = 'void' | 'hard-delete'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  mode: CleanupMode
  apply: boolean
  limit?: number
  help?: boolean
}

const LEGACY_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.AWAITING_PROOF,
  PurchaseOrderStatus.REVIEW,
  PurchaseOrderStatus.POSTED,
  PurchaseOrderStatus.ARCHIVED,
]

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    mode: 'void',
    apply: false,
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (arg === '--') {
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--apply') {
      options.apply = true
      continue
    }

    if (arg === '--mode=void') {
      options.mode = 'void'
      continue
    }
    if (arg === '--mode=hard-delete') {
      options.mode = 'hard-delete'
      continue
    }

    if (arg.startsWith('--tenant=')) {
      const value = arg.split('=')[1]?.toUpperCase()
      if (value === 'US' || value === 'UK') {
        options.tenants = [value]
        continue
      }
      if (value === 'ALL') {
        options.tenants = ['US', 'UK']
        continue
      }
      throw new Error(`Invalid --tenant value: ${value ?? ''} (expected US, UK, or ALL)`)
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`)
      }
      options.limit = value
      continue
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Cleanup Legacy Purchase Orders

This script finds "legacy" purchase orders and either voids them (default) or hard-deletes them.

Legacy criteria:
  - purchase_orders.is_legacy = true
  - OR purchase_orders.po_number IS NULL
  - OR purchase_orders.status in: ${LEGACY_STATUSES.join(', ')}

Usage:
  pnpm --filter @targon/talos po:cleanup-legacy [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --mode=void               Set legacy orders to CANCELLED (default)
  --mode=hard-delete        Delete legacy purchase orders after cleanup
  --limit=N                 Process at most N orders per tenant (default: unlimited)
  --apply                   Apply changes (default: dry-run)
  --help, -h                Show this help

Notes:
  - In void mode, non-POSTED legacy orders have their linked inventory transactions deleted
    (cost ledger rows cascade via FK) and their PO lines are marked CANCELLED.
  - In hard-delete mode, the purchase order record is deleted (lines/containers/movement notes cascade).
  - Loads the exact Talos env selected by TALOS_ENV_MODE (default local) and resolves tenant schema automatically.
`)
}

async function runTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  try {
    const where = {
      OR: [{ isLegacy: true }, { poNumber: null }, { status: { in: LEGACY_STATUSES } }],
    }

    const legacyOrders = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: options.limit,
      select: {
        id: true,
        orderNumber: true,
        poNumber: true,
        status: true,
        isLegacy: true,
        postedAt: true,
        createdAt: true,
      },
    })

    console.log(`\n[${tenant}] Found ${legacyOrders.length} legacy purchase order(s)`)

    if (legacyOrders.length === 0) {
      return
    }

    const countsByStatus = legacyOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1
      return acc
    }, {})
    console.log(
      `[${tenant}] Breakdown: ${Object.entries(countsByStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`
    )

    if (!options.apply) {
      console.log(`[${tenant}] Dry-run only (pass --apply to execute)`)
      return
    }

    for (const order of legacyOrders) {
      const display = order.poNumber ?? order.orderNumber
      await prisma.$transaction(async tx => {
        const current = await tx.purchaseOrder.findUnique({
          where: { id: order.id },
          select: { status: true, postedAt: true },
        })
        if (!current) return

        const previousStatus = current.status as PurchaseOrderStatus
        if (options.mode === 'void') {
          const targetStatus = PurchaseOrderStatus.CANCELLED

          if (previousStatus !== PurchaseOrderStatus.POSTED) {
            await tx.inventoryTransaction.deleteMany({
              where: { purchaseOrderId: order.id },
            })
            await tx.purchaseOrderLine.updateMany({
              where: { purchaseOrderId: order.id },
              data: {
                status: PurchaseOrderLineStatus.CANCELLED,
                postedQuantity: 0,
              },
            })
          }

          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: {
              status: targetStatus,
              postedAt: current.postedAt,
            },
          })
          return
        }

        if (options.mode === 'hard-delete') {
          if (previousStatus !== PurchaseOrderStatus.POSTED) {
            await tx.inventoryTransaction.deleteMany({
              where: { purchaseOrderId: order.id },
            })
          }

          await tx.purchaseOrder.delete({
            where: { id: order.id },
          })
        }
      })

      console.log(`[${tenant}] Processed ${display} (${order.id})`)
    }

    console.log(`[${tenant}] Done`)
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

async function run() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  const tenants = Array.from(new Set(options.tenants))

  for (const tenant of tenants) {
    await runTenant(tenant, options)
  }
}

process.on('SIGINT', () => {
  console.error('\nInterrupted')
  process.exit(1)
})

run().catch(error => {
  console.error('Cleanup failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
