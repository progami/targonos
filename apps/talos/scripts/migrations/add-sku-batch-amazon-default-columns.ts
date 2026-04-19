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
Add SKU Batch Amazon Default Columns

Adds Amazon reference fields to sku_batches and backfills from skus when possible.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-sku-batch-amazon-default-columns.ts [options]

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
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_size_tier" text`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_fba_fulfillment_fee" DECIMAL(12,2)`,
    `ALTER TABLE "sku_batches" ADD COLUMN IF NOT EXISTS "amazon_reference_weight_kg" DECIMAL(8,3)`,
  ]

  console.log(`\n[${tenant}] Ensuring sku_batches Amazon columns exist`)
  for (const statement of ddlStatements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
      continue
    }
    await prisma.$executeRawUnsafe(statement)
  }

  console.log(`[${tenant}] Backfilling sku_batches Amazon defaults from skus`)

  const [hasSkuAmazonSizeTier, hasSkuUnitWeight] = options.dryRun
    ? [true, true]
    : await Promise.all([
        columnExists(prisma, 'skus', 'amazon_size_tier'),
        columnExists(prisma, 'skus', 'unit_weight_kg'),
      ])

  const setClauses = [
    hasSkuAmazonSizeTier
      ? `amazon_size_tier = COALESCE(b.amazon_size_tier, s.amazon_size_tier)`
      : null,
    `amazon_reference_weight_kg = COALESCE(b.amazon_reference_weight_kg, b.unit_weight_kg${hasSkuUnitWeight ? ', s.unit_weight_kg' : ''})`,
  ].filter((clause): clause is string => Boolean(clause))

  const needsSkuJoin = hasSkuAmazonSizeTier || hasSkuUnitWeight

  const backfillSql = needsSkuJoin
    ? `
      UPDATE sku_batches b
      SET
        ${setClauses.join(',\n        ')}
      FROM skus s
      WHERE b.sku_id = s.id
    `
    : `
      UPDATE sku_batches b
      SET
        ${setClauses.join(',\n        ')}
    `

  if (options.dryRun) {
    console.log(
      `[${tenant}] DRY RUN: backfill sku_batches Amazon defaults (sku join=${needsSkuJoin})`
    )
    return
  }

  await prisma.$executeRawUnsafe(backfillSql)
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
