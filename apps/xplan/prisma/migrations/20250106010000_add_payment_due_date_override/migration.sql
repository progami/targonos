-- CreateEnum
CREATE TYPE "PaymentDueDateSource" AS ENUM ('SYSTEM', 'USER');

-- AlterTable
ALTER TABLE "xplan"."PurchaseOrderPayment"
  ADD COLUMN "dueDateDefault" TIMESTAMP(3),
  ADD COLUMN "dueDateSource" "PaymentDueDateSource" NOT NULL DEFAULT 'SYSTEM';

UPDATE "xplan"."PurchaseOrderPayment"
SET "dueDateDefault" = "dueDate", "dueDateSource" = 'SYSTEM'
WHERE "dueDateDefault" IS NULL;
