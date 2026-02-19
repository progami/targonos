#!/usr/bin/env tsx

/**
 * Normalize legacy terminal PO statuses to the canonical `CLOSED`.
 *
 * Converts:
 * - `CANCELLED` -> `CLOSED`
 * - `REJECTED`  -> `CLOSED`
 *
 * Idempotent.
 *
 * Usage:
 *   pnpm --filter @targon/talos exec tsx scripts/migrations/ensure-po-terminal-status-closed.ts [options]
 *
 * Options:
 *   --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)
 *   --dry-run            Show counts without writing
 *   --help, -h           Show this help
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@targon/prisma-talos'
import { PurchaseOrderStatus } from '@targon/prisma-talos'
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
      const rawValue = arg.split('=')[1]
      const value = typeof rawValue === 'string' ? rawValue.toUpperCase() : ''
      if (value === 'US' || value === 'UK') {
        options.tenants = [value]
        continue
      }
      if (value === 'ALL') {
        options.tenants = ['US', 'UK']
        continue
      }
      throw new Error(`Invalid --tenant value: ${value} (expected US, UK, or ALL)`)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log('=== PO Terminal Status Normalization ===\n')
  console.log('Options:')
  console.log('  --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)')
  console.log('  --dry-run            Show counts without writing')
  console.log('  --help, -h           Show this help')
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma: PrismaClient = await getTenantPrismaClient(tenant)

  const legacyTerminalStatuses: PurchaseOrderStatus[] = [
    PurchaseOrderStatus.CANCELLED,
    PurchaseOrderStatus.REJECTED,
  ]
  const where = { status: { in: legacyTerminalStatuses } }

  const count = await prisma.purchaseOrder.count({ where })

  console.log(`\n[${tenant}] CANCELLED/REJECTED -> CLOSED`)
  console.log(`[${tenant}] Matching orders: ${count}`)

  if (count === 0) return
  if (options.dryRun) return

  const result = await prisma.purchaseOrder.updateMany({
    where,
    data: { status: PurchaseOrderStatus.CLOSED },
  })

  console.log(`[${tenant}] Updated: ${result.count}`)
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log('=== PO Terminal Status Normalization ===')
  console.log(`Tenants: ${options.tenants.join(', ')}`)
  console.log(`Dry run: ${options.dryRun}`)

  for (const tenant of options.tenants) {
    await applyForTenant(tenant, options)
  }

  console.log('\nAll done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
