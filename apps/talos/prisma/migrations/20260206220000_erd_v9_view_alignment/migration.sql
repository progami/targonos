-- ERD v9 alignment updates for Talos purchase-order flow.
-- Keeps the operational schema intact while ensuring ERD views match the latest ERD v9 spec.

CREATE OR REPLACE VIEW "sku" AS
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
FROM "skus" s;

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
WHERE po."is_legacy" = false;

CREATE OR REPLACE VIEW "po_ci" AS
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
GROUP BY pol."purchase_order_id", s."id";

CREATE OR REPLACE VIEW "grn" AS
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
FROM "goods_receipt";

