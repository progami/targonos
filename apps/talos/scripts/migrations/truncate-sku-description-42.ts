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
Truncate SKU Description to 42 Characters

Truncates existing SKU descriptions to 42 characters and alters the column type
to VARCHAR(42) to enforce the limit at the database level.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/truncate-sku-description-42.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  // First, check how many rows will be affected
  const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM skus WHERE LENGTH(description) > 42
  `
  const affectedCount = Number(countResult[0]?.count ?? 0)
  console.log(`[${tenant}] Found ${affectedCount} SKUs with description > 42 characters`)

  if (options.dryRun) {
    console.log(`[${tenant}] DRY RUN: Would truncate ${affectedCount} descriptions to 42 characters`)
    console.log(`[${tenant}] DRY RUN: Would alter column type to VARCHAR(42)`)
    return
  }

  // Truncate existing descriptions
  console.log(`[${tenant}] Truncating descriptions to 42 characters...`)
  await prisma.$executeRawUnsafe(`
    UPDATE skus SET description = LEFT(description, 42) WHERE LENGTH(description) > 42
  `)

  // Alter column type to enforce limit
  console.log(`[${tenant}] Altering column type to VARCHAR(42)...`)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE skus ALTER COLUMN description TYPE VARCHAR(42)
  `)

  console.log(`[${tenant}] Done!`)
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
