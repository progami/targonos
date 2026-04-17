-- Purchase-order workflow cleanup migration scaffold.
--
-- Deterministic work that is safe to execute without review:
--   1) Rename legacy Amazon warehouse code AMZN -> AMZN-US everywhere it is persisted.
--
-- Review-gated work that is intentionally NOT executed here:
--   2) Resolving ambiguous legacy purchase-order statuses SHIPPED / CLOSED / REJECTED.
--   3) Tightening PurchaseOrderStatus and PurchaseOrderDocumentStage enums.
--   4) Dropping outbound shipment / proof-of-delivery columns from purchase_orders.
-- Current Talos code still reads those legacy fields/statuses during db:generate/type-check,
-- so schema compatibility remains in place until the reviewed follow-up cleanup lands.
--
-- Required review gate before destructive cleanup:
--   - Run report-po-legacy-statuses.ts and review every legacy PO.
--   - Apply the approved per-PO status resolution in a reviewed follow-up migration.
--   - Only after that follow-up should enum replacement and column drops run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "warehouses" WHERE "code" = 'AMZN')
    AND EXISTS (SELECT 1 FROM "warehouses" WHERE "code" = 'AMZN-US') THEN
    RAISE EXCEPTION 'Both AMZN and AMZN-US warehouse rows exist. Resolve the duplicate warehouse rows before running this migration.';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "storage_ledger" amzn
    JOIN "storage_ledger" amzn_us
      ON amzn."sku_code" = amzn_us."sku_code"
     AND amzn."lot_ref" = amzn_us."lot_ref"
     AND amzn."week_ending_date" = amzn_us."week_ending_date"
    WHERE amzn."warehouse_code" = 'AMZN'
      AND amzn_us."warehouse_code" = 'AMZN-US'
  ) THEN
    RAISE EXCEPTION 'AMZN -> AMZN-US rename would create storage_ledger unique-key collisions for matching (sku_code, lot_ref, week_ending_date) rows. Resolve duplicates before running this migration.';
  END IF;
END
$$;

-- 1) Deterministic AMZN -> AMZN-US rename work.
UPDATE "warehouses"
SET "code" = 'AMZN-US'
WHERE "code" = 'AMZN';

UPDATE "purchase_orders"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "inventory_transactions"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "fulfillment_orders"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "goods_receipts"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "warehouse_invoices"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "storage_ledger"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "cost_ledger"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

UPDATE "financial_ledger"
SET "warehouse_code" = 'AMZN-US'
WHERE "warehouse_code" = 'AMZN';

/*
Review-gated cleanup scaffold. Do not execute this block until every legacy PO has a reviewed final status.

-- Example reviewed follow-up sequence:
-- UPDATE "purchase_orders"
-- SET "status" = ...
-- WHERE "id" = ...;
--
-- ALTER TYPE "PurchaseOrderStatus" RENAME TO "PurchaseOrderStatus_old";
-- CREATE TYPE "PurchaseOrderStatus" AS ENUM (
--   'ISSUED',
--   'MANUFACTURING',
--   'OCEAN',
--   'WAREHOUSE',
--   'CANCELLED',
--   'ARCHIVED',
--   'RFQ',
--   'AWAITING_PROOF',
--   'REVIEW',
--   'POSTED'
-- );
-- ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;
-- ALTER TABLE "purchase_orders"
-- ALTER COLUMN "status" TYPE "PurchaseOrderStatus"
-- USING ("status"::text::"PurchaseOrderStatus");
-- ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'ISSUED';
-- DROP TYPE "PurchaseOrderStatus_old";
--
-- ALTER TYPE "PurchaseOrderDocumentStage" RENAME TO "PurchaseOrderDocumentStage_old";
-- CREATE TYPE "PurchaseOrderDocumentStage" AS ENUM (
--   'RFQ',
--   'ISSUED',
--   'MANUFACTURING',
--   'OCEAN',
--   'WAREHOUSE'
-- );
-- ALTER TABLE "purchase_order_documents"
-- ALTER COLUMN "stage" TYPE "PurchaseOrderDocumentStage"
-- USING ("stage"::text::"PurchaseOrderDocumentStage");
-- DROP TYPE "PurchaseOrderDocumentStage_old";
--
-- ALTER TABLE "purchase_orders"
--   DROP COLUMN IF EXISTS "ship_to_name",
--   DROP COLUMN IF EXISTS "ship_to_address",
--   DROP COLUMN IF EXISTS "ship_to_city",
--   DROP COLUMN IF EXISTS "ship_to_country",
--   DROP COLUMN IF EXISTS "ship_to_postal_code",
--   DROP COLUMN IF EXISTS "shipping_carrier",
--   DROP COLUMN IF EXISTS "shipping_method",
--   DROP COLUMN IF EXISTS "tracking_number",
--   DROP COLUMN IF EXISTS "shipped_date",
--   DROP COLUMN IF EXISTS "proof_of_delivery_ref",
--   DROP COLUMN IF EXISTS "delivered_date",
--   DROP COLUMN IF EXISTS "proof_of_delivery",
--   DROP COLUMN IF EXISTS "shipped_at",
--   DROP COLUMN IF EXISTS "shipped_by_id",
--   DROP COLUMN IF EXISTS "shipped_by_name",
--   DROP COLUMN IF EXISTS "shipped_approved_at",
--   DROP COLUMN IF EXISTS "shipped_approved_by_id",
--   DROP COLUMN IF EXISTS "shipped_approved_by_name";
*/
