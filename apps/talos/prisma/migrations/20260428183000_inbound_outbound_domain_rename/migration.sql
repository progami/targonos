-- Data-preserving Talos domain rename:
-- inbound replaces purchase-order naming, and outbound replaces local fulfillment-order naming.

CREATE OR REPLACE FUNCTION pg_temp.talos_rename_type(old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regtype(format('%I', old_name)) IS NOT NULL
     AND to_regtype(format('%I', new_name)) IS NULL THEN
    EXECUTE format('ALTER TYPE %I RENAME TO %I', old_name, new_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.talos_rename_table(old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I', old_name)) IS NOT NULL
     AND to_regclass(format('%I', new_name)) IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO %I', old_name, new_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.talos_rename_column(target_table text, old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = target_table
      AND column_name = old_name
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = target_table
      AND column_name = new_name
  ) THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', target_table, old_name, new_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.talos_rename_index(old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I', old_name)) IS NOT NULL
     AND to_regclass(format('%I', new_name)) IS NULL THEN
    EXECUTE format('ALTER INDEX %I RENAME TO %I', old_name, new_name);
  END IF;
END;
$$;

SELECT pg_temp.talos_rename_type('PurchaseOrderType', 'InboundOrderType');
SELECT pg_temp.talos_rename_type('PurchaseOrderStatus', 'InboundOrderStatus');
SELECT pg_temp.talos_rename_type('PurchaseOrderLineStatus', 'InboundOrderLineStatus');
SELECT pg_temp.talos_rename_type('PurchaseOrderDocumentStage', 'InboundOrderDocumentStage');
SELECT pg_temp.talos_rename_type('FulfillmentOrderStatus', 'OutboundOrderStatus');
SELECT pg_temp.talos_rename_type('FulfillmentOrderLineStatus', 'OutboundOrderLineStatus');
SELECT pg_temp.talos_rename_type('FulfillmentDestinationType', 'OutboundDestinationType');
SELECT pg_temp.talos_rename_type('FulfillmentOrderDocumentStage', 'OutboundOrderDocumentStage');

SELECT pg_temp.talos_rename_table('po_product_assignments', 'inbound_product_assignments');
SELECT pg_temp.talos_rename_table('purchase_orders', 'inbound_orders');
SELECT pg_temp.talos_rename_table('purchase_order_proforma_invoices', 'inbound_order_proforma_invoices');
SELECT pg_temp.talos_rename_table('purchase_order_documents', 'inbound_order_documents');
SELECT pg_temp.talos_rename_table('purchase_order_forwarding_costs', 'inbound_order_forwarding_costs');
SELECT pg_temp.talos_rename_table('purchase_order_lines', 'inbound_order_lines');
SELECT pg_temp.talos_rename_table('purchase_order_containers', 'inbound_order_containers');
SELECT pg_temp.talos_rename_table('fulfillment_orders', 'outbound_orders');
SELECT pg_temp.talos_rename_table('fulfillment_order_documents', 'outbound_order_documents');
SELECT pg_temp.talos_rename_table('fulfillment_order_lines', 'outbound_order_lines');

SELECT pg_temp.talos_rename_column('inbound_orders', 'po_number', 'inbound_number');
SELECT pg_temp.talos_rename_column('inbound_orders', 'po_pdf_generated_at', 'inbound_pdf_generated_at');
SELECT pg_temp.talos_rename_column('inbound_orders', 'po_pdf_generated_by_id', 'inbound_pdf_generated_by_id');
SELECT pg_temp.talos_rename_column('inbound_orders', 'po_pdf_generated_by_name', 'inbound_pdf_generated_by_name');
SELECT pg_temp.talos_rename_column('outbound_orders', 'fo_number', 'outbound_number');

SELECT pg_temp.talos_rename_column('inventory_transactions', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('inventory_transactions', 'purchase_order_line_id', 'inbound_order_line_id');
SELECT pg_temp.talos_rename_column('inventory_transactions', 'fulfillment_order_id', 'outbound_order_id');
SELECT pg_temp.talos_rename_column('inventory_transactions', 'fulfillment_order_line_id', 'outbound_order_line_id');

SELECT pg_temp.talos_rename_column('inbound_order_proforma_invoices', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('inbound_order_documents', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('inbound_order_forwarding_costs', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('inbound_order_lines', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('inbound_order_containers', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('outbound_order_documents', 'fulfillment_order_id', 'outbound_order_id');
SELECT pg_temp.talos_rename_column('outbound_order_lines', 'fulfillment_order_id', 'outbound_order_id');

SELECT pg_temp.talos_rename_column('goods_receipts', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('goods_receipt_lines', 'purchase_order_line_id', 'inbound_order_line_id');
SELECT pg_temp.talos_rename_column('warehouse_invoice_lines', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('warehouse_invoice_lines', 'purchase_order_line_id', 'inbound_order_line_id');
SELECT pg_temp.talos_rename_column('financial_ledger', 'purchase_order_id', 'inbound_order_id');
SELECT pg_temp.talos_rename_column('financial_ledger', 'purchase_order_line_id', 'inbound_order_line_id');

SELECT pg_temp.talos_rename_index('idx_inventory_transactions_purchase_order', 'idx_inventory_transactions_inbound_order');
SELECT pg_temp.talos_rename_index('idx_inventory_transactions_purchase_order_line', 'idx_inventory_transactions_inbound_order_line');
SELECT pg_temp.talos_rename_index('idx_inventory_transactions_fulfillment_order', 'idx_inventory_transactions_outbound_order');
SELECT pg_temp.talos_rename_index('idx_inventory_transactions_fulfillment_order_line', 'idx_inventory_transactions_outbound_order_line');

DO $$
DECLARE
  legacy_permission record;
  target_permission_code text;
  target_permission_id uuid;
BEGIN
  FOR legacy_permission IN
    SELECT "id", "code"
    FROM "permissions"
    WHERE "code" LIKE 'po.%'
       OR "code" LIKE 'fo.%'
  LOOP
    target_permission_code := regexp_replace(regexp_replace(legacy_permission."code", '^po\.', 'inbound.'), '^fo\.', 'outbound.');

    SELECT "id"
    INTO target_permission_id
    FROM "permissions"
    WHERE "code" = target_permission_code;

    IF target_permission_id IS NOT NULL THEN
      INSERT INTO "user_permissions" ("id", "user_id", "permission_id", "granted_by_id", "granted_at")
      SELECT
        md5(user_permission."id"::text || ':' || target_permission_id::text)::uuid,
        user_permission."user_id",
        target_permission_id,
        user_permission."granted_by_id",
        user_permission."granted_at"
      FROM "user_permissions" user_permission
      WHERE user_permission."permission_id" = legacy_permission."id"
        AND NOT EXISTS (
          SELECT 1
          FROM "user_permissions" existing_permission
          WHERE existing_permission."user_id" = user_permission."user_id"
            AND existing_permission."permission_id" = target_permission_id
        );

      DELETE FROM "user_permissions"
      WHERE "permission_id" = legacy_permission."id";

      DELETE FROM "permissions"
      WHERE "id" = legacy_permission."id";
    END IF;
  END LOOP;
END;
$$;

UPDATE "permissions"
SET
  "code" = regexp_replace(regexp_replace("code", '^po\.', 'inbound.'), '^fo\.', 'outbound.'),
  "category" = CASE
    WHEN "category" = 'purchase_order' THEN 'inbound_order'
    WHEN "category" = 'fulfillment_order' THEN 'outbound_order'
    ELSE "category"
  END,
  "name" = replace(replace("name", 'Purchase Order', 'Inbound'), 'Fulfillment Order', 'Outbound Order'),
  "description" = CASE
    WHEN "description" IS NULL THEN NULL
    ELSE replace(replace("description", 'purchase order', 'inbound'), 'fulfillment order', 'outbound order')
  END;

DO $$
BEGIN
  IF to_regclass('"public"."global_reference_counters"') IS NOT NULL THEN
    UPDATE "public"."global_reference_counters"
    SET "counter_key" = regexp_replace("counter_key", '^po_sequence', 'inbound_sequence')
    WHERE "counter_key" LIKE 'po_sequence%';
  END IF;
END;
$$;
