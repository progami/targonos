#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { formatLegacyPurchaseOrderReviewRow } from '../../src/lib/purchase-orders/legacy-status-review'
import type { TenantCode } from '../../src/lib/tenant/constants'

type OutputFormat = 'json' | 'csv'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  format: OutputFormat
  help?: boolean
}

type TenantConnection = {
  tenant: TenantCode
  connectionString: string
}

type DatabaseContext = {
  tenant: TenantCode
  database: string
  schema: string
}

type RawDatabaseContext = {
  database: string
  schema: string
}

type RawLegacyPurchaseOrderRow = {
  id: string
  poNumber: string | null
  status: string
  postedAt: Date | null
  warehouseCode: string | null
  shipToName: string | null
  shippedDate: Date | null
  receivedDate: Date | null
  deliveredDate: Date | null
  proofOfDeliveryRef: string | null
  hasProofOfDelivery: boolean
  warehouseApprovedAt: Date | null
  shippedApprovedAt: Date | null
  shippedDocumentCount: number
}

type ReportRow = ReturnType<typeof formatLegacyPurchaseOrderReviewRow> & {
  tenant: TenantCode
  database: string
  schema: string
  receivedDate: string | null
  deliveredDate: string | null
  proofOfDeliveryRef: string | null
  hasProofOfDelivery: boolean
  warehouseApprovedAt: string | null
  shippedApprovedAt: string | null
  shippedDocumentCount: number
}

type TenantReport = {
  context: DatabaseContext
  rows: ReportRow[]
}

const LEGACY_PURCHASE_ORDER_STATUSES = ['SHIPPED', 'CLOSED', 'REJECTED'] as const

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    format: 'json',
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (!arg || arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      options.help = true
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
    if (arg.startsWith('--format=')) {
      const value = arg.split('=')[1]?.toLowerCase()
      if (value === 'json' || value === 'csv') {
        options.format = value
        continue
      }
      throw new Error(`Invalid --format value: ${value ?? ''} (expected json or csv)`)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Report legacy purchase-order statuses

Lists purchase orders still in legacy statuses, plus any purchase order that still
has legacy shipped-stage purchase-order documents:
  ${LEGACY_PURCHASE_ORDER_STATUSES.join(', ')}

Usage:
  pnpm --filter @targon/talos exec tsx scripts/migrations/report-po-legacy-statuses.ts [options]

Options:
  --tenant=US|UK|ALL   Which tenant(s) to report (default: ALL)
  --format=json|csv    Output format (default: json)
  --help, -h           Show this help
`)
}

function resolveTenantConnection(tenant: TenantCode): TenantConnection {
  const envKey = `DATABASE_URL_${tenant}`
  const value = process.env[envKey]
  if (!value) {
    throw new Error(`Missing required ${envKey} environment variable for ${tenant} audit report.`)
  }

  const url = new URL(value)
  url.searchParams.set('application_name', `talos-report-po-legacy-statuses-${tenant.toLowerCase()}`)

  const schema = url.searchParams.get('schema')
  if (schema !== null && !url.searchParams.has('options')) {
    url.searchParams.set('options', `-csearch_path=${schema},public`)
  }

  return {
    tenant,
    connectionString: url.toString(),
  }
}

function formatDateOnly(value: Date | null): string | null {
  if (value === null) {
    return null
  }

  return value.toISOString().slice(0, 10)
}

function formatDateTime(value: Date | null): string | null {
  if (value === null) {
    return null
  }

  return value.toISOString()
}

async function getDatabaseContext(client: Client): Promise<RawDatabaseContext> {
  const result = await client.query<RawDatabaseContext>(
    'SELECT current_database() AS database, current_schema() AS schema'
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error('Unable to resolve database/schema context for legacy status report.')
  }

  return row
}

async function fetchTenantRows(tenant: TenantCode): Promise<TenantReport> {
  const connection = resolveTenantConnection(tenant)
  const client = new Client({ connectionString: connection.connectionString })

  try {
    await client.connect()
    const rawContext = await getDatabaseContext(client)
    const context: DatabaseContext = {
      tenant,
      database: rawContext.database,
      schema: rawContext.schema,
    }

    const result = await client.query<RawLegacyPurchaseOrderRow>(`
      WITH shipped_documents AS (
        SELECT
          "purchase_order_id",
          COUNT(*)::integer AS "shippedDocumentCount"
        FROM "purchase_order_documents"
        WHERE "stage"::text = 'SHIPPED'
        GROUP BY "purchase_order_id"
      )
      SELECT
        po."id",
        po."po_number" AS "poNumber",
        po."status"::text AS "status",
        po."posted_at" AS "postedAt",
        po."warehouse_code" AS "warehouseCode",
        po."ship_to_name" AS "shipToName",
        po."shipped_date" AS "shippedDate",
        po."received_date" AS "receivedDate",
        po."delivered_date" AS "deliveredDate",
        po."proof_of_delivery_ref" AS "proofOfDeliveryRef",
        CASE
          WHEN po."proof_of_delivery" IS NULL THEN false
          WHEN btrim(po."proof_of_delivery") = '' THEN false
          ELSE true
        END AS "hasProofOfDelivery",
        po."warehouse_approved_at" AS "warehouseApprovedAt",
        po."shipped_approved_at" AS "shippedApprovedAt",
        COALESCE(sd."shippedDocumentCount", 0) AS "shippedDocumentCount"
      FROM "purchase_orders" po
      LEFT JOIN shipped_documents sd
        ON sd."purchase_order_id" = po."id"
      WHERE po."status"::text IN ('SHIPPED', 'CLOSED', 'REJECTED')
        OR COALESCE(sd."shippedDocumentCount", 0) > 0
      ORDER BY po."created_at" ASC, po."id" ASC
    `)

    return {
      context,
      rows: result.rows.map(row => ({
        tenant,
        database: context.database,
        schema: context.schema,
        ...formatLegacyPurchaseOrderReviewRow(row),
        receivedDate: formatDateOnly(row.receivedDate),
        deliveredDate: formatDateOnly(row.deliveredDate),
        proofOfDeliveryRef: row.proofOfDeliveryRef,
        hasProofOfDelivery: row.hasProofOfDelivery,
        warehouseApprovedAt: formatDateTime(row.warehouseApprovedAt),
        shippedApprovedAt: formatDateTime(row.shippedApprovedAt),
        shippedDocumentCount: row.shippedDocumentCount,
      })),
    }
  } finally {
    await client.end()
  }
}

function escapeCsv(value: string | number | boolean | null): string {
  if (value === null) {
    return ''
  }

  const text = String(value)
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
    return text
  }

  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(reports: TenantReport[], rows: ReportRow[]): string {
  const header = [
    'rowType',
    'tenant',
    'database',
    'schema',
    'id',
    'poNumber',
    'currentStatus',
    'posted',
    'warehouseCode',
    'shipToName',
    'shippedDate',
    'receivedDate',
    'deliveredDate',
    'proofOfDeliveryRef',
    'hasProofOfDelivery',
    'warehouseApprovedAt',
    'shippedApprovedAt',
    'shippedDocumentCount',
  ]

  const lines = rows.map(row =>
    [
      escapeCsv('review'),
      escapeCsv(row.tenant),
      escapeCsv(row.database),
      escapeCsv(row.schema),
      escapeCsv(row.id),
      escapeCsv(row.poNumber),
      escapeCsv(row.currentStatus),
      escapeCsv(row.posted),
      escapeCsv(row.warehouseCode),
      escapeCsv(row.shipToName),
      escapeCsv(row.shippedDate),
      escapeCsv(row.receivedDate),
      escapeCsv(row.deliveredDate),
      escapeCsv(row.proofOfDeliveryRef),
      escapeCsv(row.hasProofOfDelivery),
      escapeCsv(row.warehouseApprovedAt),
      escapeCsv(row.shippedApprovedAt),
      escapeCsv(row.shippedDocumentCount),
    ].join(',')
  )

  for (const report of reports) {
    if (report.rows.length > 0) {
      continue
    }

    lines.push(
      [
        escapeCsv('context'),
        escapeCsv(report.context.tenant),
        escapeCsv(report.context.database),
        escapeCsv(report.context.schema),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(',')
    )
  }

  return [header.join(','), ...lines].join('\n')
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  const reports = await Promise.all(options.tenants.map(fetchTenantRows))
  const rows = reports.flatMap(report => report.rows)

  if (options.format === 'csv') {
    console.log(toCsv(reports, rows))
    return
  }

  console.log(
    JSON.stringify(
      {
        contexts: reports.map(report => report.context),
        rows,
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
