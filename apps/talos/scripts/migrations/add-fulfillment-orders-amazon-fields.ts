#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@targon/prisma-talos'
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
Add Fulfillment Order Amazon Fields

Adds Amazon inbound shipment + freight metadata columns to fulfillment_orders.
Idempotent migration for deployments without prisma migrate deploy.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-fulfillment-orders-amazon-fields.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function execute(
  prisma: PrismaClient,
  tenant: TenantCode,
  sql: string,
  options: ScriptOptions
) {
  const trimmed = sql.trim()
  if (!trimmed) return
  if (options.dryRun) {
    console.log(
      `[${tenant}] DRY RUN: ${trimmed.replaceAll(/\s+/g, ' ').slice(0, 240)}${trimmed.length > 240 ? '…' : ''}`
    )
    return
  }
  await prisma.$executeRawUnsafe(sql)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Adding Amazon fulfillment order fields`)

  const ddlStatements: string[] = [
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipment_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipment_name" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipment_status" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_destination_fulfillment_center_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_label_prep_type" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_box_contents_source" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_ship_from_address" JSONB;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_reference_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipment_reference" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipper_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_number" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_appointment_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_delivery_appointment_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_load_id" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_freight_bill_number" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_bill_of_lading_number" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_window_start" TIMESTAMP(3);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_window_end" TIMESTAMP(3);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_delivery_window_start" TIMESTAMP(3);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_delivery_window_end" TIMESTAMP(3);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_address" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_contact_name" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pickup_contact_phone" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_delivery_address" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_shipment_mode" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_box_count" INTEGER;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_pallet_count" INTEGER;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_commodity_description" TEXT;`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_distance_miles" NUMERIC(10,2);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_base_price" NUMERIC(12,2);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_fuel_surcharge" NUMERIC(12,2);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_total_price" NUMERIC(12,2);`,
    `ALTER TABLE "fulfillment_orders" ADD COLUMN IF NOT EXISTS "amazon_currency" TEXT;`,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_orders_amazon_shipment_id_idx"
        ON "fulfillment_orders" ("amazon_shipment_id");
    `,
  ]

  for (const statement of ddlStatements) {
    await execute(prisma, tenant, statement, options)
  }
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
