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
Add SKU Batch Amazon Item Package Dimension Columns

Adds Amazon item package dimension columns to sku_batches and backfills from existing SKU Amazon fields.

Usage:
  pnpm -C apps/talos tsx scripts/migrations/add-sku-batch-amazon-item-package-dimensions.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function columnExists(
  prisma: Awaited<ReturnType<typeof getTenantPrismaClient>>,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    ) AS exists`,
    tableName,
    columnName
  )

  return rows[0]?.exists ?? false
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const ddlStatements = [
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_item_package_dimensions_cm" text`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_item_package_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_item_package_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_item_package_side3_cm" DECIMAL(8,2)`,
  ]

  console.log(`\n[${tenant}] Ensuring sku_batches Amazon item package dimension columns exist`)
  for (const statement of ddlStatements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
      continue
    }
    await prisma.$executeRawUnsafe(statement)
  }

  const [
    hasSkuUnitDimensions,
    hasSkuUnitSide1,
    hasSkuUnitSide2,
    hasSkuUnitSide3,
    hasSkuAmazonReferenceWeightKg,
    hasSkuUnitWeightKg,
  ] = options.dryRun
    ? [true, true, true, true, true, true]
    : await Promise.all([
        columnExists(prisma, 'skus', 'unit_dimensions_cm'),
        columnExists(prisma, 'skus', 'unit_side1_cm'),
        columnExists(prisma, 'skus', 'unit_side2_cm'),
        columnExists(prisma, 'skus', 'unit_side3_cm'),
        columnExists(prisma, 'skus', 'amazon_reference_weight_kg'),
        columnExists(prisma, 'skus', 'unit_weight_kg'),
      ])

  if (hasSkuUnitDimensions) {
    const backfillStringSql = `
      UPDATE sku_batches b
      SET amazon_item_package_dimensions_cm = s.unit_dimensions_cm
      FROM skus s
      WHERE b.sku_id = s.id
        AND b.amazon_item_package_dimensions_cm IS NULL
        AND s.unit_dimensions_cm IS NOT NULL
    `

    console.log(`[${tenant}] Backfilling amazon_item_package_dimensions_cm from skus.unit_dimensions_cm`)
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${backfillStringSql}`)
    } else {
      await prisma.$executeRawUnsafe(backfillStringSql)
    }
  }

  if (hasSkuUnitSide1 && hasSkuUnitSide2 && hasSkuUnitSide3) {
    const backfillSidesSql = `
      UPDATE sku_batches b
      SET
        amazon_item_package_side1_cm = CASE
          WHEN b.amazon_item_package_side1_cm IS NULL THEN s.unit_side1_cm
          ELSE b.amazon_item_package_side1_cm
        END,
        amazon_item_package_side2_cm = CASE
          WHEN b.amazon_item_package_side2_cm IS NULL THEN s.unit_side2_cm
          ELSE b.amazon_item_package_side2_cm
        END,
        amazon_item_package_side3_cm = CASE
          WHEN b.amazon_item_package_side3_cm IS NULL THEN s.unit_side3_cm
          ELSE b.amazon_item_package_side3_cm
        END
      FROM skus s
      WHERE b.sku_id = s.id
        AND (
          b.amazon_item_package_side1_cm IS NULL OR
          b.amazon_item_package_side2_cm IS NULL OR
          b.amazon_item_package_side3_cm IS NULL
        )
    `

    console.log(`[${tenant}] Backfilling amazon_item_package_side*_cm from skus.unit_side*_cm`)
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${backfillSidesSql}`)
    } else {
      await prisma.$executeRawUnsafe(backfillSidesSql)
    }
  }

  if (hasSkuUnitDimensions) {
    const backfillSidesFromStringSql = `
      WITH parsed AS (
        SELECT
          b.id,
          regexp_match(
            regexp_replace(replace(s.unit_dimensions_cm, '×', 'x'), '\\s+', '', 'g'),
            '([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)'
          ) AS m
        FROM sku_batches b
        JOIN skus s ON s.id = b.sku_id
        WHERE s.unit_dimensions_cm IS NOT NULL
          AND (
            b.amazon_item_package_side1_cm IS NULL OR
            b.amazon_item_package_side2_cm IS NULL OR
            b.amazon_item_package_side3_cm IS NULL
          )
      )
      UPDATE sku_batches b
      SET
        amazon_item_package_side1_cm = CASE
          WHEN b.amazon_item_package_side1_cm IS NULL THEN (p.m[1])::numeric
          ELSE b.amazon_item_package_side1_cm
        END,
        amazon_item_package_side2_cm = CASE
          WHEN b.amazon_item_package_side2_cm IS NULL THEN (p.m[2])::numeric
          ELSE b.amazon_item_package_side2_cm
        END,
        amazon_item_package_side3_cm = CASE
          WHEN b.amazon_item_package_side3_cm IS NULL THEN (p.m[3])::numeric
          ELSE b.amazon_item_package_side3_cm
        END
      FROM parsed p
      WHERE b.id = p.id
        AND p.m IS NOT NULL
    `

    console.log(`[${tenant}] Backfilling amazon_item_package_side*_cm from skus.unit_dimensions_cm strings`)
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${backfillSidesFromStringSql}`)
    } else {
      await prisma.$executeRawUnsafe(backfillSidesFromStringSql)
    }
  }

  const weightColumn = hasSkuAmazonReferenceWeightKg ? 'amazon_reference_weight_kg' : hasSkuUnitWeightKg ? 'unit_weight_kg' : null
  if (weightColumn) {
    const backfillWeightSql = `
      UPDATE sku_batches b
      SET amazon_reference_weight_kg = s.${weightColumn}
      FROM skus s
      WHERE b.sku_id = s.id
        AND b.amazon_reference_weight_kg IS NULL
        AND s.${weightColumn} IS NOT NULL
    `

    console.log(`[${tenant}] Backfilling amazon_reference_weight_kg from skus.${weightColumn}`)
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${backfillWeightSql}`)
    } else {
      await prisma.$executeRawUnsafe(backfillWeightSql)
    }
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

