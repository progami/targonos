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
Replace Batch With Lot Ref

Renames legacy batch_lot columns to lot_ref to match ERD v9 and Talos naming conventions.

Also:
- Ensures purchase_order_lines.production_date exists
- Fixes the purchase_order_lines unique constraint to (purchase_order_id, sku_code)
- Backfills inventory/ledger lot_ref values from purchase_order_lines when linked

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/replace-batch-with-lot-ref.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

function renameColumnIfNeeded(table: string, from: string, to: string): string {
  return `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = '${table}'
          AND column_name = '${from}'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = '${table}'
          AND column_name = '${to}'
      ) THEN
        ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}";
      END IF;
    END $$;
  `
}

function dropSkuBatchEnforcement(): string[] {
  return [
    `
      -- ERD v9 removed the SKU batch concept; lots are generated per PO line.
      -- Drop legacy constraint triggers + function that enforced "each SKU must have a batch".
      DROP TRIGGER IF EXISTS trg_skus_require_batch ON "skus";
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('sku_batches') IS NOT NULL THEN
          EXECUTE 'DROP TRIGGER IF EXISTS trg_sku_batches_require_batch ON sku_batches';
        END IF;
      END $$;
    `,
    `
      DROP FUNCTION IF EXISTS "enforce_sku_batch_presence"();
    `,
  ]
}

function dropPurchaseOrderLineBatchLot(): string {
  return `
    -- Ensure legacy purchase_order_lines.batch_lot does not survive the lot_ref migration.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'purchase_order_lines'
          AND column_name = 'batch_lot'
      ) THEN
        -- Older environments may have an ERD-aligned view named "lot" that still references batch_lot.
        -- Drop it before dropping the column to avoid dependency errors.
        IF EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'v'
            AND c.relname = 'lot'
            AND n.nspname = current_schema()
        ) THEN
          EXECUTE 'DROP VIEW IF EXISTS "lot"';
        END IF;

        -- Backfill lot_ref if any rows still relied on batch_lot.
        UPDATE "purchase_order_lines"
        SET "lot_ref" = "batch_lot"
        WHERE "lot_ref" IS NULL
          AND "batch_lot" IS NOT NULL;

        ALTER TABLE "purchase_order_lines" DROP COLUMN "batch_lot";
      END IF;
    END $$;
  `
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const statements = [
    `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "production_date" date`,

    // Rename legacy batch_lot columns (ERD v9 uses lot_ref everywhere).
    renameColumnIfNeeded('inventory_transactions', 'batch_lot', 'lot_ref'),
    renameColumnIfNeeded('financial_ledger', 'batch_lot', 'lot_ref'),
    renameColumnIfNeeded('storage_ledger', 'batch_lot', 'lot_ref'),
    renameColumnIfNeeded('fulfillment_order_lines', 'batch_lot', 'lot_ref'),
    renameColumnIfNeeded('goods_receipt_lines', 'batch_lot', 'lot_ref'),

    // ERD v9 lot PK = (po_id, sku_id) so enforce one SKU per PO line.
    `ALTER TABLE "purchase_order_lines" DROP CONSTRAINT IF EXISTS "purchase_order_lines_purchase_order_id_sku_code_batch_lot_key"`,
    `DROP INDEX IF EXISTS "purchase_order_lines_purchase_order_id_sku_code_batch_lot_key"`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_lines_purchase_order_id_sku_code_key"
      ON "purchase_order_lines"("purchase_order_id", "sku_code")`,

    // Backfill lot refs on linked tables so inventory/ledger screens show canonical lot refs.
    `
      UPDATE "inventory_transactions" it
      SET "lot_ref" = pol."lot_ref"
      FROM "purchase_order_lines" pol
      WHERE it."purchase_order_line_id" IS NOT NULL
        AND it."purchase_order_line_id" = pol."id"
        AND it."lot_ref" IS DISTINCT FROM pol."lot_ref"
    `,
    `
      UPDATE "inventory_transactions" it
      SET "lot_ref" = pol."lot_ref"
      FROM "purchase_order_lines" pol
      WHERE it."purchase_order_line_id" IS NULL
        AND it."purchase_order_id" IS NOT NULL
        AND it."purchase_order_id" = pol."purchase_order_id"
        AND it."sku_code" = pol."sku_code"
        AND it."lot_ref" IS DISTINCT FROM pol."lot_ref"
    `,
    `
      UPDATE "financial_ledger" fl
      SET "lot_ref" = pol."lot_ref"
      FROM "purchase_order_lines" pol
      WHERE fl."purchase_order_line_id" IS NOT NULL
        AND fl."purchase_order_line_id" = pol."id"
        AND fl."lot_ref" IS DISTINCT FROM pol."lot_ref"
    `,
    `
      UPDATE "financial_ledger" fl
      SET "lot_ref" = pol."lot_ref"
      FROM "purchase_order_lines" pol
      WHERE fl."purchase_order_line_id" IS NULL
        AND fl."purchase_order_id" IS NOT NULL
        AND fl."purchase_order_id" = pol."purchase_order_id"
        AND fl."sku_code" IS NOT NULL
        AND fl."sku_code" = pol."sku_code"
        AND fl."lot_ref" IS DISTINCT FROM pol."lot_ref"
    `,
    `
      UPDATE "goods_receipt_lines" grl
      SET "lot_ref" = pol."lot_ref"
      FROM "purchase_order_lines" pol
      WHERE grl."purchase_order_line_id" IS NOT NULL
        AND grl."purchase_order_line_id" = pol."id"
        AND grl."lot_ref" IS DISTINCT FROM pol."lot_ref"
    `,

    // Remove legacy SKU batch enforcement + drop the last remaining batch_lot column on PO lines.
    ...dropSkuBatchEnforcement(),
    dropPurchaseOrderLineBatchLot(),
  ]

  console.log(`\n[${tenant}] Replacing batch_lot with lot_ref`)
  for (const statement of statements) {
    const trimmed = statement.trim()
    if (!trimmed) continue

    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${trimmed.replaceAll(/\s+/g, ' ').slice(0, 240)}${trimmed.length > 240 ? '…' : ''}`)
      continue
    }

    await prisma.$executeRawUnsafe(statement)
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
