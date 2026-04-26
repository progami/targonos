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
Add Warehouse SKU Storage Configs

Creates the warehouse_sku_storage_configs table (if missing) and backfills a
row for each (warehouse, sku) pair to support per-warehouse pallet conversions.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-warehouse-sku-storage-configs.ts [options]

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

  console.log(`\n[${tenant}] Ensuring warehouse_sku_storage_configs schema is present`)

  const ddlStatements: string[] = [
    `
      CREATE TABLE IF NOT EXISTS "warehouse_sku_storage_configs" (
        "id" text NOT NULL,
        "warehouse_id" text NOT NULL,
        "sku_id" text NOT NULL,
        "storage_cartons_per_pallet" integer,
        "shipping_cartons_per_pallet" integer,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "warehouse_sku_storage_configs_pkey" PRIMARY KEY ("id")
      )
    `,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'warehouse_sku_storage_configs_warehouse_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "warehouse_sku_storage_configs"
            ADD CONSTRAINT "warehouse_sku_storage_configs_warehouse_id_fkey"
            FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'warehouse_sku_storage_configs_sku_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "warehouse_sku_storage_configs"
            ADD CONSTRAINT "warehouse_sku_storage_configs_sku_id_fkey"
            FOREIGN KEY ("sku_id") REFERENCES "skus"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_sku_storage_configs_warehouse_id_sku_id_key" ON "warehouse_sku_storage_configs"("warehouse_id", "sku_id")`,
    `CREATE INDEX IF NOT EXISTS "warehouse_sku_storage_configs_warehouse_id_idx" ON "warehouse_sku_storage_configs"("warehouse_id")`,
    `CREATE INDEX IF NOT EXISTS "warehouse_sku_storage_configs_sku_id_idx" ON "warehouse_sku_storage_configs"("sku_id")`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'warehouse_sku_storage_configs_storage_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "warehouse_sku_storage_configs"
            ADD CONSTRAINT "warehouse_sku_storage_configs_storage_cartons_per_pallet_check"
            CHECK (storage_cartons_per_pallet IS NULL OR storage_cartons_per_pallet > 0);
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'warehouse_sku_storage_configs_shipping_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "warehouse_sku_storage_configs"
            ADD CONSTRAINT "warehouse_sku_storage_configs_shipping_cartons_per_pallet_check"
            CHECK (shipping_cartons_per_pallet IS NULL OR shipping_cartons_per_pallet > 0);
        END IF;
      END $$;
    `,
  ]

  for (const statement of ddlStatements) {
    await execute(prisma, tenant, statement, options)
  }

  console.log(`[${tenant}] Backfilling warehouse_sku_storage_configs from DEFAULT batch (fallback to 48)`)

  const backfillSql = `
    INSERT INTO "warehouse_sku_storage_configs" (
      "id",
      "warehouse_id",
      "sku_id",
      "storage_cartons_per_pallet",
      "shipping_cartons_per_pallet",
      "created_at",
      "updated_at"
    )
    SELECT
      gen_random_uuid()::text,
      w.id,
      s.id,
      COALESCE(d.storage_cartons_per_pallet, 48),
      COALESCE(d.shipping_cartons_per_pallet, 48),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "warehouses" w
    CROSS JOIN "skus" s
    LEFT JOIN "sku_batches" d
      ON d.sku_id = s.id AND UPPER(d.batch_code) = 'DEFAULT'
    ON CONFLICT ("warehouse_id", "sku_id") DO NOTHING
  `

  await execute(prisma, tenant, backfillSql, options)
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
