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

type DefaultBatchRow = {
  batch_id: string
  sku_id: string
  sku_code: string
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
Remove DEFAULT SKU Batches

Renames sku_batches.batch_code='DEFAULT' to a non-default code per SKU and updates all
batch_lot references (inventory transactions, purchase order lines, goods receipts, etc.)
so there are no remaining DEFAULT batches in the schema.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/remove-default-sku-batches.ts [options]

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
  return tiers.map((tier) => `${tier}_talos_${suffix}`)
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

async function collectBatchLotsForSku(
  client: Client,
  schema: string,
  tableName: string,
  skuCode: string
): Promise<Set<string>> {
  if (!(await tableExists(client, schema, tableName))) return new Set<string>()

  const result = await client.query<{ code: string }>(
    `
      SELECT DISTINCT UPPER(batch_lot) AS code
      FROM ${quoteIdent(tableName)}
      WHERE LOWER(sku_code) = LOWER($1)
        AND batch_lot IS NOT NULL
    `,
    [skuCode]
  )

  return new Set(result.rows.map(row => row.code).filter(Boolean))
}

async function findReplacementCode(
  client: Client,
  schema: string,
  skuId: string,
  skuCode: string
): Promise<string> {
  const existingBatches = await client.query<{ code: string }>(
    `
      SELECT DISTINCT UPPER(batch_code) AS code
      FROM sku_batches
      WHERE sku_id = $1
    `,
    [skuId]
  )

  const usedCodes = new Set(existingBatches.rows.map(row => row.code).filter(Boolean))

  const referenceTables = [
    'inventory_transactions',
    'purchase_order_lines',
    'goods_receipt_lines',
    'fulfillment_order_lines',
    'storage_ledger',
  ]

  for (const tableName of referenceTables) {
    const codes = await collectBatchLotsForSku(client, schema, tableName, skuCode)
    for (const code of codes) usedCodes.add(code)
  }

  for (let attempt = 1; attempt <= 9999; attempt += 1) {
    const padded = String(attempt).padStart(3, '0')
    const candidate = `BATCH-${padded}`
    if (candidate === 'DEFAULT') continue
    if (usedCodes.has(candidate)) continue
    return candidate
  }

  throw new Error(`Unable to find replacement batch code for SKU ${skuCode}`)
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

  const defaultBatches = await client.query<DefaultBatchRow>(
    `
      SELECT b.id AS batch_id, b.sku_id, s.sku_code
      FROM sku_batches b
      JOIN skus s ON s.id = b.sku_id
      WHERE UPPER(b.batch_code) = 'DEFAULT'
      ORDER BY s.sku_code
    `
  )

  console.log(`${banner} default batches=${defaultBatches.rowCount}`)

  if (options.dryRun) {
    for (const row of defaultBatches.rows) {
      const replacement = await findReplacementCode(client, schema, row.sku_id, row.sku_code)
      console.log(`${banner} ${row.sku_code}: DEFAULT -> ${replacement}`)
    }
    await client.query('ROLLBACK')
    return
  }

  for (const row of defaultBatches.rows) {
    const replacement = await findReplacementCode(client, schema, row.sku_id, row.sku_code)

    console.log(`${banner} ${row.sku_code}: DEFAULT -> ${replacement}`)

    await client.query(
      `
        UPDATE sku_batches
        SET batch_code = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [replacement, row.batch_id]
    )

    const updateTargets = [
      'inventory_transactions',
      'purchase_order_lines',
      'goods_receipt_lines',
      'fulfillment_order_lines',
      'storage_ledger',
    ]

    for (const tableName of updateTargets) {
      if (!(await tableExists(client, schema, tableName))) continue

      await client.query(
        `
          UPDATE ${quoteIdent(tableName)}
          SET batch_lot = $1
          WHERE LOWER(sku_code) = LOWER($2)
            AND UPPER(batch_lot) = 'DEFAULT'
        `,
        [replacement, row.sku_code]
      )
    }
  }

  const remainingDefaultLots: Array<{ table: string; count: number; skus: string[] }> = []
  for (const tableName of ['inventory_transactions', 'purchase_order_lines', 'goods_receipt_lines', 'fulfillment_order_lines', 'storage_ledger']) {
    if (!(await tableExists(client, schema, tableName))) continue

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdent(tableName)} WHERE UPPER(batch_lot) = 'DEFAULT'`
    )
    const count = Number.parseInt(countResult.rows[0]?.count ?? '0', 10)
    if (!Number.isFinite(count) || count <= 0) continue

    const skuResult = await client.query<{ sku_code: string }>(
      `
        SELECT DISTINCT sku_code
        FROM ${quoteIdent(tableName)}
        WHERE UPPER(batch_lot) = 'DEFAULT'
        ORDER BY sku_code
        LIMIT 5
      `
    )
    remainingDefaultLots.push({
      table: tableName,
      count,
      skus: skuResult.rows.map(row => row.sku_code).filter(Boolean),
    })
  }

  if (remainingDefaultLots.length > 0) {
    const details = remainingDefaultLots
      .map(entry => `${entry.table}=${entry.count} (e.g. ${entry.skus.join(', ') || 'n/a'})`)
      .join('; ')
    throw new Error(`${banner} Remaining DEFAULT batch_lot references: ${details}`)
  }

  await client.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sku_batches_batch_code_not_default'
            AND conrelid = 'sku_batches'::regclass
        ) THEN
          ALTER TABLE sku_batches
            ADD CONSTRAINT sku_batches_batch_code_not_default
            CHECK (UPPER(batch_code) <> 'DEFAULT');
        END IF;
      END $$;
    `
  )

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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
