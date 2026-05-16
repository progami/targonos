CREATE TABLE "QboInventoryItemMapping" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "normalizedSellerSku" TEXT NOT NULL,
    "qboItemId" TEXT NOT NULL,
    "qboItemName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboInventoryItemMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QboInventoryMovementPosting" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "settlementDocNumber" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "qboItemId" TEXT NOT NULL,
    "qboInventoryAdjustmentId" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "movementDate" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboInventoryMovementPosting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QboInventoryItemMapping_marketplace_sellerSku_key" ON "QboInventoryItemMapping"("marketplace", "sellerSku");
CREATE UNIQUE INDEX "QboInventoryItemMapping_marketplace_normalizedSellerSku_key" ON "QboInventoryItemMapping"("marketplace", "normalizedSellerSku");
CREATE INDEX "QboInventoryItemMapping_marketplace_idx" ON "QboInventoryItemMapping"("marketplace");
CREATE INDEX "QboInventoryItemMapping_qboItemId_idx" ON "QboInventoryItemMapping"("qboItemId");
CREATE INDEX "QboInventoryItemMapping_active_idx" ON "QboInventoryItemMapping"("active");

CREATE UNIQUE INDEX "QboInventoryMovementPosting_marketplace_settlementDocNumber_sellerSku_key" ON "QboInventoryMovementPosting"("marketplace", "settlementDocNumber", "sellerSku");
CREATE INDEX "QboInventoryMovementPosting_marketplace_idx" ON "QboInventoryMovementPosting"("marketplace");
CREATE INDEX "QboInventoryMovementPosting_settlementDocNumber_idx" ON "QboInventoryMovementPosting"("settlementDocNumber");
CREATE INDEX "QboInventoryMovementPosting_qboInventoryAdjustmentId_idx" ON "QboInventoryMovementPosting"("qboInventoryAdjustmentId");
CREATE INDEX "QboInventoryMovementPosting_qboItemId_idx" ON "QboInventoryMovementPosting"("qboItemId");
CREATE INDEX "QboInventoryMovementPosting_status_idx" ON "QboInventoryMovementPosting"("status");
