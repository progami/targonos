#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import type { TenantCode } from '../../src/lib/tenant/constants'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  help?: boolean
}

type TenantConnection = {
  tenant: TenantCode
  connectionString: string
}

type DatabaseContext = {
  database: string
  schema: string
}

type WarehouseAuditRow = {
  id: string
  code: string
  name: string
}

type PurchaseOrderAuditRow = {
  id: string
  poNumber: string | null
  warehouseCode: string
}

type FulfillmentOrderAuditRow = {
  id: string
  foNumber: string
  warehouseCode: string
}

type InventoryTransactionAuditRow = {
  id: string
  referenceId: string | null
  warehouseCode: string
}

type GoodsReceiptAuditRow = {
  id: string
  referenceNumber: string | null
  warehouseCode: string
}

type WarehouseInvoiceAuditRow = {
  id: string
  invoiceNumber: string
  warehouseCode: string
}

type StorageLedgerAuditRow = {
  id: string
  storageLedgerId: string
  warehouseCode: string
}

type StorageLedgerConflictRow = {
  amznId: string
  amznUsId: string
  skuCode: string
  lotRef: string
  weekEndingDate: string
}

type CostLedgerAuditRow = {
  id: string
  transactionId: string
  warehouseCode: string
}

type FinancialLedgerAuditRow = {
  id: string
  sourceType: string
  sourceId: string
  warehouseCode: string
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
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Report legacy Amazon warehouse-code rows

This script is intentionally report-only. It does not execute destructive SQL.
It reports rows that still use the legacy warehouse code "AMZN" and would need
to be renamed to "AMZN-US" during the reviewed cleanup migration.

Usage:
  pnpm --filter @targon/talos exec tsx scripts/migrations/rename-amzn-to-amzn-us.ts [options]

Options:
  --tenant=US|UK|ALL   Which tenant(s) to report (default: ALL)
  --dry-run            Explicitly mark the report as a dry run
  --help, -h           Show this help
`)
}

function resolveTenantConnection(tenant: TenantCode): TenantConnection {
  const envKey = `DATABASE_URL_${tenant}`
  const value = process.env[envKey]
  if (!value) {
    throw new Error(`Missing required ${envKey} environment variable for ${tenant} AMZN audit report.`)
  }

  const url = new URL(value)
  url.searchParams.set('application_name', `talos-rename-amzn-to-amzn-us-${tenant.toLowerCase()}`)

  const schema = url.searchParams.get('schema')
  if (schema !== null && !url.searchParams.has('options')) {
    url.searchParams.set('options', `-csearch_path=${schema},public`)
  }

  return {
    tenant,
    connectionString: url.toString(),
  }
}

async function getDatabaseContext(client: Client): Promise<DatabaseContext> {
  const result = await client.query<DatabaseContext>(
    'SELECT current_database() AS database, current_schema() AS schema'
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error('Unable to resolve database/schema context for AMZN rename audit.')
  }
  return row
}

function printSection(title: string, rows: unknown[]) {
  console.log(`  ${title}: ${rows.length}`)
  for (const row of rows) {
    console.log(`    ${JSON.stringify(row)}`)
  }
}

async function reportTenant(tenant: TenantCode, options: ScriptOptions) {
  const connection = resolveTenantConnection(tenant)
  const client = new Client({ connectionString: connection.connectionString })

  try {
    await client.connect()
    const context = await getDatabaseContext(client)

    const [
      warehouses,
      purchaseOrders,
      fulfillmentOrders,
      inventoryTransactions,
      goodsReceipts,
      warehouseInvoices,
      storageLedgerEntries,
      storageLedgerConflicts,
      costLedgerEntries,
      financialLedgerEntries,
    ] = await Promise.all([
      client.query<WarehouseAuditRow>(`
        SELECT "id", "code", "name"
        FROM "warehouses"
        WHERE "code" = 'AMZN'
        ORDER BY "name" ASC, "id" ASC
      `),
      client.query<PurchaseOrderAuditRow>(`
        SELECT "id", "po_number" AS "poNumber", "warehouse_code" AS "warehouseCode"
        FROM "purchase_orders"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<FulfillmentOrderAuditRow>(`
        SELECT "id", "fo_number" AS "foNumber", "warehouse_code" AS "warehouseCode"
        FROM "fulfillment_orders"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<InventoryTransactionAuditRow>(`
        SELECT "id", "reference_id" AS "referenceId", "warehouse_code" AS "warehouseCode"
        FROM "inventory_transactions"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "transaction_date" ASC, "id" ASC
      `),
      client.query<GoodsReceiptAuditRow>(`
        SELECT "id", "reference_number" AS "referenceNumber", "warehouse_code" AS "warehouseCode"
        FROM "goods_receipts"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<WarehouseInvoiceAuditRow>(`
        SELECT "id", "invoice_number" AS "invoiceNumber", "warehouse_code" AS "warehouseCode"
        FROM "warehouse_invoices"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<StorageLedgerAuditRow>(`
        SELECT "id", "storage_ledger_id" AS "storageLedgerId", "warehouse_code" AS "warehouseCode"
        FROM "storage_ledger"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<StorageLedgerConflictRow>(`
        SELECT
          amzn."id" AS "amznId",
          amzn_us."id" AS "amznUsId",
          amzn."sku_code" AS "skuCode",
          amzn."lot_ref" AS "lotRef",
          to_char(amzn."week_ending_date", 'YYYY-MM-DD') AS "weekEndingDate"
        FROM "storage_ledger" amzn
        JOIN "storage_ledger" amzn_us
          ON amzn."sku_code" = amzn_us."sku_code"
         AND amzn."lot_ref" = amzn_us."lot_ref"
         AND amzn."week_ending_date" = amzn_us."week_ending_date"
        WHERE amzn."warehouse_code" = 'AMZN'
          AND amzn_us."warehouse_code" = 'AMZN-US'
        ORDER BY amzn."week_ending_date" ASC, amzn."sku_code" ASC, amzn."id" ASC
      `),
      client.query<CostLedgerAuditRow>(`
        SELECT "id", "transaction_id" AS "transactionId", "warehouse_code" AS "warehouseCode"
        FROM "cost_ledger"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "created_at" ASC, "id" ASC
      `),
      client.query<FinancialLedgerAuditRow>(`
        SELECT "id", "source_type"::text AS "sourceType", "source_id" AS "sourceId", "warehouse_code" AS "warehouseCode"
        FROM "financial_ledger"
        WHERE "warehouse_code" = 'AMZN'
        ORDER BY "effective_at" ASC, "id" ASC
      `),
    ])

    console.log(`\n[${tenant}] database=${context.database} schema=${context.schema}`)
    console.log(`Mode: ${options.dryRun ? 'dry-run' : 'report-only'}`)
    printSection('warehouses.code', warehouses.rows)
    printSection('purchase_orders.warehouse_code', purchaseOrders.rows)
    printSection('fulfillment_orders.warehouse_code', fulfillmentOrders.rows)
    printSection('inventory_transactions.warehouse_code', inventoryTransactions.rows)
    printSection('goods_receipts.warehouse_code', goodsReceipts.rows)
    printSection('warehouse_invoices.warehouse_code', warehouseInvoices.rows)
    printSection('storage_ledger.warehouse_code', storageLedgerEntries.rows)
    printSection('storage_ledger.rename_conflicts', storageLedgerConflicts.rows)
    printSection('cost_ledger.warehouse_code', costLedgerEntries.rows)
    printSection('financial_ledger.warehouse_code', financialLedgerEntries.rows)
  } finally {
    await client.end()
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
    await reportTenant(tenant, options)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
