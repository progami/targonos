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
Backfill Purchase Order line packaging snapshots

Copies carton dims/weight + per-pallet config from sku_batches (fallback to skus for dims/weight)
into purchase_order_lines snapshot columns so POs stop depending on live SKU/batch enrichment.

Also backfills purchase_orders.counterparty_address from suppliers where missing.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/backfill-po-line-packaging-snapshots.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --schema=main|dev|all     Which schema tiers to process (default: all)
  --dry-run                Print planned changes without applying them
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
  return tiers.map(tier => `${tier}_wms_${suffix}`)
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

async function columnExists(
  client: Client,
  schema: string,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `,
    [schema, tableName, columnName]
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
  await client.query(`SET search_path TO ${quoteIdent(schema)}, public`)

  const hasPoLines = await tableExists(client, schema, 'purchase_order_lines')
  if (!hasPoLines) {
    console.log(`${banner} missing purchase_order_lines table; skipping`)
    await client.query('ROLLBACK')
    return
  }

  const hasSnapshotColumns = await columnExists(client, schema, 'purchase_order_lines', 'carton_weight_kg')
  if (!hasSnapshotColumns) {
    console.log(`${banner} missing snapshot columns; run ensure-talos-tenant-schema first`)
    await client.query('ROLLBACK')
    return
  }

  const hasSuppliers = await tableExists(client, schema, 'suppliers')
  const hasCounterpartyAddress = await columnExists(
    client,
    schema,
    'purchase_orders',
    'counterparty_address'
  )

  if (hasSuppliers && hasCounterpartyAddress) {
    const missingPoAddress = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM purchase_orders po
        WHERE po.counterparty_name IS NOT NULL
          AND (po.counterparty_address IS NULL OR length(trim(po.counterparty_address)) = 0)
      `
    )
    const missingCount = Number.parseInt(missingPoAddress.rows[0]?.count ?? '0', 10)
    console.log(`${banner} purchase_orders missing counterparty_address=${missingCount}`)

    if (!options.dryRun && missingCount > 0) {
      await client.query(
        `
          UPDATE purchase_orders po
          SET counterparty_address = s.address
          FROM suppliers s
          WHERE po.counterparty_name = s.name
            AND po.counterparty_name IS NOT NULL
            AND (po.counterparty_address IS NULL OR length(trim(po.counterparty_address)) = 0)
            AND s.address IS NOT NULL
            AND length(trim(s.address)) > 0
        `
      )
    }
  }

	  const missingLines = await client.query<{ count: string }>(
	    `
	      SELECT COUNT(*)::text AS count
	      FROM purchase_order_lines pol
      WHERE pol.batch_lot IS NOT NULL
        AND upper(regexp_replace(pol.batch_lot, '^.* - ', '')) <> 'DEFAULT'
	        AND (
	          pol.carton_dimensions_cm IS NULL
	          OR pol.carton_side1_cm IS NULL
	          OR pol.carton_side2_cm IS NULL
	          OR pol.carton_side3_cm IS NULL
	          OR pol.carton_weight_kg IS NULL
	          OR pol.packaging_type IS NULL
	          OR pol.storage_cartons_per_pallet IS NULL
	          OR pol.shipping_cartons_per_pallet IS NULL
	        )
	    `
	  )

  const missingCount = Number.parseInt(missingLines.rows[0]?.count ?? '0', 10)
  console.log(`${banner} purchase_order_lines needing snapshot backfill=${missingCount}`)

  if (missingCount <= 0) {
    await client.query(options.dryRun ? 'ROLLBACK' : 'COMMIT')
    return
  }

  if (options.dryRun) {
    await client.query('ROLLBACK')
    return
  }

	  await client.query(
	    `
	      UPDATE purchase_order_lines pol
	      SET
	        carton_dimensions_cm = COALESCE(
	          pol.carton_dimensions_cm,
	          src.batch_carton_dimensions_cm,
	          src.sku_carton_dimensions_cm
	        ),
	        carton_side1_cm = COALESCE(pol.carton_side1_cm, src.batch_carton_side1_cm, src.sku_carton_side1_cm),
	        carton_side2_cm = COALESCE(pol.carton_side2_cm, src.batch_carton_side2_cm, src.sku_carton_side2_cm),
	        carton_side3_cm = COALESCE(pol.carton_side3_cm, src.batch_carton_side3_cm, src.sku_carton_side3_cm),
	        carton_weight_kg = COALESCE(pol.carton_weight_kg, src.batch_carton_weight_kg, src.sku_carton_weight_kg),
	        packaging_type = COALESCE(pol.packaging_type, src.batch_packaging_type, src.sku_packaging_type),
	        storage_cartons_per_pallet = COALESCE(pol.storage_cartons_per_pallet, src.batch_storage_cartons_per_pallet),
	        shipping_cartons_per_pallet = COALESCE(pol.shipping_cartons_per_pallet, src.batch_shipping_cartons_per_pallet)
	      FROM (
	        SELECT
	          pol2.id AS pol_id,
	          s.carton_dimensions_cm AS sku_carton_dimensions_cm,
	          s.carton_side1_cm AS sku_carton_side1_cm,
	          s.carton_side2_cm AS sku_carton_side2_cm,
	          s.carton_side3_cm AS sku_carton_side3_cm,
	          s.carton_weight_kg AS sku_carton_weight_kg,
	          s.packaging_type AS sku_packaging_type,
	          b.carton_dimensions_cm AS batch_carton_dimensions_cm,
	          b.carton_side1_cm AS batch_carton_side1_cm,
	          b.carton_side2_cm AS batch_carton_side2_cm,
	          b.carton_side3_cm AS batch_carton_side3_cm,
	          b.carton_weight_kg AS batch_carton_weight_kg,
	          b.packaging_type AS batch_packaging_type,
	          b.storage_cartons_per_pallet AS batch_storage_cartons_per_pallet,
	          b.shipping_cartons_per_pallet AS batch_shipping_cartons_per_pallet
	        FROM purchase_order_lines pol2
        JOIN skus s
          ON upper(s.sku_code) = upper(pol2.sku_code)
        LEFT JOIN sku_batches b
          ON b.sku_id = s.id
         AND upper(b.batch_code) = upper(regexp_replace(pol2.batch_lot, '^.* - ', ''))
        WHERE pol2.batch_lot IS NOT NULL
          AND upper(regexp_replace(pol2.batch_lot, '^.* - ', '')) <> 'DEFAULT'
      ) src
      WHERE pol.id = src.pol_id
        AND pol.batch_lot IS NOT NULL
        AND upper(regexp_replace(pol.batch_lot, '^.* - ', '')) <> 'DEFAULT'
	        AND (
	          pol.carton_dimensions_cm IS NULL
	          OR pol.carton_side1_cm IS NULL
	          OR pol.carton_side2_cm IS NULL
	          OR pol.carton_side3_cm IS NULL
	          OR pol.carton_weight_kg IS NULL
	          OR pol.packaging_type IS NULL
	          OR pol.storage_cartons_per_pallet IS NULL
	          OR pol.shipping_cartons_per_pallet IS NULL
	        )
	    `
	  )

  await client.query('COMMIT')
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const client = new Client({
    connectionString: withoutSchema(databaseUrl),
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    for (const tenant of options.tenants) {
      const schemas = expectedSchemas(tenant, options.schemaTiers)
      for (const schema of schemas) {
        if (!(await schemaExists(client, schema))) {
          console.log(`\n[${tenant}] schema=${schema} does not exist; skipping`)
          continue
        }

        await applyForSchema(client, schema, options, tenant)
      }
    }
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
