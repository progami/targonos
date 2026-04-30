#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  help?: boolean
}

function loadEnv() {
  loadTalosScriptEnv()
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
Add Inbound Proforma Invoices Table

Creates inbound_order_proforma_invoices and backfills rows from inbound_orders.proforma_invoice_number.
This supports multiple PI numbers per Inbound.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-inbound-proforma-invoices-table.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function ensureTable(prisma: Awaited<ReturnType<typeof getTenantPrismaClient>>, tenant: TenantCode, options: ScriptOptions) {
  console.log(`\n[${tenant}] Ensuring inbound_order_proforma_invoices exists`)

  const ddlStatements = [
    `
      CREATE TABLE IF NOT EXISTS "inbound_order_proforma_invoices" (
        "id" text NOT NULL,
        "inbound_order_id" text NOT NULL,
        "pi_number" text NOT NULL,
        "invoice_date" timestamp(3) without time zone,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by_id" text,
        "created_by_name" text,
        CONSTRAINT "inbound_order_proforma_invoices_pkey" PRIMARY KEY ("id")
      )
    `,
    `ALTER TABLE "inbound_order_proforma_invoices" DROP CONSTRAINT IF EXISTS "inbound_order_proforma_invoices_inbound_order_id_fkey"`,
    `
      ALTER TABLE "inbound_order_proforma_invoices"
        ADD CONSTRAINT "inbound_order_proforma_invoices_inbound_order_id_fkey"
        FOREIGN KEY ("inbound_order_id") REFERENCES "inbound_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `,
    `ALTER TABLE "inbound_order_proforma_invoices" DROP CONSTRAINT IF EXISTS "inbound_order_proforma_invoices_inbound_order_id_pi_number_key"`,
    `
      ALTER TABLE "inbound_order_proforma_invoices"
        ADD CONSTRAINT "inbound_order_proforma_invoices_inbound_order_id_pi_number_key"
        UNIQUE ("inbound_order_id", "pi_number")
    `,
    `CREATE INDEX IF NOT EXISTS "inbound_order_proforma_invoices_inbound_order_id_idx" ON "inbound_order_proforma_invoices"("inbound_order_id")`,
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
  console.log(`[${tenant}] Backfilling proforma invoices from inbound_orders`)

  const orders = await prisma.inboundOrder.findMany({
    where: {
      proformaInvoiceNumber: { not: null },
      isLegacy: false,
    },
    select: {
      id: true,
      proformaInvoiceNumber: true,
      proformaInvoiceDate: true,
      rfqApprovedById: true,
      rfqApprovedByName: true,
    },
  })

  const candidates = orders
    .map(order => {
      const piNumber = order.proformaInvoiceNumber?.trim()
      if (!piNumber) return null
      return {
        inboundOrderId: order.id,
        piNumber,
        invoiceDate: order.proformaInvoiceDate ?? null,
        createdById: order.rfqApprovedById ?? null,
        createdByName: order.rfqApprovedByName ?? null,
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)

  console.log(`[${tenant}] Found ${candidates.length.toLocaleString()} inbound_orders with PI numbers`)
  if (options.dryRun) {
    return
  }

  for (const candidate of candidates) {
    await prisma.inboundOrderProformaInvoice.upsert({
      where: {
        inboundOrderId_piNumber: {
          inboundOrderId: candidate.inboundOrderId,
          piNumber: candidate.piNumber,
        },
      },
      create: {
        inboundOrderId: candidate.inboundOrderId,
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
