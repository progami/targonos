-- Remove RFQ stage from the PO workflow.
--
-- Notes:
-- - We keep the RFQ enum values in Postgres for backward compatibility.
-- - Existing rows/documents are migrated to ISSUED so the app never surfaces RFQ.

-- 1) Migrate legacy RFQ purchase orders to ISSUED.
UPDATE "purchase_orders"
SET "status" = 'ISSUED'
WHERE "status"::text = 'RFQ';

-- 2) Ensure PO number exists for issued-like orders.
UPDATE "purchase_orders"
SET "po_number" = "order_number"
WHERE ("po_number" IS NULL OR btrim("po_number") = '')
  AND ("order_number" IS NOT NULL AND btrim("order_number") <> '')
  AND "is_legacy" = false
  AND "status"::text IN (
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'SHIPPED',
    'REJECTED',
    'CANCELLED'
  );

-- 3) Backfill issue metadata (rfq_approved_*) so ERD issue_date is populated.
UPDATE "purchase_orders"
SET
  "rfq_approved_at" = COALESCE("rfq_approved_at", "created_at"),
  "rfq_approved_by_id" = COALESCE("rfq_approved_by_id", "created_by"),
  "rfq_approved_by_name" = COALESCE("rfq_approved_by_name", "created_by_name")
WHERE "is_legacy" = false
  AND "status"::text IN (
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'SHIPPED',
    'REJECTED',
    'CANCELLED'
  )
  AND (
    "rfq_approved_at" IS NULL
    OR "rfq_approved_by_id" IS NULL
    OR "rfq_approved_by_name" IS NULL
  );

-- 4) Migrate legacy RFQ documents to ISSUED stage.
-- If an RFQ-stage document has the same document_type as an existing ISSUED-stage
-- document for the same PO, rename the RFQ document_type before moving stages to
-- avoid violating the (purchase_order_id, stage, document_type) unique constraint.
UPDATE "purchase_order_documents" d
SET "document_type" = CONCAT('legacy_rfq__', d."document_type")
WHERE d."stage"::text = 'RFQ'
  AND EXISTS (
    SELECT 1
    FROM "purchase_order_documents" d2
    WHERE d2."purchase_order_id" = d."purchase_order_id"
      AND d2."stage"::text = 'ISSUED'
      AND d2."document_type" = d."document_type"
  );

UPDATE "purchase_order_documents"
SET "stage" = 'ISSUED'
WHERE "stage"::text = 'RFQ';

-- 5) Default all new purchase orders to ISSUED.
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'ISSUED';

-- 6) Update ERD v10 views to remove RFQ entity and RFQ references.
DROP VIEW IF EXISTS "rfq";

CREATE OR REPLACE VIEW "purchase_order" AS
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
  COALESCE(po."rfq_approved_at", po."created_at")::date AS "issue_date",
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
WHERE po."is_legacy" = false;

CREATE OR REPLACE VIEW "lot" AS
SELECT
  pol."id" AS "lot_id",
  s."id" AS "sku_id",
  pol."purchase_order_id" AS "po_id",
  pol."lot_ref" AS "lot_ref",
  pol."units_ordered" AS "qty_units",
  pol."units_per_carton",
  pol."quantity" AS "cartons",
  pol."unit_cost",
  pol."pi_number" AS "pi_ref",
  pol."carton_side1_cm",
  pol."carton_side2_cm",
  pol."carton_side3_cm",
  pol."carton_weight_kg",
  pol."production_date"::date AS "production_date",
  pol."status"::text AS "status",
  pol."created_at" AS "created_at"
FROM "purchase_order_lines" pol
LEFT JOIN "skus" s
  ON s."sku_code" = pol."sku_code";
