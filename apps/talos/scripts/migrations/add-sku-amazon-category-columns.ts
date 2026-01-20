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
Add SKU Amazon Category Columns

Adds skus.amazon_subcategory and migrates existing skus.amazon_category values into
amazon_subcategory, clearing amazon_category so the main category can be re-synced from SP-API.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-sku-amazon-category-columns.ts [options]

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

  console.log(`\n[${tenant}] Ensuring skus.amazon_subcategory exists`)
  const hasAmazonSubcategory = options.dryRun
    ? true
    : await columnExists(prisma, 'skus', 'amazon_subcategory')

  if (!hasAmazonSubcategory) {
    const statement = `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_subcategory" TEXT`
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
    } else {
      await prisma.$executeRawUnsafe(statement)
    }
  }

  console.log(`[${tenant}] Moving legacy amazon_category → amazon_subcategory`)
  const updateSql = `
    UPDATE skus
    SET
      amazon_subcategory = amazon_category,
      amazon_category = NULL
    WHERE amazon_subcategory IS NULL
      AND amazon_category IS NOT NULL
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

