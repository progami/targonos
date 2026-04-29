ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceSystem" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);

ALTER TABLE "BatchTableRow" ADD COLUMN "sourceSystem" TEXT;
ALTER TABLE "BatchTableRow" ADD COLUMN "sourceLineId" TEXT;
ALTER TABLE "BatchTableRow" ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PurchaseOrder_strategyId_sourceSystem_sourceId_key" ON "PurchaseOrder"("strategyId", "sourceSystem", "sourceId");
CREATE INDEX "PurchaseOrder_sourceSystem_sourceId_idx" ON "PurchaseOrder"("sourceSystem", "sourceId");
CREATE INDEX "BatchTableRow_sourceSystem_sourceLineId_idx" ON "BatchTableRow"("sourceSystem", "sourceLineId");
