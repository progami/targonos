#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  help?: boolean
}

function loadEnv() {
  const candidates = ['.env.local', '.env.production', '.env.dev', '.env']
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const candidate of candidates) {
    const fullPath = path.join(appDir, candidate)
    if (!fs.existsSync(fullPath)) continue
    dotenv.config({ path: fullPath })
    return
  }
  dotenv.config({ path: path.join(appDir, '.env') })
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    dryRun: false,
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
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

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Add Purchase Order Proforma Invoices Table

Creates purchase_order_proforma_invoices and backfills rows from purchase_orders.proforma_invoice_number.
This supports multiple PI numbers per PO.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-po-proforma-invoices-table.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function ensureTable(prisma: Awaited<ReturnType<typeof getTenantPrismaClient>>, tenant: TenantCode, options: ScriptOptions) {
  console.log(`\n[${tenant}] Ensuring purchase_order_proforma_invoices exists`)

  const ddlStatements = [
    `
      CREATE TABLE IF NOT EXISTS "purchase_order_proforma_invoices" (
        "id" text NOT NULL,
        "purchase_order_id" text NOT NULL,
        "pi_number" text NOT NULL,
        "invoice_date" timestamp(3) without time zone,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by_id" text,
        "created_by_name" text,
        CONSTRAINT "purchase_order_proforma_invoices_pkey" PRIMARY KEY ("id")
      )
    `,
    `ALTER TABLE "purchase_order_proforma_invoices" DROP CONSTRAINT IF EXISTS "purchase_order_proforma_invoices_purchase_order_id_fkey"`,
    `
      ALTER TABLE "purchase_order_proforma_invoices"
        ADD CONSTRAINT "purchase_order_proforma_invoices_purchase_order_id_fkey"
        FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `,
    `ALTER TABLE "purchase_order_proforma_invoices" DROP CONSTRAINT IF EXISTS "purchase_order_proforma_invoices_purchase_order_id_pi_number_key"`,
    `
      ALTER TABLE "purchase_order_proforma_invoices"
        ADD CONSTRAINT "purchase_order_proforma_invoices_purchase_order_id_pi_number_key"
        UNIQUE ("purchase_order_id", "pi_number")
    `,
    `CREATE INDEX IF NOT EXISTS "purchase_order_proforma_invoices_purchase_order_id_idx" ON "purchase_order_proforma_invoices"("purchase_order_id")`,
  ]

  for (const statement of ddlStatements) {
    const sql = statement.trim()
    if (!sql) continue
    if (options.dryRun) {
      console.log(
        `[${tenant}] DRY RUN: ${sql.replaceAll(/\s+/g, ' ').slice(0, 240)}${sql.length > 240 ? '…' : ''}`
      )
      continue
    }
    await prisma.$executeRawUnsafe(sql)
  }
}

async function backfill(prisma: Awaited<ReturnType<typeof getTenantPrismaClient>>, tenant: TenantCode, options: ScriptOptions) {
  console.log(`[${tenant}] Backfilling proforma invoices from purchase_orders`)

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      proformaInvoiceNumber: { not: null },
      isLegacy: false,
    },
    select: {
      id: true,
      proformaInvoiceNumber: true,
      proformaInvoiceDate: true,
      draftApprovedById: true,
      draftApprovedByName: true,
    },
  })

  const candidates = orders
    .map(order => {
      const piNumber = order.proformaInvoiceNumber?.trim()
      if (!piNumber) return null
      return {
        purchaseOrderId: order.id,
        piNumber,
        invoiceDate: order.proformaInvoiceDate ?? null,
        createdById: order.draftApprovedById ?? null,
        createdByName: order.draftApprovedByName ?? null,
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)

  console.log(`[${tenant}] Found ${candidates.length.toLocaleString()} purchase_orders with PI numbers`)
  if (options.dryRun) {
    return
  }

  for (const candidate of candidates) {
    await prisma.purchaseOrderProformaInvoice.upsert({
      where: {
        purchaseOrderId_piNumber: {
          purchaseOrderId: candidate.purchaseOrderId,
          piNumber: candidate.piNumber,
        },
      },
      create: {
        purchaseOrderId: candidate.purchaseOrderId,
        piNumber: candidate.piNumber,
        invoiceDate: candidate.invoiceDate,
        createdById: candidate.createdById,
        createdByName: candidate.createdByName,
      },
      update: {
        invoiceDate: candidate.invoiceDate,
      },
    })
  }
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  await ensureTable(prisma, tenant, options)
  await backfill(prisma, tenant, options)
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  for (const tenant of options.tenants) {
    await applyForTenant(tenant, options)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

