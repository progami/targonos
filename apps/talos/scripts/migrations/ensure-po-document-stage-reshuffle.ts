#!/usr/bin/env tsx

/**
 * Reshuffle PO document stages — moves documents one stage earlier to match
 * the updated document requirements:
 *
 *   box_artwork_*       : MANUFACTURING -> ISSUED
 *   packing_list        : OCEAN         -> MANUFACTURING
 *   bill_of_lading      : OCEAN         -> MANUFACTURING
 *   commercial_invoice  : OCEAN         -> MANUFACTURING
 *   grn                 : WAREHOUSE     -> OCEAN
 *   custom_declaration  : WAREHOUSE     -> OCEAN
 *
 * Idempotent — skips rows where the target already exists.
 * Runs against both US and UK tenant schemas.
 *
 * Usage:
 *   pnpm --filter @targon/talos tsx scripts/migrations/ensure-po-document-stage-reshuffle.ts [options]
 *
 * Options:
 *   --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)
 *   --dry-run            Print SQL without executing
 *   --help, -h           Show this help
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@targon/prisma-talos'
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
Ensure PO Document Stage Reshuffle

Moves existing PO documents one stage earlier to match the updated document
requirements. This is idempotent and safe to re-run.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/ensure-po-document-stage-reshuffle.ts [options]

Options:
  --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)
  --dry-run            Print actions without applying changes
  --help, -h           Show this help
`)
}

type StageMove = {
  label: string
  documentTypeCondition: string
  fromStage: string
  toStage: string
}

const STAGE_MOVES: StageMove[] = [
  {
    label: 'box_artwork_* : MANUFACTURING -> ISSUED',
    documentTypeCondition: `("document_type" = 'box_artwork' OR "document_type" LIKE 'box_artwork_%')`,
    fromStage: 'MANUFACTURING',
    toStage: 'ISSUED',
  },
  {
    label: 'packing_list : OCEAN -> MANUFACTURING',
    documentTypeCondition: `"document_type" = 'packing_list'`,
    fromStage: 'OCEAN',
    toStage: 'MANUFACTURING',
  },
  {
    label: 'bill_of_lading : OCEAN -> MANUFACTURING',
    documentTypeCondition: `"document_type" = 'bill_of_lading'`,
    fromStage: 'OCEAN',
    toStage: 'MANUFACTURING',
  },
  {
    label: 'commercial_invoice : OCEAN -> MANUFACTURING',
    documentTypeCondition: `"document_type" = 'commercial_invoice'`,
    fromStage: 'OCEAN',
    toStage: 'MANUFACTURING',
  },
  {
    label: 'grn : WAREHOUSE -> OCEAN',
    documentTypeCondition: `"document_type" = 'grn'`,
    fromStage: 'WAREHOUSE',
    toStage: 'OCEAN',
  },
  {
    label: 'custom_declaration : WAREHOUSE -> OCEAN',
    documentTypeCondition: `"document_type" = 'custom_declaration'`,
    fromStage: 'WAREHOUSE',
    toStage: 'OCEAN',
  },
]

function buildUpdateSql(move: StageMove): string {
  return `
    UPDATE "purchase_order_documents" d
    SET "stage" = '${move.toStage}'
    WHERE d."stage" = '${move.fromStage}'
      AND ${move.documentTypeCondition}
      AND NOT EXISTS (
        SELECT 1 FROM "purchase_order_documents" e
        WHERE e."purchase_order_id" = d."purchase_order_id"
          AND e."stage" = '${move.toStage}'
          AND e."document_type" = d."document_type"
      )
  `.trim()
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma: PrismaClient = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Reshuffling PO document stages`)

  for (const move of STAGE_MOVES) {
    const sql = buildUpdateSql(move)

    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${move.label}`)
      console.log(`  ${sql.replaceAll(/\s+/g, ' ').slice(0, 300)}`)
      continue
    }

    try {
      const result = await prisma.$executeRawUnsafe(sql)
      console.log(`[${tenant}] ${move.label} — ${result} row(s) updated`)
    } catch (err) {
      console.error(`[${tenant}] ERROR on ${move.label}:`, err)
      throw err
    }
  }

  console.log(`[${tenant}] Done`)
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log('=== PO Document Stage Reshuffle ===')
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
