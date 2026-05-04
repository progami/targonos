#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
Add SKU Amazon Reference Weight

Adds skus.amazon_reference_weight_kg and backfills reference fields from latest active sku_batches.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-sku-amazon-reference-weight.ts [options]

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

  console.log(`\n[${tenant}] Ensuring skus.amazon_reference_weight_kg exists`)
  const hasAmazonReferenceWeight = options.dryRun
    ? true
    : await columnExists(prisma, 'skus', 'amazon_reference_weight_kg')

  if (!hasAmazonReferenceWeight) {
    const statement = `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_reference_weight_kg" DECIMAL(8,3)`
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
    } else {
      await prisma.$executeRawUnsafe(statement)
    }
  }

  console.log(`[${tenant}] Backfilling skus Amazon reference fields from latest active sku_batches`)

  const hasSkuAmazonSizeTier = options.dryRun ? true : await columnExists(prisma, 'skus', 'amazon_size_tier')
  const hasSkuUnitWeight = options.dryRun ? true : await columnExists(prisma, 'skus', 'unit_weight_kg')
  const hasBatchAmazonSizeTier = options.dryRun ? true : await columnExists(prisma, 'sku_batches', 'amazon_size_tier')
  const hasBatchAmazonRefWeight = options.dryRun
    ? true
    : await columnExists(prisma, 'sku_batches', 'amazon_reference_weight_kg')
  const hasBatchUnitWeight = options.dryRun ? true : await columnExists(prisma, 'sku_batches', 'unit_weight_kg')

  const setClauses = [
    hasSkuAmazonSizeTier && hasBatchAmazonSizeTier
      ? `amazon_size_tier = COALESCE(s.amazon_size_tier, b.amazon_size_tier)`
      : null,
    `amazon_reference_weight_kg = COALESCE(
      s.amazon_reference_weight_kg,
      ${hasBatchAmazonRefWeight ? 'b.amazon_reference_weight_kg,' : ''}
      ${hasBatchUnitWeight ? 'b.unit_weight_kg,' : ''}
      ${hasSkuUnitWeight ? 's.unit_weight_kg' : 'NULL'}
    )`,
  ].filter((clause): clause is string => Boolean(clause))

  const updateSql = `
    UPDATE skus s
    SET
      ${setClauses.join(',\n      ')}
    FROM (
      SELECT DISTINCT ON (sku_id)
        sku_id
        ${hasBatchAmazonSizeTier ? ', amazon_size_tier' : ''}
        ${hasBatchAmazonRefWeight ? ', amazon_reference_weight_kg' : ''}
        ${hasBatchUnitWeight ? ', unit_weight_kg' : ''}
      FROM sku_batches
      WHERE is_active = true
      ORDER BY sku_id, created_at DESC
    ) b
    WHERE b.sku_id = s.id
  `

  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: ${updateSql}`)
    return
  }

  await prisma.$executeRawUnsafe(updateSql)
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
