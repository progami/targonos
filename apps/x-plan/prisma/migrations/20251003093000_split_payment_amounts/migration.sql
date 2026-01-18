ALTER TABLE "xplan"."PurchaseOrderPayment"
  ADD COLUMN "amountExpected" DECIMAL(12, 2),
  ADD COLUMN "amountPaid" DECIMAL(12, 2);

UPDATE "xplan"."PurchaseOrderPayment"
SET "amountExpected" = "amount"
WHERE "amountExpected" IS NULL;

ALTER TABLE "xplan"."PurchaseOrderPayment"
  DROP COLUMN "amount",
  DROP COLUMN "status";
