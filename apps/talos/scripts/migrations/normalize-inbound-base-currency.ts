#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import type { TenantCode } from '../../src/lib/tenant/constants'
import { INBOUND_BASE_CURRENCY } from '../../src/lib/constants/cost-currency'

type SchemaTier = 'main' | 'dev'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  schemaTiers: SchemaTier[]
  dryRun: boolean
  help?: boolean
}

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    schemaTiers: ['main', 'dev'],
    dryRun: false,
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (!arg || arg === '--') continue
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
  console.info(`
Normalize Inbound Base Currency

Backfills inbound product and manual Inbound-cost records to ${INBOUND_BASE_CURRENCY}.
Freight / forwarding rows are left untouched so they can remain USD or GBP.

Usage:
  pnpm --filter @targon/talos db:migrate:inbound-base-currency [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --schema=main|dev|all     Which schema tiers to process (default: all)
  --dry-run                 Print planned changes without applying them
  --help, -h                Show this help
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

type CountRow = {
  line_count: string
  manual_financial_count: string
  duty_count: string
  forwarding_gbp_count: string
}

async function applyForSchema(
  client: Client,
  schema: string,
  options: ScriptOptions,
  tenant: TenantCode
) {
  const banner = `[${tenant}] schema=${schema}`
  console.info(`\n${banner}`)

  await client.query('BEGIN')
  await client.query(`SET search_path TO ${quoteIdent(schema)}, public`)

  const counts = await client.query<CountRow>(`
    SELECT
      (
        SELECT COUNT(*)::text
        FROM inbound_order_lines
        WHERE currency IS DISTINCT FROM '${INBOUND_BASE_CURRENCY}'
      ) AS line_count,
      (
        SELECT COUNT(*)::text
        FROM financial_ledger
        WHERE inbound_order_id IS NOT NULL
          AND source_type = 'MANUAL'
          AND currency IS DISTINCT FROM '${INBOUND_BASE_CURRENCY}'
      ) AS manual_financial_count,
      (
        SELECT COUNT(*)::text
        FROM inbound_orders
        WHERE duty_amount IS NOT NULL
          AND duty_amount <> 0
          AND duty_currency IS DISTINCT FROM '${INBOUND_BASE_CURRENCY}'
      ) AS duty_count,
      (
        SELECT COUNT(*)::text
        FROM inbound_order_forwarding_costs
        WHERE upper(coalesce(currency, '')) = 'GBP'
      ) AS forwarding_gbp_count
  `)

  const row = counts.rows[0]
  const lineCount = Number.parseInt(row?.line_count ?? '0', 10)
  const manualFinancialCount = Number.parseInt(row?.manual_financial_count ?? '0', 10)
  const dutyCount = Number.parseInt(row?.duty_count ?? '0', 10)
  const forwardingGbpCount = Number.parseInt(row?.forwarding_gbp_count ?? '0', 10)

  console.info(`${banner} inbound_order_lines to normalize=${lineCount}`)
  console.info(`${banner} manual Inbound financial rows to normalize=${manualFinancialCount}`)
  console.info(`${banner} duty currency rows to normalize=${dutyCount}`)
  console.info(`${banner} forwarding GBP rows preserved=${forwardingGbpCount}`)

  if (options.dryRun) {
    await client.query('ROLLBACK')
    return
  }

  if (lineCount > 0) {
    await client.query(
      `
        UPDATE inbound_order_lines
        SET currency = $1
        WHERE currency IS DISTINCT FROM $1
      `,
      [INBOUND_BASE_CURRENCY]
    )
  }

  if (manualFinancialCount > 0) {
    await client.query(
      `
        UPDATE financial_ledger
        SET currency = $1
        WHERE inbound_order_id IS NOT NULL
          AND source_type = 'MANUAL'
          AND currency IS DISTINCT FROM $1
      `,
      [INBOUND_BASE_CURRENCY]
    )
  }

  if (dutyCount > 0) {
    await client.query(
      `
        UPDATE inbound_orders
        SET duty_currency = $1
        WHERE duty_amount IS NOT NULL
          AND duty_amount <> 0
          AND duty_currency IS DISTINCT FROM $1
      `,
      [INBOUND_BASE_CURRENCY]
    )
  }

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
          console.info(`\n[${tenant}] schema=${schema} does not exist; skipping`)
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
