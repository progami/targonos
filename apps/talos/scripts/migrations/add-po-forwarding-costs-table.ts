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
      throw new Error(`Invalid --tenant value: ${value ?? ''} (expected US, UK, or ALL) `)
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Add Purchase Order Forwarding Costs Table

Creates purchase_order_forwarding_costs in each tenant schema.
Used to capture PO-level forwarding costs (CostCategory.Forwarding) and allocate
them into CostLedger at receipt time.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/add-po-forwarding-costs-table.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Ensuring purchase_order_forwarding_costs exists`)

  const ddlStatements = [
    `
      CREATE TABLE IF NOT EXISTS "purchase_order_forwarding_costs" (
        "id" text NOT NULL,
        "purchase_order_id" text NOT NULL,
        "warehouse_id" text NOT NULL,
        "cost_rate_id" text,
        "cost_name" text NOT NULL,
        "quantity" numeric(12,4) NOT NULL,
        "unit_rate" numeric(12,4) NOT NULL,
        "total_cost" numeric(12,2) NOT NULL,
        "currency" text,
        "notes" text,
        "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by_id" text,
        "created_by_name" text,
        CONSTRAINT "purchase_order_forwarding_costs_pkey" PRIMARY KEY ("id")
      )
    `,
    `ALTER TABLE "purchase_order_forwarding_costs" DROP CONSTRAINT IF EXISTS "purchase_order_forwarding_costs_purchase_order_id_fkey"`,
    `
      ALTER TABLE "purchase_order_forwarding_costs"
        ADD CONSTRAINT "purchase_order_forwarding_costs_purchase_order_id_fkey"
        FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `,
    `ALTER TABLE "purchase_order_forwarding_costs" DROP CONSTRAINT IF EXISTS "purchase_order_forwarding_costs_warehouse_id_fkey"`,
    `
      ALTER TABLE "purchase_order_forwarding_costs"
        ADD CONSTRAINT "purchase_order_forwarding_costs_warehouse_id_fkey"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `,
    `ALTER TABLE "purchase_order_forwarding_costs" DROP CONSTRAINT IF EXISTS "purchase_order_forwarding_costs_cost_rate_id_fkey"`,
    `
      ALTER TABLE "purchase_order_forwarding_costs"
        ADD CONSTRAINT "purchase_order_forwarding_costs_cost_rate_id_fkey"
        FOREIGN KEY ("cost_rate_id") REFERENCES "cost_rates"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    `,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_purchase_order_id_idx" ON "purchase_order_forwarding_costs"("purchase_order_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_warehouse_id_idx" ON "purchase_order_forwarding_costs"("warehouse_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_order_forwarding_costs_cost_rate_id_idx" ON "purchase_order_forwarding_costs"("cost_rate_id")`,
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
