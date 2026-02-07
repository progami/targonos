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
Add Fulfillment Orders Foundation

Creates first-class outbound Fulfillment Orders (FO) and links inventory transactions
to them. Also introduces WarehouseKind to distinguish 3PL vs Amazon (FBA/AWD) warehouses.

This is an idempotent migration intended for deployments on long-lived schemas where
Prisma migrate deploy is not used.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-fulfillment-orders-foundation.ts [options]

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

  console.log(`\n[${tenant}] Ensuring Fulfillment Orders foundation schema is present`)

  const ddlStatements: string[] = [
    // CreateEnum: WarehouseKind
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'WarehouseKind'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "WarehouseKind" AS ENUM ('THIRD_PARTY', 'AMAZON_FBA', 'AMAZON_AWD');
        END IF;
      END $$;
    `,

    // AlterTable: warehouses.kind
    `
      ALTER TABLE "warehouses"
        ADD COLUMN IF NOT EXISTS "kind" "WarehouseKind" NOT NULL DEFAULT 'THIRD_PARTY';
    `,

    // CreateEnum: FulfillmentOrderStatus
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'FulfillmentOrderStatus'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "FulfillmentOrderStatus" AS ENUM ('DRAFT', 'SHIPPED', 'CANCELLED');
        END IF;
      END $$;
    `,

    // CreateEnum: FulfillmentOrderLineStatus
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'FulfillmentOrderLineStatus'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "FulfillmentOrderLineStatus" AS ENUM ('PENDING', 'SHIPPED', 'CANCELLED');
        END IF;
      END $$;
    `,

    // CreateEnum: FulfillmentDestinationType
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'FulfillmentDestinationType'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "FulfillmentDestinationType" AS ENUM ('CUSTOMER', 'AMAZON_FBA', 'TRANSFER');
        END IF;
      END $$;
    `,

    // CreateEnum: FulfillmentOrderDocumentStage
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'FulfillmentOrderDocumentStage'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE "FulfillmentOrderDocumentStage" AS ENUM ('PACKING', 'SHIPPING', 'DELIVERY');
        END IF;
      END $$;
    `,

    // CreateTable: fulfillment_orders
    `
      CREATE TABLE IF NOT EXISTS "fulfillment_orders" (
        "id" TEXT NOT NULL,
        "fo_number" TEXT NOT NULL,
        "status" "FulfillmentOrderStatus" NOT NULL DEFAULT 'DRAFT',
        "warehouse_code" TEXT NOT NULL,
        "warehouse_name" TEXT NOT NULL,
        "destination_type" "FulfillmentDestinationType" NOT NULL DEFAULT 'CUSTOMER',
        "destination_name" TEXT,
        "destination_address" TEXT,
        "destination_country" TEXT,
        "shipping_carrier" TEXT,
        "shipping_method" TEXT,
        "tracking_number" TEXT,
        "shipped_date" TIMESTAMP(3),
        "delivered_date" TIMESTAMP(3),
        "external_reference" TEXT,
        "notes" TEXT,
        "created_by" TEXT,
        "created_by_name" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fulfillment_orders_pkey" PRIMARY KEY ("id")
      );
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_orders_fo_number_key"
        ON "fulfillment_orders" ("fo_number");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_orders_status_idx"
        ON "fulfillment_orders" ("status");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_orders_warehouse_code_idx"
        ON "fulfillment_orders" ("warehouse_code");
    `,

    // CreateTable: fulfillment_order_lines
    `
      CREATE TABLE IF NOT EXISTS "fulfillment_order_lines" (
        "id" TEXT NOT NULL,
        "fulfillment_order_id" TEXT NOT NULL,
        "sku_code" TEXT NOT NULL,
        "sku_description" TEXT,
        "lot_ref" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "status" "FulfillmentOrderLineStatus" NOT NULL DEFAULT 'PENDING',
        "shipped_quantity" INTEGER NOT NULL DEFAULT 0,
        "line_notes" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fulfillment_order_lines_pkey" PRIMARY KEY ("id")
      );
    `,
    `
      -- Legacy schemas used "batch_lot". ERD v9 uses "lot_ref" everywhere.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'fulfillment_order_lines'
            AND column_name = 'batch_lot'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'fulfillment_order_lines'
            AND column_name = 'lot_ref'
        ) THEN
          ALTER TABLE "fulfillment_order_lines" RENAME COLUMN "batch_lot" TO "lot_ref";
        END IF;
      END $$;

      DROP INDEX IF EXISTS "fulfillment_order_lines_fulfillment_order_id_sku_code_batch_lot_key";

      CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_order_lines_fulfillment_order_id_sku_code_lot_ref_key"
        ON "fulfillment_order_lines" ("fulfillment_order_id", "sku_code", "lot_ref");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_order_lines_fulfillment_order_id_idx"
        ON "fulfillment_order_lines" ("fulfillment_order_id");
    `,

    // CreateTable: fulfillment_order_documents
    `
      CREATE TABLE IF NOT EXISTS "fulfillment_order_documents" (
        "id" TEXT NOT NULL,
        "fulfillment_order_id" TEXT NOT NULL,
        "stage" "FulfillmentOrderDocumentStage" NOT NULL,
        "document_type" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "content_type" TEXT NOT NULL,
        "size" INTEGER NOT NULL,
        "s3_key" TEXT NOT NULL,
        "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "uploaded_by_id" TEXT,
        "uploaded_by_name" TEXT,
        "metadata" JSONB,
        CONSTRAINT "fulfillment_order_documents_pkey" PRIMARY KEY ("id")
      );
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_order_documents_fulfillment_order_id_stage_document_type_key"
        ON "fulfillment_order_documents" ("fulfillment_order_id", "stage", "document_type");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_order_documents_fulfillment_order_id_idx"
        ON "fulfillment_order_documents" ("fulfillment_order_id");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_order_documents_stage_idx"
        ON "fulfillment_order_documents" ("stage");
    `,
    `
      CREATE INDEX IF NOT EXISTS "fulfillment_order_documents_document_type_idx"
        ON "fulfillment_order_documents" ("document_type");
    `,

    // Foreign keys: fulfillment_order_lines -> fulfillment_orders
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'fulfillment_order_lines_fulfillment_order_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "fulfillment_order_lines"
            ADD CONSTRAINT "fulfillment_order_lines_fulfillment_order_id_fkey"
            FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `,

    // Foreign keys: fulfillment_order_documents -> fulfillment_orders
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'fulfillment_order_documents_fulfillment_order_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "fulfillment_order_documents"
            ADD CONSTRAINT "fulfillment_order_documents_fulfillment_order_id_fkey"
            FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `,

    // AlterTable: inventory_transactions links
    `ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "fulfillment_order_id" TEXT;`,
    `ALTER TABLE "inventory_transactions" ADD COLUMN IF NOT EXISTS "fulfillment_order_line_id" TEXT;`,
    `
      CREATE INDEX IF NOT EXISTS "idx_inventory_transactions_fulfillment_order"
        ON "inventory_transactions" ("fulfillment_order_id");
    `,
    `
      CREATE INDEX IF NOT EXISTS "idx_inventory_transactions_fulfillment_order_line"
        ON "inventory_transactions" ("fulfillment_order_line_id");
    `,

    // Foreign keys: inventory_transactions -> fulfillment_orders
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'inventory_transactions_fulfillment_order_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "inventory_transactions"
            ADD CONSTRAINT "inventory_transactions_fulfillment_order_id_fkey"
            FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `,

    // Foreign keys: inventory_transactions -> fulfillment_order_lines
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'inventory_transactions_fulfillment_order_line_id_fkey'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "inventory_transactions"
            ADD CONSTRAINT "inventory_transactions_fulfillment_order_line_id_fkey"
            FOREIGN KEY ("fulfillment_order_line_id") REFERENCES "fulfillment_order_lines"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
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
