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
Move Purchase Order PI Documents To ISSUED

Moves purchase_order_documents rows for PI documents (document_type LIKE 'pi_%')
from stage DRAFT -> ISSUED in each tenant schema.

If both DRAFT and ISSUED rows exist for the same (purchase_order_id, document_type),
the newest upload wins and is stored in the ISSUED row.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/move-pi-documents-to-issued.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

function previewSql(tenant: TenantCode, sql: string) {
  const compact = sql.replaceAll(/\s+/g, ' ').trim()
  console.log(
    `[${tenant}] DRY RUN: ${compact.slice(0, 240)}${compact.length > 240 ? '…' : ''}`
  )
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Migrating PI documents from DRAFT -> ISSUED`)

  const mergeNewerDraftIntoIssued = `
    UPDATE "purchase_order_documents" i
    SET
      "file_name" = d."file_name",
      "content_type" = d."content_type",
      "size" = d."size",
      "s3_key" = d."s3_key",
      "uploaded_at" = d."uploaded_at",
      "uploaded_by_id" = d."uploaded_by_id",
      "uploaded_by_name" = d."uploaded_by_name",
      "metadata" = d."metadata"
    FROM "purchase_order_documents" d
    WHERE i."purchase_order_id" = d."purchase_order_id"
      AND i."document_type" = d."document_type"
      AND i."stage" = 'ISSUED'
      AND d."stage" = 'DRAFT'
      AND d."document_type" LIKE 'pi\\_%'
      AND d."uploaded_at" > i."uploaded_at";
  `

  const moveDraftToIssuedWhenMissing = `
    UPDATE "purchase_order_documents" d
    SET "stage" = 'ISSUED'
    WHERE d."stage" = 'DRAFT'
      AND d."document_type" LIKE 'pi\\_%'
      AND NOT EXISTS (
        SELECT 1
        FROM "purchase_order_documents" i
        WHERE i."purchase_order_id" = d."purchase_order_id"
          AND i."document_type" = d."document_type"
          AND i."stage" = 'ISSUED'
      );
  `

  const deleteRemainingDraftPiDocs = `
    DELETE FROM "purchase_order_documents" d
    WHERE d."stage" = 'DRAFT'
      AND d."document_type" LIKE 'pi\\_%'
      AND EXISTS (
        SELECT 1
        FROM "purchase_order_documents" i
        WHERE i."purchase_order_id" = d."purchase_order_id"
          AND i."document_type" = d."document_type"
          AND i."stage" = 'ISSUED'
      );
  `

  const statements = [
    { label: 'merge newer DRAFT into ISSUED', sql: mergeNewerDraftIntoIssued },
    { label: 'move DRAFT -> ISSUED when missing', sql: moveDraftToIssuedWhenMissing },
    { label: 'delete remaining DRAFT PI docs', sql: deleteRemainingDraftPiDocs },
  ]

  for (const statement of statements) {
    if (options.dryRun) {
      previewSql(tenant, statement.sql)
      continue
    }

    const affected = await prisma.$executeRawUnsafe(statement.sql)
    console.log(`[${tenant}] ${statement.label}: ${affected}`)
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

