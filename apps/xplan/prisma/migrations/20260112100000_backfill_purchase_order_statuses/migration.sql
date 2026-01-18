-- Backfill legacy X-Plan purchase order statuses to Talos-aligned values.

UPDATE "PurchaseOrder"
SET "status" = 'ISSUED'
WHERE "status" = 'PLANNED';

UPDATE "PurchaseOrder"
SET "status" = 'MANUFACTURING'
WHERE "status" = 'PRODUCTION';

UPDATE "PurchaseOrder"
SET "status" = 'OCEAN'
WHERE "status" = 'IN_TRANSIT';

UPDATE "PurchaseOrder"
SET "status" = 'WAREHOUSE'
WHERE "status" = 'ARRIVED';

UPDATE "PurchaseOrder"
SET "status" = 'ARCHIVED'
WHERE "status" = 'CLOSED';

ALTER TABLE "PurchaseOrder"
ALTER COLUMN "status"
SET DEFAULT 'ISSUED';
