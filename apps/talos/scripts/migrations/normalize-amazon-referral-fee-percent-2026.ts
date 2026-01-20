#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getReferralFeePercent2026 } from '../../src/lib/amazon/fees'
import type { TenantCode } from '../../src/lib/tenant/constants'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'

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
Normalize Amazon Referral Fee Percent (2026)

Rewrites skus.amazon_referral_fee_percent using the 2026 referral fee category rules and the stored
amazon_category + amazon_listing_price.

Usage:
  pnpm -C apps/talos db:migrate:normalize-amazon-referral-fee-percent-2026 [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

function coerceDecimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const where = {
    amazonCategory: { not: null },
    amazonListingPrice: { not: null },
  } as const

  const total = await prisma.sku.count({ where })
  console.log(`\n[${tenant}] Inspecting ${total} SKUs with amazon category + listing price`)

  const pageSize = 500
  let cursor: string | null = null
  let seen = 0
  let updated = 0
  let skipped = 0

  while (true) {
    const rows = await prisma.sku.findMany({
      where,
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        skuCode: true,
        amazonCategory: true,
        amazonListingPrice: true,
        amazonReferralFeePercent: true,
      },
    })

    if (rows.length === 0) break

    for (const row of rows) {
      seen += 1

      const category = row.amazonCategory
      const listingPrice = coerceDecimalToNumber(row.amazonListingPrice)

      if (!category || listingPrice === null) {
        skipped += 1
        continue
      }

      const computed = getReferralFeePercent2026(category, listingPrice)
      if (computed === null) {
        skipped += 1
        continue
      }

      const current = coerceDecimalToNumber(row.amazonReferralFeePercent)
      if (current !== null && Number(current.toFixed(2)) === Number(computed.toFixed(2))) {
        skipped += 1
        continue
      }

      if (options.dryRun) {
        console.log(
          `[${tenant}] DRY RUN: ${row.skuCode} amazonReferralFeePercent ${current ?? 'null'} -> ${computed}`
        )
        updated += 1
        continue
      }

      await prisma.sku.update({
        where: { id: row.id },
        data: { amazonReferralFeePercent: computed },
      })
      updated += 1
    }

    cursor = rows[rows.length - 1]?.id ?? null
  }

  console.log(`[${tenant}] Done. Seen: ${seen}, updated: ${updated}, skipped: ${skipped}`)
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

