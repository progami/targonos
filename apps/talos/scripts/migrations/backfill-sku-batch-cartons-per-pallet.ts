#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import type { TenantCode } from '../../src/lib/tenant/constants'

type SchemaTier = 'main' | 'dev'

type ScriptOptions = {
  tenants: TenantCode[]
  schemaTiers: SchemaTier[]
  dryRun: boolean
  help?: boolean
}

const DEFAULT_CARTONS_PER_PALLET = 48

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
    schemaTiers: ['main', 'dev'],
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
    if (arg.startsWith('--schema=')) {
      const value = arg.split('=')[1]?.toLowerCase()
      if (value === 'main' || value === 'dev') {
        options.schemaTiers = [value]
        continue
      }
      if (value === 'all') {
        options.schemaTiers = ['main', 'dev']
        continue
      }
      throw new Error(`Invalid --schema value: ${value ?? ''} (expected main, dev, or all)`)
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Backfill SKU Batch Cartons / Pallet

Ensures sku_batches.storage_cartons_per_pallet and sku_batches.shipping_cartons_per_pallet
are set to positive integers for all batches.

Resolution order (per batch):
  1) Keep existing positive value
  2) Use the most recently updated warehouse_sku_storage_configs value for the SKU (if present)
  3) Fall back to ${DEFAULT_CARTONS_PER_PALLET}

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/backfill-sku-batch-cartons-per-pallet.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --schema=main|dev|all     Which schema tiers to process (default: all)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

function withoutSchema(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    url.searchParams.delete('schema')
    return url.toString()
  } catch {
    return databaseUrl
  }
}

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`
}

function expectedSchemas(tenant: TenantCode, tiers: SchemaTier[]) {
  const suffix = tenant.toLowerCase()
  return tiers.map(tier => `${tier}_talos_${suffix}`)
}

async function schemaExists(client: Client, schema: string): Promise<boolean> {
  const result = await client.query<{ schema_name: string }>(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
    [schema]
  )
  return result.rowCount > 0
}

async function tableExists(client: Client, schema: string, tableName: string): Promise<boolean> {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1
    `,
    [schema, tableName]
  )
  return result.rowCount > 0
}

async function applyForSchema(
  client: Client,
  schema: string,
  options: ScriptOptions,
  tenant: TenantCode
) {
  const banner = `[${tenant}] schema=${schema}`
  console.log(`\n${banner}`)

  await client.query('BEGIN')
  await client.query(`SET search_path TO ${quoteIdent(schema)}`)

  const missing = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM sku_batches
      WHERE storage_cartons_per_pallet IS NULL
         OR shipping_cartons_per_pallet IS NULL
         OR storage_cartons_per_pallet <= 0
         OR shipping_cartons_per_pallet <= 0
    `
  )

  const missingCount = Number.parseInt(missing.rows[0]?.count ?? '0', 10)
  console.log(`${banner} batches needing backfill=${missingCount}`)

  if (missingCount <= 0) {
    await client.query(options.dryRun ? 'ROLLBACK' : 'COMMIT')
    return
  }

  const hasWarehouseConfig = await tableExists(client, schema, 'warehouse_sku_storage_configs')

  if (options.dryRun) {
    console.log(
      `${banner} DRY RUN: will backfill from ${hasWarehouseConfig ? 'warehouse_sku_storage_configs' : 'defaults only'}`
    )
    await client.query('ROLLBACK')
    return
  }

  if (hasWarehouseConfig) {
    await client.query(
      `
        UPDATE sku_batches b
        SET
          storage_cartons_per_pallet = COALESCE(
            CASE WHEN b.storage_cartons_per_pallet IS NOT NULL AND b.storage_cartons_per_pallet > 0 THEN b.storage_cartons_per_pallet END,
            (
              SELECT w.storage_cartons_per_pallet
              FROM warehouse_sku_storage_configs w
              WHERE w.sku_id = b.sku_id
                AND w.storage_cartons_per_pallet IS NOT NULL
                AND w.storage_cartons_per_pallet > 0
              ORDER BY w.updated_at DESC
              LIMIT 1
            ),
            (
              SELECT w.shipping_cartons_per_pallet
              FROM warehouse_sku_storage_configs w
              WHERE w.sku_id = b.sku_id
                AND w.shipping_cartons_per_pallet IS NOT NULL
                AND w.shipping_cartons_per_pallet > 0
              ORDER BY w.updated_at DESC
              LIMIT 1
            ),
            $1
          ),
          shipping_cartons_per_pallet = COALESCE(
            CASE WHEN b.shipping_cartons_per_pallet IS NOT NULL AND b.shipping_cartons_per_pallet > 0 THEN b.shipping_cartons_per_pallet END,
            (
              SELECT w.shipping_cartons_per_pallet
              FROM warehouse_sku_storage_configs w
              WHERE w.sku_id = b.sku_id
                AND w.shipping_cartons_per_pallet IS NOT NULL
                AND w.shipping_cartons_per_pallet > 0
              ORDER BY w.updated_at DESC
              LIMIT 1
            ),
            (
              SELECT w.storage_cartons_per_pallet
              FROM warehouse_sku_storage_configs w
              WHERE w.sku_id = b.sku_id
                AND w.storage_cartons_per_pallet IS NOT NULL
                AND w.storage_cartons_per_pallet > 0
              ORDER BY w.updated_at DESC
              LIMIT 1
            ),
            $1
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE b.storage_cartons_per_pallet IS NULL
           OR b.shipping_cartons_per_pallet IS NULL
           OR b.storage_cartons_per_pallet <= 0
           OR b.shipping_cartons_per_pallet <= 0
      `,
      [DEFAULT_CARTONS_PER_PALLET]
    )
  } else {
    await client.query(
      `
        UPDATE sku_batches
        SET
          storage_cartons_per_pallet = COALESCE(
            CASE WHEN storage_cartons_per_pallet IS NOT NULL AND storage_cartons_per_pallet > 0 THEN storage_cartons_per_pallet END,
            $1
          ),
          shipping_cartons_per_pallet = COALESCE(
            CASE WHEN shipping_cartons_per_pallet IS NOT NULL AND shipping_cartons_per_pallet > 0 THEN shipping_cartons_per_pallet END,
            $1
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE storage_cartons_per_pallet IS NULL
           OR shipping_cartons_per_pallet IS NULL
           OR storage_cartons_per_pallet <= 0
           OR shipping_cartons_per_pallet <= 0
      `,
      [DEFAULT_CARTONS_PER_PALLET]
    )
  }

  const remaining = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM sku_batches
      WHERE storage_cartons_per_pallet IS NULL
         OR shipping_cartons_per_pallet IS NULL
         OR storage_cartons_per_pallet <= 0
         OR shipping_cartons_per_pallet <= 0
    `
  )

  const remainingCount = Number.parseInt(remaining.rows[0]?.count ?? '0', 10)
  if (remainingCount > 0) {
    throw new Error(`${banner} backfill incomplete: remaining invalid batches=${remainingCount}`)
  }

  await client.query('COMMIT')
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const envKey = tenant === 'US' ? 'DATABASE_URL_US' : 'DATABASE_URL_UK'
  const rawUrl = process.env[envKey]
  if (!rawUrl) {
    throw new Error(`Missing ${envKey} in environment`)
  }

  const baseUrl = withoutSchema(rawUrl)
  const client = new Client({ connectionString: baseUrl })
  await client.connect()

  const schemas = expectedSchemas(tenant, options.schemaTiers)
  for (const schema of schemas) {
    if (!(await schemaExists(client, schema))) {
      console.log(`[${tenant}] schema=${schema} missing; skipping`)
      continue
    }

    try {
      await applyForSchema(client, schema, options, tenant)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  }

  await client.end()
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
