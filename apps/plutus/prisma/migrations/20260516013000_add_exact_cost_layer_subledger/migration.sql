-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalProduct" (
    "id" TEXT NOT NULL,
    "productGroupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuAlias" (
    "id" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedSellerSku" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "internalRef" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "supplierRef" TEXT,
    "marketplace" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "landedCostBatchId" TEXT,
    "qboTxnType" TEXT NOT NULL,
    "qboTxnId" TEXT NOT NULL,
    "qboLineId" TEXT,
    "docNumber" TEXT,
    "vendorName" TEXT,
    "txnDate" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "attachmentStatus" TEXT NOT NULL DEFAULT 'missing',
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostBatch" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "batchRef" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandedCostBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoCostLayer" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "landedCostBatchId" TEXT,
    "canonicalProductId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "allocationMethod" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3),
    "sourceQboTxnType" TEXT,
    "sourceQboTxnId" TEXT,
    "sourceQboLineId" TEXT,
    "sourceDocumentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoCostLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "settlementDocNumber" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CogsPostingBatch" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "settlementDocNumber" TEXT NOT NULL,
    "txnDate" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "qboJournalEntryId" TEXT,
    "qboDocNumber" TEXT,
    "sourceHash" TEXT NOT NULL,
    "postingHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CogsPostingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostLayerConsumption" (
    "id" TEXT NOT NULL,
    "cogsPostingBatchId" TEXT NOT NULL,
    "poCostLayerId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "settlementDocNumber" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "componentAmounts" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostLayerConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerboardCogsExport" (
    "id" TEXT NOT NULL,
    "cogsPostingBatchId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "settlementDocNumber" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "internalPo" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerboardCogsExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlutusException" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'blocking',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlutusException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_code_key" ON "ProductGroup"("code");
CREATE INDEX "ProductGroup_active_idx" ON "ProductGroup"("active");
CREATE UNIQUE INDEX "CanonicalProduct_code_key" ON "CanonicalProduct"("code");
CREATE INDEX "CanonicalProduct_productGroupId_idx" ON "CanonicalProduct"("productGroupId");
CREATE INDEX "CanonicalProduct_active_idx" ON "CanonicalProduct"("active");
CREATE UNIQUE INDEX "SkuAlias_marketplace_normalizedSellerSku_key" ON "SkuAlias"("marketplace", "normalizedSellerSku");
CREATE UNIQUE INDEX "SkuAlias_marketplace_aliasType_value_key" ON "SkuAlias"("marketplace", "aliasType", "value");
CREATE INDEX "SkuAlias_canonicalProductId_idx" ON "SkuAlias"("canonicalProductId");
CREATE INDEX "SkuAlias_marketplace_idx" ON "SkuAlias"("marketplace");
CREATE INDEX "SkuAlias_active_idx" ON "SkuAlias"("active");
CREATE UNIQUE INDEX "PurchaseOrder_sourceType_sourceId_key" ON "PurchaseOrder"("sourceType", "sourceId");
CREATE INDEX "PurchaseOrder_internalRef_idx" ON "PurchaseOrder"("internalRef");
CREATE INDEX "PurchaseOrder_marketplace_idx" ON "PurchaseOrder"("marketplace");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE UNIQUE INDEX "SourceDocument_qboTxnType_qboTxnId_qboLineId_key" ON "SourceDocument"("qboTxnType", "qboTxnId", "qboLineId");
CREATE INDEX "SourceDocument_purchaseOrderId_idx" ON "SourceDocument"("purchaseOrderId");
CREATE INDEX "SourceDocument_landedCostBatchId_idx" ON "SourceDocument"("landedCostBatchId");
CREATE INDEX "SourceDocument_qboTxnType_qboTxnId_idx" ON "SourceDocument"("qboTxnType", "qboTxnId");
CREATE INDEX "SourceDocument_attachmentStatus_idx" ON "SourceDocument"("attachmentStatus");
CREATE UNIQUE INDEX "LandedCostBatch_purchaseOrderId_batchRef_key" ON "LandedCostBatch"("purchaseOrderId", "batchRef");
CREATE INDEX "LandedCostBatch_marketplace_idx" ON "LandedCostBatch"("marketplace");
CREATE INDEX "LandedCostBatch_status_idx" ON "LandedCostBatch"("status");
CREATE INDEX "LandedCostBatch_lockedAt_idx" ON "LandedCostBatch"("lockedAt");
CREATE UNIQUE INDEX "PoCostLayer_purchaseOrderId_canonicalProductId_component_key" ON "PoCostLayer"("purchaseOrderId", "canonicalProductId", "component");
CREATE INDEX "PoCostLayer_marketplace_idx" ON "PoCostLayer"("marketplace");
CREATE INDEX "PoCostLayer_sellerSku_idx" ON "PoCostLayer"("sellerSku");
CREATE INDEX "PoCostLayer_canonicalProductId_idx" ON "PoCostLayer"("canonicalProductId");
CREATE INDEX "PoCostLayer_component_idx" ON "PoCostLayer"("component");
CREATE INDEX "PoCostLayer_sourceQboTxnType_sourceQboTxnId_idx" ON "PoCostLayer"("sourceQboTxnType", "sourceQboTxnId");
CREATE UNIQUE INDEX "InventoryMovement_sourceType_sourceId_sourceLineId_key" ON "InventoryMovement"("sourceType", "sourceId", "sourceLineId");
CREATE INDEX "InventoryMovement_canonicalProductId_idx" ON "InventoryMovement"("canonicalProductId");
CREATE INDEX "InventoryMovement_marketplace_idx" ON "InventoryMovement"("marketplace");
CREATE INDEX "InventoryMovement_sellerSku_idx" ON "InventoryMovement"("sellerSku");
CREATE INDEX "InventoryMovement_movementType_idx" ON "InventoryMovement"("movementType");
CREATE INDEX "InventoryMovement_movementDate_idx" ON "InventoryMovement"("movementDate");
CREATE INDEX "InventoryMovement_settlementDocNumber_idx" ON "InventoryMovement"("settlementDocNumber");
CREATE UNIQUE INDEX "CogsPostingBatch_marketplace_settlementDocNumber_key" ON "CogsPostingBatch"("marketplace", "settlementDocNumber");
CREATE INDEX "CogsPostingBatch_settlementDocNumber_idx" ON "CogsPostingBatch"("settlementDocNumber");
CREATE INDEX "CogsPostingBatch_status_idx" ON "CogsPostingBatch"("status");
CREATE INDEX "CogsPostingBatch_qboJournalEntryId_idx" ON "CogsPostingBatch"("qboJournalEntryId");
CREATE UNIQUE INDEX "CostLayerConsumption_cogsPostingBatchId_poCostLayerId_sellerSku_key" ON "CostLayerConsumption"("cogsPostingBatchId", "poCostLayerId", "sellerSku");
CREATE INDEX "CostLayerConsumption_poCostLayerId_idx" ON "CostLayerConsumption"("poCostLayerId");
CREATE INDEX "CostLayerConsumption_canonicalProductId_idx" ON "CostLayerConsumption"("canonicalProductId");
CREATE INDEX "CostLayerConsumption_marketplace_idx" ON "CostLayerConsumption"("marketplace");
CREATE INDEX "CostLayerConsumption_settlementDocNumber_idx" ON "CostLayerConsumption"("settlementDocNumber");
CREATE INDEX "CostLayerConsumption_sellerSku_idx" ON "CostLayerConsumption"("sellerSku");
CREATE UNIQUE INDEX "SellerboardCogsExport_cogsPostingBatchId_sellerSku_internalPo_key" ON "SellerboardCogsExport"("cogsPostingBatchId", "sellerSku", "internalPo");
CREATE INDEX "SellerboardCogsExport_marketplace_idx" ON "SellerboardCogsExport"("marketplace");
CREATE INDEX "SellerboardCogsExport_settlementDocNumber_idx" ON "SellerboardCogsExport"("settlementDocNumber");
CREATE INDEX "SellerboardCogsExport_status_idx" ON "SellerboardCogsExport"("status");
CREATE INDEX "SellerboardCogsExport_exportedAt_idx" ON "SellerboardCogsExport"("exportedAt");
CREATE INDEX "PlutusException_marketplace_idx" ON "PlutusException"("marketplace");
CREATE INDEX "PlutusException_scopeType_scopeId_idx" ON "PlutusException"("scopeType", "scopeId");
CREATE INDEX "PlutusException_code_idx" ON "PlutusException"("code");
CREATE INDEX "PlutusException_status_idx" ON "PlutusException"("status");
CREATE INDEX "PlutusException_severity_idx" ON "PlutusException"("severity");

-- AddForeignKey
ALTER TABLE "CanonicalProduct" ADD CONSTRAINT "CanonicalProduct_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_landedCostBatchId_fkey" FOREIGN KEY ("landedCostBatchId") REFERENCES "LandedCostBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LandedCostBatch" ADD CONSTRAINT "LandedCostBatch_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoCostLayer" ADD CONSTRAINT "PoCostLayer_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoCostLayer" ADD CONSTRAINT "PoCostLayer_landedCostBatchId_fkey" FOREIGN KEY ("landedCostBatchId") REFERENCES "LandedCostBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PoCostLayer" ADD CONSTRAINT "PoCostLayer_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostLayerConsumption" ADD CONSTRAINT "CostLayerConsumption_cogsPostingBatchId_fkey" FOREIGN KEY ("cogsPostingBatchId") REFERENCES "CogsPostingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostLayerConsumption" ADD CONSTRAINT "CostLayerConsumption_poCostLayerId_fkey" FOREIGN KEY ("poCostLayerId") REFERENCES "PoCostLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostLayerConsumption" ADD CONSTRAINT "CostLayerConsumption_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerboardCogsExport" ADD CONSTRAINT "SellerboardCogsExport_cogsPostingBatchId_fkey" FOREIGN KEY ("cogsPostingBatchId") REFERENCES "CogsPostingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerboardCogsExport" ADD CONSTRAINT "SellerboardCogsExport_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
