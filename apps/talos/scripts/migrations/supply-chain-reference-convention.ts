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
Supply Chain Reference Convention

Ensures schema + backfills for:
- skus.sku_group
- inbound_orders.sku_group
- inbound_order_lines.lot_ref
- inbound_order_lines.production_date

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/supply-chain-reference-convention.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const statements = [
    `ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "sku_group" TEXT`,
    `ALTER TABLE "inbound_orders" ADD COLUMN IF NOT EXISTS "sku_group" TEXT`,
    `ALTER TABLE "inbound_order_lines" ADD COLUMN IF NOT EXISTS "lot_ref" TEXT`,
    `ALTER TABLE "inbound_order_lines" ADD COLUMN IF NOT EXISTS "production_date" date`,
    `WITH sku_reference_groups AS (
      SELECT
        pol."sku_code",
        upper(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^(?:INV|Inbound)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$')) AS "sku_group",
        COUNT(*) AS usage_count,
        MAX(inbound."created_at") AS last_used_at
      FROM "inbound_order_lines" pol
      JOIN "inbound_orders" po
        ON inbound."id" = pol."inbound_order_id"
      GROUP BY
        pol."sku_code",
        upper(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^(?:INV|Inbound)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$'))
    ),
    best_sku_group AS (
      SELECT DISTINCT ON ("sku_code")
        "sku_code",
        "sku_group"
      FROM sku_reference_groups
      WHERE "sku_group" IS NOT NULL
      ORDER BY "sku_code", usage_count DESC, last_used_at DESC
    )
    UPDATE "skus" s
    SET "sku_group" = b."sku_group"
    FROM best_sku_group b
    WHERE s."sku_code" = b."sku_code"
      AND s."sku_group" IS NULL`,
    `UPDATE "skus"
    SET "sku_group" = 'CDS'
    WHERE "sku_group" IS NULL
      AND upper("sku_code") LIKE '%CDS%'`,
    `UPDATE "skus"
    SET "sku_group" = 'PDS'
    WHERE "sku_group" IS NULL
      AND upper("sku_code") LIKE 'CS%'`,
    `UPDATE "inbound_orders"
    SET "sku_group" = upper(substring(coalesce("inbound_number", "order_number") FROM '^(?:INV|Inbound)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$'))
    WHERE "sku_group" IS NULL
      AND upper(substring(coalesce("inbound_number", "order_number") FROM '^(?:INV|Inbound)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$')) IS NOT NULL`,
    `WITH order_line_groups AS (
      SELECT
        pol."inbound_order_id",
        MIN(s."sku_group") AS "sku_group",
        COUNT(DISTINCT s."sku_group") AS group_count
      FROM "inbound_order_lines" pol
      JOIN "skus" s
        ON s."sku_code" = pol."sku_code"
      WHERE s."sku_group" IS NOT NULL
      GROUP BY pol."inbound_order_id"
    )
    UPDATE "inbound_orders" po
    SET "sku_group" = olg."sku_group"
    FROM order_line_groups olg
    WHERE inbound."id" = olg."inbound_order_id"
      AND inbound."sku_group" IS NULL
      AND olg.group_count = 1`,
    `WITH order_seed AS (
      SELECT
        inbound."id" AS "inbound_order_id",
        COALESCE(
          NULLIF(inbound."sku_group", ''),
          upper(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^(?:INV|Inbound)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$')),
          upper(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^Inbound-[0-9]+-([A-Z0-9]+)$'))
        ) AS "sku_group",
        COALESCE(
          NULLIF(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^Inbound-([0-9]+)-[A-Z0-9]+$'), ''),
          NULLIF(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^(?:INV|Inbound)-([0-9]+)[A-Z]?-[A-Z0-9]+(?:-[A-Z]{2})?$'), ''),
          NULLIF(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^TG-[A-Z]{2}-([0-9]+)$'), ''),
          NULLIF(substring(coalesce(inbound."inbound_number", inbound."order_number") FROM '^IN-0*([0-9]+)$'), '')
        ) AS "sequence_text"
      FROM "inbound_orders" po
      WHERE inbound."is_legacy" = false
    )
    UPDATE "inbound_order_lines" pol
    SET "lot_ref" = format(
      'Lot-%s-%s-%s',
      (seed."sequence_text")::integer,
      seed."sku_group",
      upper(regexp_replace(pol."sku_code", '[^A-Za-z0-9]', '', 'g'))
	    )
	    FROM order_seed seed
	    WHERE pol."inbound_order_id" = seed."inbound_order_id"
	      AND seed."sku_group" IS NOT NULL
	      AND seed."sequence_text" IS NOT NULL
	      AND (pol."lot_ref" IS NULL OR btrim(pol."lot_ref") = '')`,
	  ]

  console.log(`\n[${tenant}] Applying supply chain naming convention schema/backfill`)
  for (const statement of statements) {
    if (options.dryRun) {
      console.log(`[${tenant}] DRY RUN: ${statement}`)
      continue
    }

    await prisma.$executeRawUnsafe(statement)
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
