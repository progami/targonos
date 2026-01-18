-- Rename PurchaseOrderBatch table and related constraints/indexes to align with Batch Table terminology
ALTER TABLE "PurchaseOrderBatch" RENAME TO "BatchTableRow";

ALTER INDEX "PurchaseOrderBatch_purchaseOrderId_idx" RENAME TO "BatchTableRow_purchaseOrderId_idx";
ALTER INDEX "PurchaseOrderBatch_productId_idx" RENAME TO "BatchTableRow_productId_idx";

ALTER TABLE "BatchTableRow" RENAME CONSTRAINT "PurchaseOrderBatch_pkey" TO "BatchTableRow_pkey";
ALTER TABLE "BatchTableRow" RENAME CONSTRAINT "PurchaseOrderBatch_purchaseOrderId_fkey" TO "BatchTableRow_purchaseOrderId_fkey";
ALTER TABLE "BatchTableRow" RENAME CONSTRAINT "PurchaseOrderBatch_productId_fkey" TO "BatchTableRow_productId_fkey";
