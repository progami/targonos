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

type CandidateLine = {
  id: string
  purchase_order_id: string
  po_number: string | null
  po_created_at: Date
  sku_code: string
  batch_lot: string | null
  legacy_units: number
  units_per_carton: number
  units_ordered: number
  total_cost: string | null
  unit_cost: string | null
  posted_quantity: number
  quantity_received: number | null
}

const UNITS_FIRST_MIGRATION = '20260108190000_po_line_units_first'
const UNITS_FIRST_FALLBACK_CUTOFF = new Date('2026-01-08T19:00:00.000Z')

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
Fix legacy Purchase Order line quantity semantics

Early Talos PO lines stored "quantity" as UNITS. Later migrations introduced:
  - units_ordered (units)
  - units_per_carton
  - total_cost
  - quantity (cartons)

The "units-first" migration assumed quantity was cartons and backfilled units_ordered incorrectly for legacy rows,
which can inflate receiving cartons/pallets and distort unit cost.

This script repairs legacy rows by:
  - treating existing purchase_order_lines.quantity as units
  - calculating cartons = units / units_per_carton
  - setting units_ordered = units and quantity = cartons
  - recomputing unit_cost from total_cost / units (when total_cost present)
  - fixing any inventory_transactions where cartons_in mistakenly equals units_ordered

The script uses the applied timestamp of Prisma migration "${UNITS_FIRST_MIGRATION}" as the cutover per schema.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/fix-po-line-legacy-units.ts [options]

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
  return tiers.map(tier => `${tier}_talos_${suffix}`)
}

async function schemaExists(client: Client, schema: string): Promise<boolean> {
  const result = await client.query<{ schema_name: string }>(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
    [schema]
  )
  return result.rowCount > 0
}

async function resolveUnitsFirstCutoff(client: Client): Promise<Date | null> {
  const exists = await client.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [
    '_prisma_migrations',
  ])
  if (!exists.rows[0]?.reg) return UNITS_FIRST_FALLBACK_CUTOFF

  const result = await client.query<{ finished_at: Date | null }>(
    `
      SELECT finished_at
      FROM _prisma_migrations
      WHERE migration_name = $1
      ORDER BY finished_at DESC
      LIMIT 1
    `,
    [UNITS_FIRST_MIGRATION]
  )

  return result.rows[0]?.finished_at ?? UNITS_FIRST_FALLBACK_CUTOFF
}

function fmtMoney(value: string | null) {
  if (!value) return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value
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

  const cutoff = await resolveUnitsFirstCutoff(client)
  if (!cutoff) throw new Error(`${banner} unable to determine cutoff timestamp`)

  const candidateLines = await client.query<CandidateLine>(
    `
      SELECT
        pol.id,
        pol.purchase_order_id,
        po.po_number,
        po.created_at AS po_created_at,
        pol.sku_code,
        pol.batch_lot,
        pol.quantity AS legacy_units,
        pol.units_per_carton,
        pol.units_ordered,
        pol.total_cost,
        pol.unit_cost,
        pol.posted_quantity,
        pol.quantity_received
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE pol.created_at < $1
        AND pol.units_per_carton > 1
        AND pol.quantity >= pol.units_per_carton
        AND (pol.quantity % pol.units_per_carton) = 0
        AND pol.status <> 'CANCELLED'
      ORDER BY po.po_number, pol.sku_code, pol.batch_lot
    `,
    [cutoff]
  )

  console.log(`${banner} cutoff=${cutoff.toISOString()} candidates=${candidateLines.rowCount}`)

  if (candidateLines.rowCount === 0) {
    await client.query('ROLLBACK')
    return
  }

  if (options.dryRun) {
    for (const row of candidateLines.rows) {
      const cartons = row.legacy_units / Math.max(1, row.units_per_carton)
      const unitCost =
        row.total_cost && row.legacy_units > 0
          ? (Number(row.total_cost) / row.legacy_units).toFixed(4)
          : (row.unit_cost ?? '—')
      const postedCartons = row.posted_quantity === row.legacy_units ? cartons : row.posted_quantity
      const receivedCartons =
        row.quantity_received === row.legacy_units ? cartons : (row.quantity_received ?? null)

      console.log(
        `${banner} ${row.po_number ?? row.purchase_order_id} ${row.sku_code} ${row.batch_lot ?? ''}`.trim()
      )
      console.log(
        `  units: ${row.legacy_units} -> ${row.legacy_units}, cartons: ${row.legacy_units} -> ${cartons} (upc=${row.units_per_carton})`
      )
      console.log(
        `  cost: total=${fmtMoney(row.total_cost)} unit=${row.unit_cost ?? '—'} -> ${unitCost}`
      )
      console.log(
        `  received: posted=${row.posted_quantity} -> ${postedCartons} qtyReceived=${row.quantity_received ?? '—'} -> ${receivedCartons ?? '—'}`
      )
    }

    await client.query('ROLLBACK')
    return
  }

  const linesUpdate = await client.query(
    `
      UPDATE purchase_order_lines pol
      SET
        units_ordered = pol.quantity,
        quantity = (pol.quantity / pol.units_per_carton),
        unit_cost = CASE
          WHEN pol.total_cost IS NOT NULL AND pol.quantity > 0
            THEN ROUND((pol.total_cost / pol.quantity)::numeric, 4)
          ELSE pol.unit_cost
        END,
        posted_quantity = CASE
          WHEN pol.posted_quantity = pol.quantity
            THEN (pol.posted_quantity / pol.units_per_carton)
          ELSE pol.posted_quantity
        END,
        quantity_received = CASE
          WHEN pol.quantity_received = pol.quantity
            THEN (pol.quantity_received / pol.units_per_carton)
          ELSE pol.quantity_received
        END,
        status = CASE
          WHEN (
            CASE
              WHEN pol.posted_quantity = pol.quantity
                THEN (pol.posted_quantity / pol.units_per_carton)
              ELSE pol.posted_quantity
            END
          ) >= (pol.quantity / pol.units_per_carton)
            THEN 'POSTED'::"PurchaseOrderLineStatus"
          ELSE 'PENDING'::"PurchaseOrderLineStatus"
        END,
        updated_at = CURRENT_TIMESTAMP
      FROM purchase_orders po
      WHERE po.id = pol.purchase_order_id
        AND pol.created_at < $1
        AND pol.units_per_carton > 1
        AND pol.quantity >= pol.units_per_carton
        AND (pol.quantity % pol.units_per_carton) = 0
        AND pol.status <> 'CANCELLED'
    `,
    [cutoff]
  )

  console.log(`${banner} updated PO lines=${linesUpdate.rowCount}`)

  const txUpdate = await client.query(
    `
      UPDATE inventory_transactions it
      SET
        cartons_in = pol.quantity,
        storage_pallets_in = CASE
          WHEN it.storage_cartons_per_pallet IS NOT NULL AND it.storage_cartons_per_pallet > 0
            THEN CEIL((pol.quantity::numeric) / it.storage_cartons_per_pallet)::int
          ELSE it.storage_pallets_in
        END
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE it.purchase_order_line_id = pol.id
        AND it.transaction_type = 'RECEIVE'
        AND pol.created_at < $1
        AND pol.units_per_carton > 1
        AND it.cartons_in = pol.units_ordered
    `,
    [cutoff]
  )

  console.log(`${banner} updated inventory transactions=${txUpdate.rowCount}`)

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
