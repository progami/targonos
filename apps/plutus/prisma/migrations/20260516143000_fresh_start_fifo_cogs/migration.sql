DROP TABLE IF EXISTS "SellerboardCogsExport" CASCADE;
DROP TABLE IF EXISTS "CostLayerConsumption" CASCADE;
DROP TABLE IF EXISTS "CogsPostingBatch" CASCADE;
DROP TABLE IF EXISTS "InventoryMovement" CASCADE;
DROP TABLE IF EXISTS "PoCostLayer" CASCADE;
DROP TABLE IF EXISTS "LandedCostBatch" CASCADE;
DROP TABLE IF EXISTS "QboLandedCostAllocation" CASCADE;
DROP TABLE IF EXISTS "SourceDocument" CASCADE;
DROP TABLE IF EXISTS "PurchaseOrder" CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CostLayerStatus') THEN
    CREATE TYPE "CostLayerStatus" AS ENUM ('NOT_READY', 'READY');
  END IF;
END
$$;

CREATE TABLE "CostLayer" (
  "id" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "qboPurchaseOrderId" TEXT,
  "poNumber" TEXT NOT NULL,
  "qboPurchaseOrderLineId" TEXT,
  "sku" TEXT NOT NULL,
  "qboItemId" TEXT,
  "qtyReceived" INTEGER NOT NULL,
  "qtyRemaining" INTEGER NOT NULL,
  "landedTotalCents" INTEGER NOT NULL,
  "unitCost" DECIMAL(18,6) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "CostLayerStatus" NOT NULL DEFAULT 'NOT_READY',
  "receiptDate" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "openingRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CostLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandedCostAllocation" (
  "id" TEXT NOT NULL,
  "qboBillId" TEXT NOT NULL,
  "qboBillLineId" TEXT NOT NULL,
  "qboPurchaseOrderId" TEXT NOT NULL,
  "qboPurchaseOrderLineId" TEXT,
  "sku" TEXT NOT NULL,
  "costType" TEXT NOT NULL,
  "allocatedAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "allocationPercent" DECIMAL(9,6),
  "sourceNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LandedCostAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementPosting" (
  "id" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "postingType" TEXT NOT NULL,
  "txnDate" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "qboJournalId" TEXT,
  "qboDocNumber" TEXT,
  "sourceHash" TEXT NOT NULL,
  "postingHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementPosting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CogsConsumption" (
  "id" TEXT NOT NULL,
  "settlementPostingId" TEXT,
  "settlementId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL,
  "costLayerId" TEXT NOT NULL,
  "qtyConsumed" INTEGER NOT NULL,
  "unitCost" DECIMAL(18,6) NOT NULL,
  "cogsAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "qboJournalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CogsConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostLayer_marketplace_poNumber_sku_qboPurchaseOrderLineId_key" ON "CostLayer"("marketplace", "poNumber", "sku", "qboPurchaseOrderLineId");
CREATE INDEX "CostLayer_marketplace_idx" ON "CostLayer"("marketplace");
CREATE INDEX "CostLayer_poNumber_idx" ON "CostLayer"("poNumber");
CREATE INDEX "CostLayer_qboPurchaseOrderId_idx" ON "CostLayer"("qboPurchaseOrderId");
CREATE INDEX "CostLayer_qboPurchaseOrderLineId_idx" ON "CostLayer"("qboPurchaseOrderLineId");
CREATE INDEX "CostLayer_qboItemId_idx" ON "CostLayer"("qboItemId");
CREATE INDEX "CostLayer_sku_idx" ON "CostLayer"("sku");
CREATE INDEX "CostLayer_status_idx" ON "CostLayer"("status");

CREATE UNIQUE INDEX "LandedCostAllocation_qboBillId_qboBillLineId_qboPurchaseOrderId_qboPurchaseOrderLineId_sku_costType_key" ON "LandedCostAllocation"("qboBillId", "qboBillLineId", "qboPurchaseOrderId", "qboPurchaseOrderLineId", "sku", "costType");
CREATE INDEX "LandedCostAllocation_qboBillId_idx" ON "LandedCostAllocation"("qboBillId");
CREATE INDEX "LandedCostAllocation_qboPurchaseOrderId_idx" ON "LandedCostAllocation"("qboPurchaseOrderId");
CREATE INDEX "LandedCostAllocation_qboPurchaseOrderLineId_idx" ON "LandedCostAllocation"("qboPurchaseOrderLineId");
CREATE INDEX "LandedCostAllocation_sku_idx" ON "LandedCostAllocation"("sku");
CREATE INDEX "LandedCostAllocation_costType_idx" ON "LandedCostAllocation"("costType");

CREATE UNIQUE INDEX "SettlementPosting_marketplace_settlementId_postingType_key" ON "SettlementPosting"("marketplace", "settlementId", "postingType");
CREATE INDEX "SettlementPosting_settlementId_idx" ON "SettlementPosting"("settlementId");
CREATE INDEX "SettlementPosting_postingType_idx" ON "SettlementPosting"("postingType");
CREATE INDEX "SettlementPosting_qboJournalId_idx" ON "SettlementPosting"("qboJournalId");

CREATE UNIQUE INDEX "CogsConsumption_settlementId_sku_poNumber_costLayerId_key" ON "CogsConsumption"("settlementId", "sku", "poNumber", "costLayerId");
CREATE INDEX "CogsConsumption_settlementId_idx" ON "CogsConsumption"("settlementId");
CREATE INDEX "CogsConsumption_marketplace_idx" ON "CogsConsumption"("marketplace");
CREATE INDEX "CogsConsumption_sku_idx" ON "CogsConsumption"("sku");
CREATE INDEX "CogsConsumption_poNumber_idx" ON "CogsConsumption"("poNumber");
CREATE INDEX "CogsConsumption_costLayerId_idx" ON "CogsConsumption"("costLayerId");
CREATE INDEX "CogsConsumption_qboJournalId_idx" ON "CogsConsumption"("qboJournalId");

ALTER TABLE "CogsConsumption" ADD CONSTRAINT "CogsConsumption_settlementPostingId_fkey" FOREIGN KEY ("settlementPostingId") REFERENCES "SettlementPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CogsConsumption" ADD CONSTRAINT "CogsConsumption_costLayerId_fkey" FOREIGN KEY ("costLayerId") REFERENCES "CostLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
