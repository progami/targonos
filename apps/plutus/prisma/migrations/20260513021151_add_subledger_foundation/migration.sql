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
    "name" TEXT NOT NULL,
    "productGroupId" TEXT NOT NULL,
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
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "internalRef" TEXT NOT NULL,
    "supplierRef" TEXT,
    "marketplace" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoCostLayer" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "quantity" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "allocationMethod" TEXT NOT NULL,
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
    "movementType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingIntent" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "sourceHash" TEXT NOT NULL,
    "mappingVersion" TEXT NOT NULL,
    "postingHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingIntentLine" (
    "id" TEXT NOT NULL,
    "postingIntentId" TEXT NOT NULL,
    "lineRef" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lineHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostingIntentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboPosting" (
    "id" TEXT NOT NULL,
    "postingIntentId" TEXT NOT NULL,
    "qboTxnType" TEXT NOT NULL,
    "qboTxnId" TEXT NOT NULL,
    "qboSyncToken" TEXT,
    "qboDocNumber" TEXT,
    "qboPrivateNote" TEXT,
    "qboTxnDate" TEXT,
    "postingHash" TEXT NOT NULL,
    "driftStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "attachmentStatus" TEXT NOT NULL DEFAULT 'missing',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboPostingLineFingerprint" (
    "id" TEXT NOT NULL,
    "qboPostingId" TEXT NOT NULL,
    "qboLineId" TEXT NOT NULL,
    "expectedLineHash" TEXT NOT NULL,
    "liveLineHash" TEXT,
    "driftStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboPostingLineFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_code_key" ON "ProductGroup"("code");

-- CreateIndex
CREATE INDEX "ProductGroup_active_idx" ON "ProductGroup"("active");

-- CreateIndex
CREATE INDEX "CanonicalProduct_productGroupId_idx" ON "CanonicalProduct"("productGroupId");

-- CreateIndex
CREATE INDEX "CanonicalProduct_active_idx" ON "CanonicalProduct"("active");

-- CreateIndex
CREATE INDEX "SkuAlias_canonicalProductId_idx" ON "SkuAlias"("canonicalProductId");

-- CreateIndex
CREATE INDEX "SkuAlias_marketplace_idx" ON "SkuAlias"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "SkuAlias_marketplace_aliasType_value_key" ON "SkuAlias"("marketplace", "aliasType", "value");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_internalRef_key" ON "PurchaseOrder"("internalRef");

-- CreateIndex
CREATE INDEX "PurchaseOrder_marketplace_idx" ON "PurchaseOrder"("marketplace");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PoCostLayer_purchaseOrderId_idx" ON "PoCostLayer"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PoCostLayer_canonicalProductId_idx" ON "PoCostLayer"("canonicalProductId");

-- CreateIndex
CREATE INDEX "PoCostLayer_component_idx" ON "PoCostLayer"("component");

-- CreateIndex
CREATE INDEX "PoCostLayer_sourceQboTxnType_sourceQboTxnId_idx" ON "PoCostLayer"("sourceQboTxnType", "sourceQboTxnId");

-- CreateIndex
CREATE INDEX "InventoryMovement_canonicalProductId_idx" ON "InventoryMovement"("canonicalProductId");

-- CreateIndex
CREATE INDEX "InventoryMovement_marketplace_idx" ON "InventoryMovement"("marketplace");

-- CreateIndex
CREATE INDEX "InventoryMovement_movementType_idx" ON "InventoryMovement"("movementType");

-- CreateIndex
CREATE INDEX "InventoryMovement_movementDate_idx" ON "InventoryMovement"("movementDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_sourceType_sourceId_idx" ON "InventoryMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PostingIntent_market_idx" ON "PostingIntent"("market");

-- CreateIndex
CREATE INDEX "PostingIntent_status_idx" ON "PostingIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PostingIntent_sourceType_sourceId_key" ON "PostingIntent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PostingIntentLine_postingIntentId_idx" ON "PostingIntentLine"("postingIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PostingIntentLine_postingIntentId_lineRef_key" ON "PostingIntentLine"("postingIntentId", "lineRef");

-- CreateIndex
CREATE INDEX "QboPosting_postingIntentId_idx" ON "QboPosting"("postingIntentId");

-- CreateIndex
CREATE INDEX "QboPosting_driftStatus_idx" ON "QboPosting"("driftStatus");

-- CreateIndex
CREATE UNIQUE INDEX "QboPosting_qboTxnType_qboTxnId_key" ON "QboPosting"("qboTxnType", "qboTxnId");

-- CreateIndex
CREATE INDEX "QboPostingLineFingerprint_qboPostingId_idx" ON "QboPostingLineFingerprint"("qboPostingId");

-- CreateIndex
CREATE INDEX "QboPostingLineFingerprint_driftStatus_idx" ON "QboPostingLineFingerprint"("driftStatus");

-- CreateIndex
CREATE UNIQUE INDEX "QboPostingLineFingerprint_qboPostingId_qboLineId_key" ON "QboPostingLineFingerprint"("qboPostingId", "qboLineId");

-- AddForeignKey
ALTER TABLE "CanonicalProduct" ADD CONSTRAINT "CanonicalProduct_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoCostLayer" ADD CONSTRAINT "PoCostLayer_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoCostLayer" ADD CONSTRAINT "PoCostLayer_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingIntentLine" ADD CONSTRAINT "PostingIntentLine_postingIntentId_fkey" FOREIGN KEY ("postingIntentId") REFERENCES "PostingIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboPosting" ADD CONSTRAINT "QboPosting_postingIntentId_fkey" FOREIGN KEY ("postingIntentId") REFERENCES "PostingIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboPostingLineFingerprint" ADD CONSTRAINT "QboPostingLineFingerprint_qboPostingId_fkey" FOREIGN KEY ("qboPostingId") REFERENCES "QboPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

