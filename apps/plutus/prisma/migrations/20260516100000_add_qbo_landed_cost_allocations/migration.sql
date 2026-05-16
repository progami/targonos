ALTER TABLE "SourceDocument"
  ADD COLUMN "qboPurchaseOrderId" TEXT,
  ADD COLUMN "qboPurchaseOrderLineId" TEXT;

CREATE TABLE "QboLandedCostAllocation" (
    "id" TEXT NOT NULL,
    "qboBillId" TEXT NOT NULL,
    "qboBillLineId" TEXT NOT NULL,
    "qboPurchaseOrderId" TEXT NOT NULL,
    "qboPurchaseOrderLineId" TEXT NOT NULL,
    "qboPurchaseOrderDocNumber" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER,
    "allocationMethod" TEXT NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboLandedCostAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceDocument_qboPurchaseOrderId_idx" ON "SourceDocument"("qboPurchaseOrderId");
CREATE INDEX "SourceDocument_qboPurchaseOrderLineId_idx" ON "SourceDocument"("qboPurchaseOrderLineId");
CREATE UNIQUE INDEX "QboLandedCostAllocation_qboBillId_qboBillLineId_qboPurchaseOrderId_qboPurchaseOrderLineId_sellerSku_component_key" ON "QboLandedCostAllocation"("qboBillId", "qboBillLineId", "qboPurchaseOrderId", "qboPurchaseOrderLineId", "sellerSku", "component");
CREATE INDEX "QboLandedCostAllocation_qboPurchaseOrderId_idx" ON "QboLandedCostAllocation"("qboPurchaseOrderId");
CREATE INDEX "QboLandedCostAllocation_qboPurchaseOrderLineId_idx" ON "QboLandedCostAllocation"("qboPurchaseOrderLineId");
CREATE INDEX "QboLandedCostAllocation_sellerSku_idx" ON "QboLandedCostAllocation"("sellerSku");
CREATE INDEX "QboLandedCostAllocation_component_idx" ON "QboLandedCostAllocation"("component");
