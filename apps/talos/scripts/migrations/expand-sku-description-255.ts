#!/usr/bin/env tsx

import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  help?: boolean
}

const SKU_VIEW_SQL = `CREATE OR REPLACE VIEW "sku" AS
SELECT
  s."id" AS "sku_id",
  s."sku_code",
  s."sku_group",
  s."asin",
  s."description",
  s."is_active",
  s."default_supplier_id",
  s."secondary_supplier_id",
  CASE
    WHEN s."carton_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side1_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_length_in",
  CASE
    WHEN s."carton_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side2_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_width_in",
  CASE
    WHEN s."carton_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side3_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_height_in",
  CASE
    WHEN s."carton_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."carton_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "ref_pkg_weight_lb",
  CASE
    WHEN s."item_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side1_cm" / 2.54)::numeric, 4)
  END AS "ref_item_length_in",
  CASE
    WHEN s."item_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side2_cm" / 2.54)::numeric, 4)
  END AS "ref_item_width_in",
  CASE
    WHEN s."item_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side3_cm" / 2.54)::numeric, 4)
  END AS "ref_item_height_in",
  CASE
    WHEN s."item_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."item_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "ref_item_weight_lb",
  CASE
    WHEN s."amazon_item_package_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side1_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_length_in",
  CASE
    WHEN s."amazon_item_package_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side2_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_width_in",
  CASE
    WHEN s."amazon_item_package_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side3_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_height_in",
  CASE
    WHEN s."amazon_reference_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."amazon_reference_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "amz_pkg_weight_lb",
  CASE
    WHEN s."amazon_item_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side1_cm" / 2.54)::numeric, 4)
  END AS "amz_item_length_in",
  CASE
    WHEN s."amazon_item_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side2_cm" / 2.54)::numeric, 4)
  END AS "amz_item_width_in",
  CASE
    WHEN s."amazon_item_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side3_cm" / 2.54)::numeric, 4)
  END AS "amz_item_height_in",
  CASE
    WHEN s."amazon_item_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "amz_item_weight_lb",
  s."category",
  s."subcategory",
  s."size_tier",
  s."referral_fee_percent" AS "referral_fee_pct",
  s."fba_fulfillment_fee"
FROM "skus" s`

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
Expand SKU Description to 255 Characters

Alters skus.description to VARCHAR(255), matching the app validation limit.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/expand-sku-description-255.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const rows = await prisma.$queryRaw<{ character_maximum_length: number | null }[]>`
    SELECT character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'skus'
      AND column_name = 'description'
  `

  if (rows.length !== 1) {
    throw new Error(`[${tenant}] Expected one skus.description column, found ${rows.length}`)
  }

  const currentLength = rows[0].character_maximum_length
  console.log(`[${tenant}] skus.description current limit: ${currentLength}`)

  const dropViewStatement = 'DROP VIEW IF EXISTS "sku"'
  const alterColumnStatement = 'ALTER TABLE skus ALTER COLUMN description TYPE VARCHAR(255)'
  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: ${dropViewStatement}`)
    console.log(`[${tenant}] DRY RUN: ${alterColumnStatement}`)
    console.log(`[${tenant}] DRY RUN: ${SKU_VIEW_SQL}`)
    return
  }

  await prisma.$executeRawUnsafe(dropViewStatement)
  await prisma.$executeRawUnsafe(alterColumnStatement)
  await prisma.$executeRawUnsafe(SKU_VIEW_SQL)
  console.log(`[${tenant}] skus.description expanded to VARCHAR(255)`)
}

async function main() {
  loadTalosScriptEnv()
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
