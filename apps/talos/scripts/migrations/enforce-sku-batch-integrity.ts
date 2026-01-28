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
Enforce SKU Batch Integrity

Applies constraints so each SKU has at least one batch and cartons-per-pallet
is required and positive. Cleans invalid batches and batchless SKUs.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/enforce-sku-batch-integrity.ts [options]

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

  const invalidBatches = await client.query<{
    id: string
    sku_id: string
    batch_code: string
  }>(
    `
      SELECT id, sku_id, batch_code
      FROM sku_batches
      WHERE storage_cartons_per_pallet IS NULL
         OR shipping_cartons_per_pallet IS NULL
         OR storage_cartons_per_pallet <= 0
         OR shipping_cartons_per_pallet <= 0
    `
  )

  const batchlessSkus = await client.query<{ id: string; sku_code: string }>(
    `
      SELECT s.id, s.sku_code
      FROM skus s
      LEFT JOIN sku_batches b
        ON b.sku_id = s.id
       AND b.storage_cartons_per_pallet IS NOT NULL
       AND b.shipping_cartons_per_pallet IS NOT NULL
       AND b.storage_cartons_per_pallet > 0
       AND b.shipping_cartons_per_pallet > 0
      GROUP BY s.id, s.sku_code
      HAVING COUNT(b.id) = 0
    `
  )

  console.log(
    `${banner} invalid batches=${invalidBatches.rowCount} batchless skus=${batchlessSkus.rowCount}`
  )

  if (options.dryRun) {
    await client.query('ROLLBACK')
    return
  }

  if (invalidBatches.rowCount > 0) {
    await client.query(
      `
        DELETE FROM sku_batches
        WHERE storage_cartons_per_pallet IS NULL
           OR shipping_cartons_per_pallet IS NULL
           OR storage_cartons_per_pallet <= 0
           OR shipping_cartons_per_pallet <= 0
      `
    )
  }

  if (batchlessSkus.rowCount > 0) {
    const ids = batchlessSkus.rows.map((row) => row.id)
    await client.query('DELETE FROM skus WHERE id::text = ANY($1::text[])', [ids])
  }

  const nullability = await client.query<{
    column_name: string
    is_nullable: string
  }>(
    `
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'sku_batches'
        AND column_name IN ('storage_cartons_per_pallet', 'shipping_cartons_per_pallet')
    `,
    [schema]
  )

  const nullableColumns = new Set(
    nullability.rows.filter((row) => row.is_nullable === 'YES').map((row) => row.column_name)
  )

  if (nullableColumns.has('storage_cartons_per_pallet')) {
    await client.query(
      'ALTER TABLE sku_batches ALTER COLUMN storage_cartons_per_pallet SET NOT NULL'
    )
  }

  if (nullableColumns.has('shipping_cartons_per_pallet')) {
    await client.query(
      'ALTER TABLE sku_batches ALTER COLUMN shipping_cartons_per_pallet SET NOT NULL'
    )
  }

  await client.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sku_batches_storage_cartons_per_pallet_positive'
            AND conrelid = 'sku_batches'::regclass
        ) THEN
          ALTER TABLE sku_batches
            ADD CONSTRAINT sku_batches_storage_cartons_per_pallet_positive
            CHECK (storage_cartons_per_pallet > 0);
        END IF;
      END $$;
    `
  )

  await client.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sku_batches_shipping_cartons_per_pallet_positive'
            AND conrelid = 'sku_batches'::regclass
        ) THEN
          ALTER TABLE sku_batches
            ADD CONSTRAINT sku_batches_shipping_cartons_per_pallet_positive
            CHECK (shipping_cartons_per_pallet > 0);
        END IF;
      END $$;
    `
  )

  await client.query(
    `
      CREATE OR REPLACE FUNCTION enforce_sku_batch_presence()
      RETURNS trigger AS $$
      DECLARE
        target_id text;
      BEGIN
        IF TG_TABLE_NAME = 'skus' THEN
          target_id := COALESCE(NEW.id::text, OLD.id::text);
        ELSE
          target_id := COALESCE(NEW.sku_id::text, OLD.sku_id::text);
        END IF;

        IF target_id IS NULL THEN
          RETURN NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM skus WHERE id::text = target_id) THEN
          RETURN NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM sku_batches WHERE sku_id::text = target_id) THEN
          RAISE EXCEPTION 'SKU % must have at least one batch', target_id;
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `
  )

  await client.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_sku_batches_require_batch'
            AND tgrelid = 'sku_batches'::regclass
        ) THEN
          CREATE CONSTRAINT TRIGGER trg_sku_batches_require_batch
            AFTER INSERT OR UPDATE OR DELETE ON sku_batches
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION enforce_sku_batch_presence();
        END IF;
      END $$;
    `
  )

  await client.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_skus_require_batch'
            AND tgrelid = 'skus'::regclass
        ) THEN
          CREATE CONSTRAINT TRIGGER trg_skus_require_batch
            AFTER INSERT OR UPDATE ON skus
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION enforce_sku_batch_presence();
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
