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
Add SKU Batch Attribute Columns

Adds packaging/measurement columns to sku_batches and backfills from skus when possible.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-sku-batch-attribute-columns.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const ddlStatements = [
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "pack_size" integer`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "units_per_carton" integer`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "material" text`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "unit_dimensions_cm" text`,
    `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_side1_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "unit_length_cm" TO "unit_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_side2_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "unit_width_cm" TO "unit_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'unit_side3_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "unit_height_cm" TO "unit_side3_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_side1_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "carton_length_cm" TO "carton_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_side2_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "carton_width_cm" TO "carton_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sku_batches'
            AND column_name = 'carton_side3_cm'
        ) THEN
          ALTER TABLE "sku_batches" RENAME COLUMN "carton_height_cm" TO "carton_side3_cm";
        END IF;
      END $$;
    `,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "unit_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "unit_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "unit_side3_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "unit_weight_kg" DECIMAL(8,3)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "carton_dimensions_cm" text`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "carton_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "carton_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "carton_side3_cm" DECIMAL(8,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "carton_weight_kg" DECIMAL(8,3)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "packaging_type" text`,
  ]

  console.log(`\n[${tenant}] Ensuring sku_batches attribute columns exist`)
  for (const statement of ddlStatements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
      continue
    }
    await prisma.$executeRawUnsafe(statement)
  }

  const backfillFromLegacyNumericSql = `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'unit_length_cm'
      ) THEN
        UPDATE sku_batches
        SET unit_side1_cm = COALESCE(unit_side1_cm, unit_length_cm)
        WHERE unit_length_cm IS NOT NULL AND unit_side1_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'unit_width_cm'
      ) THEN
        UPDATE sku_batches
        SET unit_side2_cm = COALESCE(unit_side2_cm, unit_width_cm)
        WHERE unit_width_cm IS NOT NULL AND unit_side2_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'unit_height_cm'
      ) THEN
        UPDATE sku_batches
        SET unit_side3_cm = COALESCE(unit_side3_cm, unit_height_cm)
        WHERE unit_height_cm IS NOT NULL AND unit_side3_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'carton_length_cm'
      ) THEN
        UPDATE sku_batches
        SET carton_side1_cm = COALESCE(carton_side1_cm, carton_length_cm)
        WHERE carton_length_cm IS NOT NULL AND carton_side1_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'carton_width_cm'
      ) THEN
        UPDATE sku_batches
        SET carton_side2_cm = COALESCE(carton_side2_cm, carton_width_cm)
        WHERE carton_width_cm IS NOT NULL AND carton_side2_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sku_batches'
          AND column_name = 'carton_height_cm'
      ) THEN
        UPDATE sku_batches
        SET carton_side3_cm = COALESCE(carton_side3_cm, carton_height_cm)
        WHERE carton_height_cm IS NOT NULL AND carton_side3_cm IS NULL;
      END IF;
    END $$;
  `

  const dropLegacyColumnsStatements = [
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "unit_length_cm"`,
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "unit_width_cm"`,
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "unit_height_cm"`,
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "carton_length_cm"`,
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "carton_width_cm"`,
    `ALTER TABLE "sku_batches" DROP COLUMN IF EXISTS "carton_height_cm"`,
  ]

  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: cleanup legacy sku_batches dimension columns`)
    for (const statement of dropLegacyColumnsStatements) console.log(`[${tenant}] DRY RUN: ${statement}`)
    return
  }

  await prisma.$executeRawUnsafe(backfillFromLegacyNumericSql)
  for (const statement of dropLegacyColumnsStatements) {
    await prisma.$executeRawUnsafe(statement)
  }

  console.log(`[${tenant}] Backfilling sku_batches attributes from skus`)
  const backfillSql = `
    UPDATE sku_batches b
    SET
      pack_size = COALESCE(b.pack_size, s.pack_size),
      units_per_carton = COALESCE(b.units_per_carton, s.units_per_carton),
      material = COALESCE(b.material, s.material),
      unit_dimensions_cm = COALESCE(b.unit_dimensions_cm, s.unit_dimensions_cm),
      unit_side1_cm = COALESCE(b.unit_side1_cm, s.unit_side1_cm),
      unit_side2_cm = COALESCE(b.unit_side2_cm, s.unit_side2_cm),
      unit_side3_cm = COALESCE(b.unit_side3_cm, s.unit_side3_cm),
      unit_weight_kg = COALESCE(b.unit_weight_kg, s.unit_weight_kg),
      carton_dimensions_cm = COALESCE(b.carton_dimensions_cm, s.carton_dimensions_cm),
      carton_side1_cm = COALESCE(b.carton_side1_cm, s.carton_side1_cm),
      carton_side2_cm = COALESCE(b.carton_side2_cm, s.carton_side2_cm),
      carton_side3_cm = COALESCE(b.carton_side3_cm, s.carton_side3_cm),
      carton_weight_kg = COALESCE(b.carton_weight_kg, s.carton_weight_kg),
      packaging_type = COALESCE(b.packaging_type, s.packaging_type)
    FROM skus s
    WHERE b.sku_id = s.id
  `

  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: backfill sku_batches from skus`)
    return
  }

  await prisma.$executeRawUnsafe(backfillSql)

  // Ensure units_per_carton is at least 1 when still null.
  await prisma.$executeRawUnsafe(
    `UPDATE sku_batches SET units_per_carton = 1 WHERE units_per_carton IS NULL`
  )
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
