#!/usr/bin/env tsx

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
      throw new Error(`Invalid --tenant value: ${value ?? ''} (expected US, UK, or ALL)`)
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Ensure ERD v9 Views

Creates ERD v9 compatibility views in the tenant schema.

Usage:
  pnpm --filter @targon/talos tsx scripts/migrations/ensure-erd-v9-views.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print actions without applying changes
  --help, -h               Show this help
`)
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma = await getTenantPrismaClient(tenant)

  const statements = [
    `DROP VIEW IF EXISTS "discrepancy"`,
    `DROP VIEW IF EXISTS "grn_line_item"`,
    `DROP VIEW IF EXISTS "grn"`,
    `DROP VIEW IF EXISTS "goods_receipt"`,
    `DROP VIEW IF EXISTS "ci_allocation"`,
    `DROP VIEW IF EXISTS "po_ci"`,
    `DROP VIEW IF EXISTS "commercial_invoice"`,
    `DROP VIEW IF EXISTS "lot"`,
    `DROP VIEW IF EXISTS "purchase_order"`,
    `DROP VIEW IF EXISTS "warehouse"`,
    `DROP VIEW IF EXISTS "supplier"`,
    `DROP VIEW IF EXISTS "sku"`,
    `CREATE OR REPLACE VIEW "sku" AS
    SELECT
      s."id" AS "sku_id",
      s."sku_code",
      s."sku_group",
      s."asin",
      s."description",
      s."is_active",
      s."default_supplier_id",
      s."secondary_supplier_id",
      CASE
        WHEN s."carton_side1_cm" IS NULL THEN NULL
        ELSE ROUND((s."carton_side1_cm" / 2.54)::numeric, 4)
      END AS "ref_pkg_length_in",
      CASE
        WHEN s."carton_side2_cm" IS NULL THEN NULL
        ELSE ROUND((s."carton_side2_cm" / 2.54)::numeric, 4)
      END AS "ref_pkg_width_in",
      CASE
        WHEN s."carton_side3_cm" IS NULL THEN NULL
        ELSE ROUND((s."carton_side3_cm" / 2.54)::numeric, 4)
      END AS "ref_pkg_height_in",
      CASE
        WHEN s."carton_weight_kg" IS NULL THEN NULL
        ELSE ROUND((s."carton_weight_kg" * 2.2046226218)::numeric, 4)
      END AS "ref_pkg_weight_lb",
      CASE
        WHEN s."item_side1_cm" IS NULL THEN NULL
        ELSE ROUND((s."item_side1_cm" / 2.54)::numeric, 4)
      END AS "ref_item_length_in",
      CASE
        WHEN s."item_side2_cm" IS NULL THEN NULL
        ELSE ROUND((s."item_side2_cm" / 2.54)::numeric, 4)
      END AS "ref_item_width_in",
      CASE
        WHEN s."item_side3_cm" IS NULL THEN NULL
        ELSE ROUND((s."item_side3_cm" / 2.54)::numeric, 4)
      END AS "ref_item_height_in",
      CASE
        WHEN s."item_weight_kg" IS NULL THEN NULL
        ELSE ROUND((s."item_weight_kg" * 2.2046226218)::numeric, 4)
      END AS "ref_item_weight_lb",
      CASE
        WHEN s."amazon_item_package_side1_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_package_side1_cm" / 2.54)::numeric, 4)
      END AS "amz_pkg_length_in",
      CASE
        WHEN s."amazon_item_package_side2_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_package_side2_cm" / 2.54)::numeric, 4)
      END AS "amz_pkg_width_in",
      CASE
        WHEN s."amazon_item_package_side3_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_package_side3_cm" / 2.54)::numeric, 4)
      END AS "amz_pkg_height_in",
      CASE
        WHEN s."amazon_reference_weight_kg" IS NULL THEN NULL
        ELSE ROUND((s."amazon_reference_weight_kg" * 2.2046226218)::numeric, 4)
      END AS "amz_pkg_weight_lb",
      CASE
        WHEN s."amazon_item_side1_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_side1_cm" / 2.54)::numeric, 4)
      END AS "amz_item_length_in",
      CASE
        WHEN s."amazon_item_side2_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_side2_cm" / 2.54)::numeric, 4)
      END AS "amz_item_width_in",
      CASE
        WHEN s."amazon_item_side3_cm" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_side3_cm" / 2.54)::numeric, 4)
      END AS "amz_item_height_in",
      CASE
        WHEN s."amazon_item_weight_kg" IS NULL THEN NULL
        ELSE ROUND((s."amazon_item_weight_kg" * 2.2046226218)::numeric, 4)
      END AS "amz_item_weight_lb",
      s."category",
      s."subcategory",
      s."size_tier",
      s."referral_fee_percent" AS "referral_fee_pct",
      s."fba_fulfillment_fee"
    FROM "skus" s`,
    `CREATE OR REPLACE VIEW "supplier" AS
    SELECT
      s."id" AS "supplier_id",
      s."name",
      s."contact_name",
      s."email",
      s."phone",
      s."address",
      s."banking_details" AS "banking_info",
      s."notes",
      s."default_payment_terms",
      s."default_incoterms"
    FROM "suppliers" s`,
    `CREATE OR REPLACE VIEW "warehouse" AS
    SELECT
      w."id" AS "warehouse_id",
      w."code",
      w."name",
      w."kind"::text AS "type",
      w."address",
      w."contact_phone" AS "phone"
    FROM "warehouses" w`,
    `CREATE OR REPLACE VIEW "purchase_order" AS
    WITH line_totals AS (
      SELECT
        pol."purchase_order_id",
        SUM(pol."units_ordered")::integer AS "total_units",
        SUM(pol."quantity")::integer AS "total_cartons",
        SUM(COALESCE(pol."total_cost", 0)) AS "product_subtotal"
      FROM "purchase_order_lines" pol
      GROUP BY pol."purchase_order_id"
    ),
    doc_urls AS (
      SELECT
        d."purchase_order_id",
        MAX(CASE WHEN d."document_type" = 'rfq_pdf' THEN d."s3_key" END) AS "rfq_pdf_url",
        MAX(CASE WHEN d."document_type" = 'inventory_summary' THEN d."s3_key" END) AS "inventory_summary_url",
        MAX(CASE WHEN d."document_type" = 'po_pdf' THEN d."s3_key" END) AS "po_pdf_url",
        MAX(CASE WHEN d."document_type" = 'shipping_marks' THEN d."s3_key" END) AS "shipping_marks_url",
        MAX(CASE WHEN d."document_type" LIKE 'pi_%' THEN d."s3_key" END) AS "signed_pi_url",
        MAX(CASE WHEN d."document_type" = 'box_artwork' THEN d."s3_key" END) AS "box_artwork_url",
        MAX(CASE WHEN d."document_type" = 'mfg_shipping_marks' THEN d."s3_key" END) AS "mfg_shipping_marks_url"
      FROM "purchase_order_documents" d
      GROUP BY d."purchase_order_id"
    ),
    ledger_totals AS (
      SELECT
        fl."purchase_order_id",
        SUM(CASE WHEN fl."category"::text = 'Inbound' THEN fl."amount" ELSE 0 END) AS "inbound_cost",
        SUM(CASE WHEN fl."category"::text = 'Storage' THEN fl."amount" ELSE 0 END) AS "storage_cost",
        SUM(
          CASE
            WHEN fl."category"::text = 'SupplierCredit' THEN fl."amount"
            WHEN fl."category"::text = 'SupplierDebit' THEN -fl."amount"
            ELSE 0
          END
        ) AS "supplier_credit_debit"
      FROM "financial_ledger" fl
      WHERE fl."purchase_order_id" IS NOT NULL
      GROUP BY fl."purchase_order_id"
    )
    SELECT
      po."id" AS "po_id",
      CASE
        WHEN po."po_number" IS NOT NULL AND btrim(po."po_number") <> '' THEN po."po_number"
        ELSE po."order_number"
      END AS "po_ref",
      po."sku_group" AS "sku_group",
      s."id" AS "supplier_id",
      po."ship_to_country" AS "destination",
      po."rfq_approved_at"::date AS "issue_date",
      po."status"::text AS "status",
      po."expected_date"::date AS "cargo_ready_date",
      po."incoterms",
      po."payment_terms",
      po."ship_to_address",
      po."created_at",
      po."created_by_name" AS "created_by",
      po."notes",
      COALESCE(lt."total_units", 0) AS "total_units",
      COALESCE(po."total_cartons", lt."total_cartons", 0) AS "total_cartons",
      COALESCE(po."total_pallets", 0) AS "total_pallets",
      CASE
        WHEN po."total_weight_kg" IS NULL THEN NULL
        ELSE ROUND((po."total_weight_kg" * 2.2046226218)::numeric, 4)
      END AS "total_weight_lb",
      po."total_volume_cbm" AS "total_volume_cbm",
      COALESCE(lt."product_subtotal", 0) AS "product_subtotal",
      po."manufacturing_start_date"::date AS "mfg_start_date",
      po."expected_completion_date"::date AS "mfg_expected_completion",
      po."packaging_notes",
      COALESCE(led."inbound_cost", 0) AS "inbound_cost",
      COALESCE(led."storage_cost", 0) AS "storage_cost",
      COALESCE(led."supplier_credit_debit", 0) AS "supplier_credit_debit",
      (
        COALESCE(lt."product_subtotal", 0)
        + COALESCE(led."inbound_cost", 0)
        + COALESCE(led."storage_cost", 0)
        + COALESCE(led."supplier_credit_debit", 0)
      ) AS "landed_total",
      docs."rfq_pdf_url",
      docs."inventory_summary_url",
      docs."po_pdf_url",
      docs."shipping_marks_url",
      docs."signed_pi_url",
      docs."box_artwork_url",
      docs."mfg_shipping_marks_url"
    FROM "purchase_orders" po
    LEFT JOIN "suppliers" s
      ON po."counterparty_name" IS NOT NULL
     AND lower(s."name") = lower(po."counterparty_name")
    LEFT JOIN line_totals lt
      ON lt."purchase_order_id" = po."id"
    LEFT JOIN doc_urls docs
      ON docs."purchase_order_id" = po."id"
    LEFT JOIN ledger_totals led
      ON led."purchase_order_id" = po."id"
    WHERE po."is_legacy" = false`,
    `CREATE OR REPLACE VIEW "lot" AS
    SELECT
      pol."purchase_order_id" AS "po_id",
      s."id" AS "sku_id",
      pol."lot_ref" AS "lot_ref",
      pol."units_ordered" AS "qty_units",
      pol."units_per_carton",
      pol."quantity" AS "cartons",
      pol."unit_cost",
      pol."pi_number" AS "pi_ref",
      pol."production_date"::date AS "production_date",
      pol."status"::text AS "status"
    FROM "purchase_order_lines" pol
    LEFT JOIN "skus" s
      ON s."sku_code" = pol."sku_code"`,
    `CREATE OR REPLACE VIEW "commercial_invoice" AS
    WITH line_totals AS (
      SELECT
        pol."purchase_order_id",
        SUM(pol."units_ordered")::integer AS "total_qty"
      FROM "purchase_order_lines" pol
      GROUP BY pol."purchase_order_id"
    ),
    freight_totals AS (
      SELECT
        pofc."purchase_order_id",
        SUM(pofc."total_cost") AS "freight_cost_usd"
      FROM "purchase_order_forwarding_costs" pofc
      GROUP BY pofc."purchase_order_id"
    ),
    doc_urls AS (
      SELECT
        d."purchase_order_id",
        MAX(CASE WHEN d."document_type" = 'commercial_invoice' THEN d."s3_key" END) AS "ci_doc_url",
        MAX(CASE WHEN d."document_type" = 'bill_of_lading' THEN d."s3_key" END) AS "bl_doc_url",
        MAX(CASE WHEN d."document_type" = 'packing_list' THEN d."s3_key" END) AS "packing_list_doc_url"
      FROM "purchase_order_documents" d
      WHERE d."stage"::text = 'OCEAN'
      GROUP BY d."purchase_order_id"
    )
    SELECT
      po."id" AS "ci_id",
      po."commercial_invoice_number" AS "ci_ref",
      po."house_bill_of_lading" AS "house_bl",
      po."master_bill_of_lading" AS "master_bl",
      po."vessel_name" AS "vessel",
      po."voyage_number" AS "voyage",
      po."port_of_loading",
      po."port_of_discharge",
      po."estimated_departure"::date AS "etd",
      po."estimated_arrival"::date AS "eta",
      COALESCE(lt."total_qty", 0) AS "total_qty",
      po."packing_list_ref",
      COALESCE(ft."freight_cost_usd", 0) AS "freight_cost_usd",
      po."status"::text AS "status",
      docs."ci_doc_url",
      docs."bl_doc_url",
      docs."packing_list_doc_url"
    FROM "purchase_orders" po
    LEFT JOIN line_totals lt
      ON lt."purchase_order_id" = po."id"
    LEFT JOIN freight_totals ft
      ON ft."purchase_order_id" = po."id"
    LEFT JOIN doc_urls docs
      ON docs."purchase_order_id" = po."id"
    WHERE po."is_legacy" = false`,
    `CREATE OR REPLACE VIEW "po_ci" AS
    SELECT
      pol."purchase_order_id" AS "po_id",
      s."id" AS "sku_id",
      pol."purchase_order_id" AS "ci_id",
      SUM(pol."units_ordered")::integer AS "qty_on_shipment"
    FROM "purchase_order_lines" pol
    JOIN "purchase_orders" po
      ON po."id" = pol."purchase_order_id"
    LEFT JOIN "skus" s
      ON s."sku_code" = pol."sku_code"
    WHERE po."is_legacy" = false
    GROUP BY pol."purchase_order_id", s."id"`,
    `CREATE OR REPLACE VIEW "ci_allocation" AS
    SELECT
      po."id" AS "ci_id",
      pol."purchase_order_id" AS "po_id",
      s."id" AS "sku_id",
      w."id" AS "warehouse_id",
      pol."units_ordered" AS "qty_allocated",
      po."created_by_name" AS "allocated_by",
      po."updated_at" AS "allocated_at"
    FROM "purchase_order_lines" pol
    JOIN "purchase_orders" po
      ON po."id" = pol."purchase_order_id"
    LEFT JOIN "skus" s
      ON s."sku_code" = pol."sku_code"
    LEFT JOIN "warehouses" w
      ON w."code" = po."warehouse_code"
    WHERE po."is_legacy" = false`,
    `CREATE OR REPLACE VIEW "goods_receipt" AS
    WITH line_totals AS (
      SELECT
        grl."goods_receipt_id",
        SUM(grl."quantity")::integer AS "total_received"
      FROM "goods_receipt_lines" grl
      GROUP BY grl."goods_receipt_id"
    ),
    first_sku AS (
      SELECT DISTINCT ON (grl."goods_receipt_id")
        grl."goods_receipt_id",
        s."id" AS "sku_id"
      FROM "goods_receipt_lines" grl
      LEFT JOIN "skus" s
        ON s."sku_code" = grl."sku_code"
      ORDER BY grl."goods_receipt_id", grl."created_at", grl."id"
    ),
    doc_urls AS (
      SELECT
        d."purchase_order_id",
        MAX(CASE WHEN d."document_type" = 'grn' THEN d."s3_key" END) AS "grn_doc_url",
        MAX(CASE WHEN d."document_type" = 'custom_declaration' THEN d."s3_key" END) AS "customs_clearance_url",
        MAX(CASE WHEN d."document_type" = 'cube_master' THEN d."s3_key" END) AS "cube_master_url",
        MAX(CASE WHEN d."document_type" = 'freight_receipt' THEN d."s3_key" END) AS "freight_receipt_url",
        MAX(CASE WHEN d."document_type" = 'transaction_certificate' THEN d."s3_key" END) AS "transaction_cert_url"
      FROM "purchase_order_documents" d
      WHERE d."stage"::text = 'WAREHOUSE'
      GROUP BY d."purchase_order_id"
    )
    SELECT
      gr."id" AS "grn_id",
      gr."reference_number" AS "grn_ref",
      gr."purchase_order_id" AS "ci_id",
      gr."purchase_order_id" AS "po_id",
      fs."sku_id",
      gr."warehouse_id",
      po."receive_type"::text AS "receive_type",
      po."customs_entry_number" AS "import_entry_number",
      po."customs_cleared_date"::date AS "customs_cleared_date",
      gr."received_at"::date AS "received_date",
      po."discrepancy_notes" AS "discrepancy_notes",
      COALESCE(lt."total_received", 0) AS "total_received",
      gr."status"::text AS "status",
      docs."grn_doc_url",
      docs."customs_clearance_url",
      docs."cube_master_url",
      docs."freight_receipt_url",
      docs."transaction_cert_url"
    FROM "goods_receipts" gr
    LEFT JOIN "purchase_orders" po
      ON po."id" = gr."purchase_order_id"
    LEFT JOIN line_totals lt
      ON lt."goods_receipt_id" = gr."id"
    LEFT JOIN first_sku fs
      ON fs."goods_receipt_id" = gr."id"
    LEFT JOIN doc_urls docs
      ON docs."purchase_order_id" = gr."purchase_order_id"`,
    `CREATE OR REPLACE VIEW "grn" AS
    SELECT
      "grn_id",
      "grn_ref",
      "ci_id",
      "po_id",
      "sku_id",
      "warehouse_id",
      "receive_type",
      "import_entry_number",
      "customs_cleared_date",
      "received_date",
      "discrepancy_notes",
      "total_received",
      "status",
      "grn_doc_url",
      "customs_clearance_url",
      "cube_master_url",
      "freight_receipt_url",
      "transaction_cert_url"
    FROM "goods_receipt"`,
    `CREATE OR REPLACE VIEW "grn_line_item" AS
    SELECT
      grl."id" AS "line_id",
      grl."goods_receipt_id" AS "grn_id",
      gr."purchase_order_id" AS "po_id",
      s."id" AS "sku_id",
      pol."units_ordered" AS "expected_qty",
      grl."quantity" AS "received_qty",
      CASE
        WHEN grl."variance_quantity" < 0 THEN ABS(grl."variance_quantity")
        ELSE 0
      END AS "damaged_qty",
      grl."variance_quantity" AS "delta",
      CASE
        WHEN grl."variance_quantity" = 0 THEN 'MATCHED'
        ELSE 'DISCREPANCY'
      END AS "status"
    FROM "goods_receipt_lines" grl
    JOIN "goods_receipts" gr
      ON gr."id" = grl."goods_receipt_id"
    LEFT JOIN "purchase_order_lines" pol
      ON pol."id" = grl."purchase_order_line_id"
    LEFT JOIN "skus" s
      ON s."sku_code" = grl."sku_code"`,
    `CREATE OR REPLACE VIEW "discrepancy" AS
    SELECT
      grl."id" AS "disc_id",
      grl."id" AS "line_id",
      CASE
        WHEN grl."variance_quantity" > 0 THEN 'OVERAGE'
        ELSE 'SHORTAGE'
      END AS "type",
      ABS(grl."variance_quantity") AS "qty",
      gr."notes",
      grl."updated_at" AS "logged_at"
    FROM "goods_receipt_lines" grl
    JOIN "goods_receipts" gr
      ON gr."id" = grl."goods_receipt_id"
    WHERE grl."variance_quantity" <> 0`,
  ] as const

  console.log(`\n[${tenant}] Ensuring ERD v9 views exist`)
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
