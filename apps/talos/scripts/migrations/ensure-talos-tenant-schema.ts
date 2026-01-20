#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@targon/prisma-talos'
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
Ensure Talos Tenant Schema

Brings each tenant schema in sync with required baseline tables/columns used by
the Talos app (e.g. suppliers + supplier links + batch pallet fields).

This is an idempotent migration intended for deployments on long-lived schemas
where Prisma migrate deploy is not used.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/ensure-talos-tenant-schema.ts [options]

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

  console.log(`\n[${tenant}] Ensuring baseline schema is present`)

  const ddlStatements: string[] = [
    // suppliers table (missing in some schemas)
    `
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" text NOT NULL,
        "name" text NOT NULL,
        "contact_name" text,
        "email" text,
        "phone" text,
        "address" text,
        "notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
      )
    `,
    `CREATE INDEX IF NOT EXISTS "suppliers_is_active_idx" ON "suppliers"("is_active")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_name_key" ON "suppliers"("name")`,

    // link skus -> suppliers
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "default_supplier_id" text`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "secondary_supplier_id" text`,
    `CREATE INDEX IF NOT EXISTS "skus_default_supplier_id_idx" ON "skus"("default_supplier_id")`,
    `CREATE INDEX IF NOT EXISTS "skus_secondary_supplier_id_idx" ON "skus"("secondary_supplier_id")`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'skus_supplier_ids_distinct_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "skus"
            ADD CONSTRAINT "skus_supplier_ids_distinct_check"
            CHECK (
              default_supplier_id IS NULL
              OR secondary_supplier_id IS NULL
              OR default_supplier_id <> secondary_supplier_id
            );
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
          WHERE c.conname = 'skus_default_supplier_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "skus"
            ADD CONSTRAINT "skus_default_supplier_id_fkey"
            FOREIGN KEY ("default_supplier_id") REFERENCES "suppliers"("id")
            ON UPDATE CASCADE ON DELETE SET NULL;
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
          WHERE c.conname = 'skus_secondary_supplier_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "skus"
            ADD CONSTRAINT "skus_secondary_supplier_id_fkey"
            FOREIGN KEY ("secondary_supplier_id") REFERENCES "suppliers"("id")
            ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;
    `,



    // Amazon defaults on SKUs for fee tracking
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_category" text`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_size_tier" text`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_referral_fee_percent" numeric(5, 2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_fba_fulfillment_fee" numeric(12, 2)`,

    // Track FBA fee mismatch alerts per SKU (one row per SKU)
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'AmazonFbaFeeAlertStatus'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "AmazonFbaFeeAlertStatus" AS ENUM (
            'UNKNOWN',
            'MATCH',
            'MISMATCH',
            'NO_ASIN',
            'MISSING_REFERENCE',
            'ERROR'
          );
        END IF;
      END $$;
    `,
    `
      CREATE TABLE IF NOT EXISTS "amazon_fba_fee_alerts" (
        "id" text NOT NULL,
        "sku_id" text NOT NULL,
        "reference_size_tier" text,
        "reference_fba_fulfillment_fee" numeric(12, 2),
        "amazon_fba_fulfillment_fee" numeric(12, 2),
        "currency_code" text,
        "listing_price" numeric(12, 2),
        "status" "AmazonFbaFeeAlertStatus" NOT NULL DEFAULT 'UNKNOWN',
        "message" text,
        "checked_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "amazon_fba_fee_alerts_pkey" PRIMARY KEY ("id")
      )
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "amazon_fba_fee_alerts_sku_id_key" ON "amazon_fba_fee_alerts"("sku_id")`,
    `CREATE INDEX IF NOT EXISTS "amazon_fba_fee_alerts_status_idx" ON "amazon_fba_fee_alerts"("status")`,
    `CREATE INDEX IF NOT EXISTS "amazon_fba_fee_alerts_checked_at_idx" ON "amazon_fba_fee_alerts"("checked_at")`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'amazon_fba_fee_alerts_sku_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "amazon_fba_fee_alerts"
            ADD CONSTRAINT "amazon_fba_fee_alerts_sku_id_fkey"
            FOREIGN KEY ("sku_id") REFERENCES "skus"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    // batch pallet configuration fields (missing in some schemas)
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "storage_cartons_per_pallet" integer`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "shipping_cartons_per_pallet" integer`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'sku_batches_storage_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "sku_batches"
            ADD CONSTRAINT "sku_batches_storage_cartons_per_pallet_check"
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
          WHERE c.conname = 'sku_batches_shipping_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "sku_batches"
            ADD CONSTRAINT "sku_batches_shipping_cartons_per_pallet_check"
            CHECK (shipping_cartons_per_pallet IS NULL OR shipping_cartons_per_pallet > 0);
        END IF;
      END $$;
    `,

    // Purchase order essentials (stage 1 / issued)
    `ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ISSUED'`,
    `ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED'`,
    `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "incoterms" text`,
    `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "payment_terms" text`,
    `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "counterparty_address" text`,

    // Purchase order line snapshots (avoid dynamic SKU/batch enrichment after creation)
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "carton_dimensions_cm" text`,
    `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_side1_cm'
        ) THEN
          ALTER TABLE "purchase_order_lines" RENAME COLUMN "carton_length_cm" TO "carton_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_side2_cm'
        ) THEN
          ALTER TABLE "purchase_order_lines" RENAME COLUMN "carton_width_cm" TO "carton_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_side3_cm'
        ) THEN
          ALTER TABLE "purchase_order_lines" RENAME COLUMN "carton_height_cm" TO "carton_side3_cm";
        END IF;
      END $$;
    `,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "carton_side1_cm" numeric(8, 2)`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "carton_side2_cm" numeric(8, 2)`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "carton_side3_cm" numeric(8, 2)`,
    `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_length_cm'
        ) THEN
          UPDATE purchase_order_lines
          SET carton_side1_cm = COALESCE(carton_side1_cm, carton_length_cm)
          WHERE carton_length_cm IS NOT NULL AND carton_side1_cm IS NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_width_cm'
        ) THEN
          UPDATE purchase_order_lines
          SET carton_side2_cm = COALESCE(carton_side2_cm, carton_width_cm)
          WHERE carton_width_cm IS NOT NULL AND carton_side2_cm IS NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'purchase_order_lines'
            AND column_name = 'carton_height_cm'
        ) THEN
          UPDATE purchase_order_lines
          SET carton_side3_cm = COALESCE(carton_side3_cm, carton_height_cm)
          WHERE carton_height_cm IS NOT NULL AND carton_side3_cm IS NULL;
        END IF;
      END $$;
    `,
    `ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "carton_length_cm"`,
    `ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "carton_width_cm"`,
    `ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "carton_height_cm"`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "carton_weight_kg" numeric(8, 3)`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "packaging_type" text`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "storage_cartons_per_pallet" integer`,
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "shipping_cartons_per_pallet" integer`,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'purchase_order_lines_storage_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "purchase_order_lines"
            ADD CONSTRAINT "purchase_order_lines_storage_cartons_per_pallet_check"
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
          WHERE c.conname = 'purchase_order_lines_shipping_cartons_per_pallet_check'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "purchase_order_lines"
            ADD CONSTRAINT "purchase_order_lines_shipping_cartons_per_pallet_check"
            CHECK (shipping_cartons_per_pallet IS NULL OR shipping_cartons_per_pallet > 0);
        END IF;
      END $$;
    `,

    // PO-level forwarding/cargo costs (allocated into cost ledger at receipt)
    `
      CREATE TABLE IF NOT EXISTS "purchase_order_forwarding_costs" (
        "id" text NOT NULL,
        "purchase_order_id" text NOT NULL,
        "warehouse_id" text NOT NULL,
        "cost_rate_id" text,
        "cost_name" text NOT NULL,
        "quantity" numeric(12,4) NOT NULL,
        "unit_rate" numeric(12,4) NOT NULL,
        "total_cost" numeric(12,2) NOT NULL,
        "currency" text,
        "notes" text,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by_id" text,
        "created_by_name" text,
        CONSTRAINT "purchase_order_forwarding_costs_pkey" PRIMARY KEY ("id")
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
          WHERE c.conname = 'purchase_order_forwarding_costs_purchase_order_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "purchase_order_forwarding_costs"
            ADD CONSTRAINT "purchase_order_forwarding_costs_purchase_order_id_fkey"
            FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
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
          WHERE c.conname = 'purchase_order_forwarding_costs_warehouse_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "purchase_order_forwarding_costs"
            ADD CONSTRAINT "purchase_order_forwarding_costs_warehouse_id_fkey"
            FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
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
          WHERE c.conname = 'purchase_order_forwarding_costs_cost_rate_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "purchase_order_forwarding_costs"
            ADD CONSTRAINT "purchase_order_forwarding_costs_cost_rate_id_fkey"
            FOREIGN KEY ("cost_rate_id") REFERENCES "cost_rates"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_purchase_order_id_idx" ON "purchase_order_forwarding_costs"("purchase_order_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_warehouse_id_idx" ON "purchase_order_forwarding_costs"("warehouse_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_cost_rate_id_idx" ON "purchase_order_forwarding_costs"("cost_rate_id")`,
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
