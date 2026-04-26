-- Normalize XPLAN purchase order workflow to Talos active PO states.
UPDATE "PurchaseOrder"
SET "status" = 'ISSUED'
WHERE "status" = 'DRAFT';

UPDATE "PurchaseOrder"
SET "status" = 'WAREHOUSE'
WHERE "status" = 'SHIPPED';

UPDATE "PurchaseOrder"
SET "status" = 'CANCELLED'
WHERE "status" IN ('REJECTED', 'ARCHIVED');

ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "PurchaseOrderStatus" RENAME TO "PurchaseOrderStatus_old";
CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'CANCELLED'
);
ALTER TABLE "PurchaseOrder"
ALTER COLUMN "status" TYPE "PurchaseOrderStatus"
USING ("status"::text::"PurchaseOrderStatus");
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" SET DEFAULT 'ISSUED';
DROP TYPE "PurchaseOrderStatus_old";

-- PO timing belongs on PurchaseOrder stage-week fields, not product-level defaults.
DROP TABLE IF EXISTS "LeadTimeOverride";
DROP TABLE IF EXISTS "LeadStageTemplate";
