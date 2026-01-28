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
Add Purchase Order Document Table

Creates the purchase_order_documents table + PurchaseOrderDocumentStage enum
in each tenant schema, used for PO stage-backed document uploads.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-purchase-order-document-table.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Ensuring purchase_order_documents exists`)

  const ddlStatements = [
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = current_schema()
            AND t.typname = 'PurchaseOrderDocumentStage'
        ) THEN
          EXECUTE 'CREATE TYPE "PurchaseOrderDocumentStage" AS ENUM (''DRAFT'', ''ISSUED'', ''MANUFACTURING'', ''OCEAN'', ''WAREHOUSE'', ''SHIPPED'')';
        END IF;
      END $$;
    `,
    `
      ALTER TYPE "PurchaseOrderDocumentStage"
        ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'MANUFACTURING';
    `,
    `
      ALTER TYPE "PurchaseOrderDocumentStage"
        ADD VALUE IF NOT EXISTS 'ISSUED' BEFORE 'MANUFACTURING';
    `,
    `
      CREATE TABLE IF NOT EXISTS "purchase_order_documents" (
        "id" text NOT NULL,
        "purchase_order_id" text NOT NULL,
        "stage" "PurchaseOrderDocumentStage" NOT NULL,
        "document_type" text NOT NULL,
        "file_name" text NOT NULL,
        "content_type" text NOT NULL,
        "size" integer NOT NULL,
        "s3_key" text NOT NULL,
        "uploaded_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "uploaded_by_id" text,
        "uploaded_by_name" text,
        "metadata" jsonb,
        CONSTRAINT "purchase_order_documents_pkey" PRIMARY KEY ("id")
      )
    `,
    `
      ALTER TABLE "purchase_order_documents"
        DROP CONSTRAINT IF EXISTS "purchase_order_documents_purchase_order_id_fkey"
    `,
    `
      ALTER TABLE "purchase_order_documents"
        ADD CONSTRAINT "purchase_order_documents_purchase_order_id_fkey"
        FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_documents_purchase_order_id_stage_document_type_key"
        ON "purchase_order_documents" ("purchase_order_id", "stage", "document_type")
    `,
    `
      CREATE INDEX IF NOT EXISTS "purchase_order_documents_purchase_order_id_idx"
        ON "purchase_order_documents" ("purchase_order_id")
    `,
    `
      CREATE INDEX IF NOT EXISTS "purchase_order_documents_stage_idx"
        ON "purchase_order_documents" ("stage")
    `,
    `
      CREATE INDEX IF NOT EXISTS "purchase_order_documents_document_type_idx"
        ON "purchase_order_documents" ("document_type")
    `,
  ]

  for (const statement of ddlStatements) {
    const sql = statement.trim()
    if (!sql) continue
    if (options.dryRun) {
      console.log(
        `[${tenant}] DRY RUN: ${sql.replaceAll(/\s+/g, ' ').slice(0, 240)}${sql.length > 240 ? '…' : ''}`
      )
      continue
    }
    await prisma.$executeRawUnsafe(sql)
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
