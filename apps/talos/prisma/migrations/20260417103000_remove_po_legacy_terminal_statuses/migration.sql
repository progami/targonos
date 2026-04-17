DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "purchase_orders"
    WHERE "status"::text IN ('SHIPPED', 'CLOSED', 'REJECTED')
  ) THEN
    RAISE EXCEPTION 'Legacy purchase-order terminal statuses still exist. Resolve SHIPPED/CLOSED/REJECTED rows before running this migration.';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "purchase_order_documents"
    WHERE "stage"::text = 'SHIPPED'
  ) THEN
    RAISE EXCEPTION 'Legacy shipped-stage purchase-order documents still exist. Resolve SHIPPED document rows before running this migration.';
  END IF;
END
$$;

ALTER TYPE "PurchaseOrderStatus" RENAME TO "PurchaseOrderStatus_old";

CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'CANCELLED',
  'ARCHIVED',
  'RFQ',
  'AWAITING_PROOF',
  'REVIEW',
  'POSTED'
);

ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "purchase_orders"
ALTER COLUMN "status" TYPE "PurchaseOrderStatus"
USING ("status"::text::"PurchaseOrderStatus");

ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'ISSUED';

DROP TYPE "PurchaseOrderStatus_old";

ALTER TYPE "PurchaseOrderDocumentStage" RENAME TO "PurchaseOrderDocumentStage_old";

CREATE TYPE "PurchaseOrderDocumentStage" AS ENUM (
  'DRAFT',
  'RFQ',
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE'
);

ALTER TABLE "purchase_order_documents"
ALTER COLUMN "stage" TYPE "PurchaseOrderDocumentStage"
USING ("stage"::text::"PurchaseOrderDocumentStage");

DROP TYPE "PurchaseOrderDocumentStage_old";
