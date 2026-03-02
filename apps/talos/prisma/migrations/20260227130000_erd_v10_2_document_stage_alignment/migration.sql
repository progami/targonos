-- Align ERD v10.1 compatibility views with reshuffled PO document stages.
-- commercial_invoice docs now live at MANUFACTURING stage.
-- grn/custom_declaration docs now live at OCEAN stage.

CREATE OR REPLACE VIEW "commercial_invoice" AS
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
  WHERE d."stage"::text = 'MANUFACTURING'
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
  docs."ci_doc_url",
  docs."bl_doc_url",
  docs."packing_list_doc_url",
  po."status"::text AS "status"
FROM "purchase_orders" po
LEFT JOIN line_totals lt
  ON lt."purchase_order_id" = po."id"
LEFT JOIN freight_totals ft
  ON ft."purchase_order_id" = po."id"
LEFT JOIN doc_urls docs
  ON docs."purchase_order_id" = po."id"
WHERE po."is_legacy" = false;

CREATE OR REPLACE VIEW "grn" AS
WITH line_totals AS (
  SELECT
    grl."goods_receipt_id",
    SUM(grl."quantity")::integer AS "total_received"
  FROM "goods_receipt_lines" grl
  GROUP BY grl."goods_receipt_id"
),
first_lot AS (
  SELECT DISTINCT ON (grl."goods_receipt_id")
    grl."goods_receipt_id",
    pol."id" AS "lot_id"
  FROM "goods_receipt_lines" grl
  LEFT JOIN "purchase_order_lines" pol
    ON pol."id" = grl."purchase_order_line_id"
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
  WHERE d."stage"::text = 'OCEAN'
  GROUP BY d."purchase_order_id"
)
SELECT
  gr."id" AS "grn_id",
  gr."reference_number" AS "grn_ref",
  gr."purchase_order_id" AS "ci_id",
  fl."lot_id" AS "lot_id",
  gr."warehouse_id" AS "warehouse_id",
  po."receive_type"::text AS "receive_type",
  po."customs_entry_number" AS "import_entry_number",
  po."customs_cleared_date"::date AS "customs_cleared_date",
  gr."received_at"::date AS "received_date",
  po."discrepancy_notes" AS "discrepancy_notes",
  COALESCE(lt."total_received", 0) AS "total_received",
  docs."grn_doc_url",
  docs."customs_clearance_url",
  docs."cube_master_url",
  docs."freight_receipt_url",
  docs."transaction_cert_url",
  gr."status"::text AS "status"
FROM "goods_receipts" gr
LEFT JOIN "purchase_orders" po
  ON po."id" = gr."purchase_order_id"
LEFT JOIN line_totals lt
  ON lt."goods_receipt_id" = gr."id"
LEFT JOIN first_lot fl
  ON fl."goods_receipt_id" = gr."id"
LEFT JOIN doc_urls docs
  ON docs."purchase_order_id" = gr."purchase_order_id";
