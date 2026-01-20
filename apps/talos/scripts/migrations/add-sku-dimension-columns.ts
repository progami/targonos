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
Add SKU Dimension Columns

Adds unit/carton/item dimension columns (L/W/H) to skus and backfills from the legacy
unit_dimensions_cm / carton_dimensions_cm / item_dimensions_cm strings when possible.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-sku-dimension-columns.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const ddlStatements = [
    `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_side1_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "unit_length_cm" TO "unit_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_side2_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "unit_width_cm" TO "unit_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'unit_side3_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "unit_height_cm" TO "unit_side3_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_side1_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "item_length_cm" TO "item_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_side2_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "item_width_cm" TO "item_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'item_side3_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "item_height_cm" TO "item_side3_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_length_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_side1_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "carton_length_cm" TO "carton_side1_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_width_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_side2_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "carton_width_cm" TO "carton_side2_cm";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_height_cm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'skus'
            AND column_name = 'carton_side3_cm'
        ) THEN
          ALTER TABLE "skus" RENAME COLUMN "carton_height_cm" TO "carton_side3_cm";
        END IF;
      END $$;
    `,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "unit_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "unit_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "unit_side3_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "item_dimensions_cm" TEXT`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "item_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "item_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "item_side3_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "item_weight_kg" DECIMAL(8,3)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "carton_side1_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "carton_side2_cm" DECIMAL(8,2)`,
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "carton_side3_cm" DECIMAL(8,2)`,
  ]

  console.log(`\n[${tenant}] Ensuring dimension columns exist`)
  for (const statement of ddlStatements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
      continue
    }
    await prisma.$executeRawUnsafe(statement)
  }

  const backfillStatements = [
    {
      label: 'item package dimensions',
      sql: `
        WITH parsed AS (
          SELECT
            id,
            regexp_match(
              regexp_replace(replace(unit_dimensions_cm, '×', 'x'), '\\s+', '', 'g'),
              '([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)'
            ) AS m
          FROM skus
          WHERE unit_dimensions_cm IS NOT NULL
            AND (unit_side1_cm IS NULL OR unit_side2_cm IS NULL OR unit_side3_cm IS NULL)
        )
        UPDATE skus s
        SET
          unit_side1_cm = COALESCE(s.unit_side1_cm, (p.m[1])::numeric),
          unit_side2_cm = COALESCE(s.unit_side2_cm, (p.m[2])::numeric),
          unit_side3_cm = COALESCE(s.unit_side3_cm, (p.m[3])::numeric)
        FROM parsed p
        WHERE s.id = p.id
          AND p.m IS NOT NULL
      `,
    },
    {
      label: 'item dimensions',
      sql: `
        WITH parsed AS (
          SELECT
            id,
            regexp_match(
              regexp_replace(replace(item_dimensions_cm, '×', 'x'), '\\s+', '', 'g'),
              '([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)'
            ) AS m
          FROM skus
          WHERE item_dimensions_cm IS NOT NULL
            AND (item_side1_cm IS NULL OR item_side2_cm IS NULL OR item_side3_cm IS NULL)
        )
        UPDATE skus s
        SET
          item_side1_cm = COALESCE(s.item_side1_cm, (p.m[1])::numeric),
          item_side2_cm = COALESCE(s.item_side2_cm, (p.m[2])::numeric),
          item_side3_cm = COALESCE(s.item_side3_cm, (p.m[3])::numeric)
        FROM parsed p
        WHERE s.id = p.id
          AND p.m IS NOT NULL
      `,
    },
    {
      label: 'carton dimensions',
      sql: `
        WITH parsed AS (
          SELECT
            id,
            regexp_match(
              regexp_replace(replace(carton_dimensions_cm, '×', 'x'), '\\s+', '', 'g'),
              '([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)[xX]([0-9]+(?:\\.[0-9]+)?)'
            ) AS m
          FROM skus
          WHERE carton_dimensions_cm IS NOT NULL
            AND (carton_side1_cm IS NULL OR carton_side2_cm IS NULL OR carton_side3_cm IS NULL)
        )
        UPDATE skus s
        SET
          carton_side1_cm = COALESCE(s.carton_side1_cm, (p.m[1])::numeric),
          carton_side2_cm = COALESCE(s.carton_side2_cm, (p.m[2])::numeric),
          carton_side3_cm = COALESCE(s.carton_side3_cm, (p.m[3])::numeric)
        FROM parsed p
        WHERE s.id = p.id
          AND p.m IS NOT NULL
      `,
    },
  ]

  console.log(`[${tenant}] Backfilling dimension columns from legacy strings`)
  for (const statement of backfillStatements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: backfill ${statement.label}`)
      continue
    }
    await prisma.$executeRawUnsafe(statement.sql)
  }

  const backfillFromLegacyNumericSql = `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'unit_length_cm'
      ) THEN
        UPDATE skus
        SET unit_side1_cm = COALESCE(unit_side1_cm, unit_length_cm)
        WHERE unit_length_cm IS NOT NULL AND unit_side1_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'unit_width_cm'
      ) THEN
        UPDATE skus
        SET unit_side2_cm = COALESCE(unit_side2_cm, unit_width_cm)
        WHERE unit_width_cm IS NOT NULL AND unit_side2_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'unit_height_cm'
      ) THEN
        UPDATE skus
        SET unit_side3_cm = COALESCE(unit_side3_cm, unit_height_cm)
        WHERE unit_height_cm IS NOT NULL AND unit_side3_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'item_length_cm'
      ) THEN
        UPDATE skus
        SET item_side1_cm = COALESCE(item_side1_cm, item_length_cm)
        WHERE item_length_cm IS NOT NULL AND item_side1_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'item_width_cm'
      ) THEN
        UPDATE skus
        SET item_side2_cm = COALESCE(item_side2_cm, item_width_cm)
        WHERE item_width_cm IS NOT NULL AND item_side2_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'item_height_cm'
      ) THEN
        UPDATE skus
        SET item_side3_cm = COALESCE(item_side3_cm, item_height_cm)
        WHERE item_height_cm IS NOT NULL AND item_side3_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'carton_length_cm'
      ) THEN
        UPDATE skus
        SET carton_side1_cm = COALESCE(carton_side1_cm, carton_length_cm)
        WHERE carton_length_cm IS NOT NULL AND carton_side1_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'carton_width_cm'
      ) THEN
        UPDATE skus
        SET carton_side2_cm = COALESCE(carton_side2_cm, carton_width_cm)
        WHERE carton_width_cm IS NOT NULL AND carton_side2_cm IS NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'skus'
          AND column_name = 'carton_height_cm'
      ) THEN
        UPDATE skus
        SET carton_side3_cm = COALESCE(carton_side3_cm, carton_height_cm)
        WHERE carton_height_cm IS NOT NULL AND carton_side3_cm IS NULL;
      END IF;
    END $$;
  `

  const dropLegacyColumnsStatements = [
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "unit_length_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "unit_width_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "unit_height_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "item_length_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "item_width_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "item_height_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "carton_length_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "carton_width_cm"`,
    `ALTER TABLE "skus" DROP COLUMN IF EXISTS "carton_height_cm"`,
  ]

  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: cleanup legacy sku dimension columns`)
    for (const statement of dropLegacyColumnsStatements) console.log(`[${tenant}] DRY RUN: ${statement}`)
    return
  }

  await prisma.$executeRawUnsafe(backfillFromLegacyNumericSql)
  for (const statement of dropLegacyColumnsStatements) {
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

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
