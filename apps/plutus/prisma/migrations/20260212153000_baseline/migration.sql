-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT,
    "asin" TEXT,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupConfig" (
    "id" TEXT NOT NULL,
    "invManufacturing" TEXT,
    "invFreight" TEXT,
    "invDuty" TEXT,
    "invMfgAccessories" TEXT,
    "cogsManufacturing" TEXT,
    "cogsFreight" TEXT,
    "cogsDuty" TEXT,
    "cogsMfgAccessories" TEXT,
    "cogsLandFreight" TEXT,
    "cogsStorage3pl" TEXT,
    "cogsShrinkage" TEXT,
    "warehousing3pl" TEXT,
    "warehousingAmazonFc" TEXT,
    "warehousingAwd" TEXT,
    "amazonSales" TEXT,
    "amazonRefunds" TEXT,
    "amazonFbaInventoryReimbursement" TEXT,
    "amazonSellerFees" TEXT,
    "amazonFbaFees" TEXT,
    "amazonStorageFees" TEXT,
    "amazonAdvertisingCosts" TEXT,
    "amazonPromotions" TEXT,
    "productExpenses" TEXT,
    "accountsCreated" BOOLEAN NOT NULL DEFAULT false,
    "autopostEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopostStartDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditDataUpload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "invoiceCount" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditDataUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditDataRow" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "net" INTEGER NOT NULL,
    "uploadId" TEXT NOT NULL,

    CONSTRAINT "AuditDataRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementProcessing" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "qboSettlementJournalEntryId" TEXT NOT NULL,
    "lmbDocNumber" TEXT NOT NULL,
    "lmbPostedDate" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "processingHash" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qboCogsJournalEntryId" TEXT NOT NULL,
    "qboPnlReclassJournalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRollback" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "qboSettlementJournalEntryId" TEXT NOT NULL,
    "lmbDocNumber" TEXT NOT NULL,
    "lmbPostedDate" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "processingHash" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "qboCogsJournalEntryId" TEXT NOT NULL,
    "qboPnlReclassJournalEntryId" TEXT NOT NULL,
    "orderSalesCount" INTEGER NOT NULL,
    "orderReturnsCount" INTEGER NOT NULL,
    "rolledBackAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRollback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSale" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "costManufacturingCents" INTEGER NOT NULL,
    "costFreightCents" INTEGER NOT NULL,
    "costDutyCents" INTEGER NOT NULL,
    "costMfgAccessoriesCents" INTEGER NOT NULL,
    "settlementProcessingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "costManufacturingCents" INTEGER NOT NULL,
    "costFreightCents" INTEGER NOT NULL,
    "costDutyCents" INTEGER NOT NULL,
    "costMfgAccessoriesCents" INTEGER NOT NULL,
    "settlementProcessingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "onNewSettlement" BOOLEAN NOT NULL DEFAULT true,
    "onSettlementPosted" BOOLEAN NOT NULL DEFAULT true,
    "onProcessingError" BOOLEAN NOT NULL DEFAULT true,
    "onMonthlyAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillMapping" (
    "id" TEXT NOT NULL,
    "qboBillId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "billDate" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLineMapping" (
    "id" TEXT NOT NULL,
    "billMappingId" TEXT NOT NULL,
    "qboLineId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillLineMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsDataUpload" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "skuCount" INTEGER NOT NULL,
    "minDate" TEXT NOT NULL,
    "maxDate" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsDataUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsDataRow" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "spendCents" INTEGER NOT NULL,

    CONSTRAINT "AdsDataRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAdsAllocation" (
    "id" TEXT NOT NULL,
    "settlementProcessingId" TEXT NOT NULL,
    "weightSource" TEXT NOT NULL,
    "weightUnit" TEXT NOT NULL,
    "invoiceStartDate" TEXT NOT NULL,
    "invoiceEndDate" TEXT NOT NULL,
    "totalAdsCents" INTEGER NOT NULL,
    "adsDataUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementAdsAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAdsAllocationLine" (
    "id" TEXT NOT NULL,
    "settlementAdsAllocationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "allocatedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementAdsAllocationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowForecastConfig" (
    "id" TEXT NOT NULL,
    "cashAccountIds" TEXT[],
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "settlementLookbackDays" INTEGER NOT NULL DEFAULT 180,
    "settlementAverageCount" INTEGER NOT NULL DEFAULT 4,
    "settlementDefaultIntervalDays" INTEGER NOT NULL DEFAULT 14,
    "includeProjectedSettlements" BOOLEAN NOT NULL DEFAULT true,
    "includeOpenBills" BOOLEAN NOT NULL DEFAULT true,
    "includeOpenInvoices" BOOLEAN NOT NULL DEFAULT true,
    "includeRecurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowForecastConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowForecastAdjustment" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowForecastAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowForecastSnapshot" (
    "id" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "forecast" JSONB NOT NULL,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Brand_marketplace_idx" ON "Brand"("marketplace");

-- CreateIndex
CREATE INDEX "Sku_brandId_idx" ON "Sku"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_sku_brandId_key" ON "Sku"("sku", "brandId");

-- CreateIndex
CREATE INDEX "AuditDataRow_invoiceId_idx" ON "AuditDataRow"("invoiceId");

-- CreateIndex
CREATE INDEX "AuditDataRow_uploadId_idx" ON "AuditDataRow"("uploadId");

-- CreateIndex
CREATE INDEX "AuditDataRow_uploadId_invoiceId_idx" ON "AuditDataRow"("uploadId", "invoiceId");

-- CreateIndex
CREATE INDEX "SettlementProcessing_marketplace_idx" ON "SettlementProcessing"("marketplace");

-- CreateIndex
CREATE INDEX "SettlementProcessing_marketplace_createdAt_idx" ON "SettlementProcessing"("marketplace", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProcessing_marketplace_invoiceId_key" ON "SettlementProcessing"("marketplace", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProcessing_qboSettlementJournalEntryId_key" ON "SettlementProcessing"("qboSettlementJournalEntryId");

-- CreateIndex
CREATE INDEX "SettlementRollback_qboSettlementJournalEntryId_idx" ON "SettlementRollback"("qboSettlementJournalEntryId");

-- CreateIndex
CREATE INDEX "SettlementRollback_marketplace_idx" ON "SettlementRollback"("marketplace");

-- CreateIndex
CREATE INDEX "OrderSale_settlementProcessingId_idx" ON "OrderSale"("settlementProcessingId");

-- CreateIndex
CREATE INDEX "OrderSale_marketplace_idx" ON "OrderSale"("marketplace");

-- CreateIndex
CREATE INDEX "OrderSale_saleDate_idx" ON "OrderSale"("saleDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSale_marketplace_orderId_sku_key" ON "OrderSale"("marketplace", "orderId", "sku");

-- CreateIndex
CREATE INDEX "OrderReturn_settlementProcessingId_idx" ON "OrderReturn"("settlementProcessingId");

-- CreateIndex
CREATE INDEX "OrderReturn_marketplace_orderId_sku_idx" ON "OrderReturn"("marketplace", "orderId", "sku");

-- CreateIndex
CREATE INDEX "OrderReturn_returnDate_idx" ON "OrderReturn"("returnDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReturn_marketplace_orderId_sku_settlementProcessingId_key" ON "OrderReturn"("marketplace", "orderId", "sku", "settlementProcessingId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BillMapping_qboBillId_key" ON "BillMapping"("qboBillId");

-- CreateIndex
CREATE INDEX "BillMapping_poNumber_idx" ON "BillMapping"("poNumber");

-- CreateIndex
CREATE INDEX "BillMapping_brandId_idx" ON "BillMapping"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BillLineMapping_billMappingId_qboLineId_key" ON "BillLineMapping"("billMappingId", "qboLineId");

-- CreateIndex
CREATE INDEX "AdsDataUpload_marketplace_idx" ON "AdsDataUpload"("marketplace");

-- CreateIndex
CREATE INDEX "AdsDataUpload_reportType_idx" ON "AdsDataUpload"("reportType");

-- CreateIndex
CREATE INDEX "AdsDataUpload_marketplace_reportType_idx" ON "AdsDataUpload"("marketplace", "reportType");

-- CreateIndex
CREATE INDEX "AdsDataUpload_uploadedAt_idx" ON "AdsDataUpload"("uploadedAt");

-- CreateIndex
CREATE INDEX "AdsDataUpload_marketplace_startDate_endDate_idx" ON "AdsDataUpload"("marketplace", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AdsDataRow_uploadId_idx" ON "AdsDataRow"("uploadId");

-- CreateIndex
CREATE INDEX "AdsDataRow_uploadId_date_idx" ON "AdsDataRow"("uploadId", "date");

-- CreateIndex
CREATE INDEX "AdsDataRow_sku_idx" ON "AdsDataRow"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "AdsDataRow_uploadId_date_sku_key" ON "AdsDataRow"("uploadId", "date", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAdsAllocation_settlementProcessingId_key" ON "SettlementAdsAllocation"("settlementProcessingId");

-- CreateIndex
CREATE INDEX "SettlementAdsAllocation_settlementProcessingId_idx" ON "SettlementAdsAllocation"("settlementProcessingId");

-- CreateIndex
CREATE INDEX "SettlementAdsAllocation_adsDataUploadId_idx" ON "SettlementAdsAllocation"("adsDataUploadId");

-- CreateIndex
CREATE INDEX "SettlementAdsAllocationLine_settlementAdsAllocationId_idx" ON "SettlementAdsAllocationLine"("settlementAdsAllocationId");

-- CreateIndex
CREATE INDEX "SettlementAdsAllocationLine_sku_idx" ON "SettlementAdsAllocationLine"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAdsAllocationLine_settlementAdsAllocationId_sku_key" ON "SettlementAdsAllocationLine"("settlementAdsAllocationId", "sku");

-- CreateIndex
CREATE INDEX "CashflowForecastAdjustment_date_idx" ON "CashflowForecastAdjustment"("date");

-- CreateIndex
CREATE INDEX "CashflowForecastSnapshot_createdAt_idx" ON "CashflowForecastSnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditDataRow" ADD CONSTRAINT "AuditDataRow_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "AuditDataUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSale" ADD CONSTRAINT "OrderSale_settlementProcessingId_fkey" FOREIGN KEY ("settlementProcessingId") REFERENCES "SettlementProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_settlementProcessingId_fkey" FOREIGN KEY ("settlementProcessingId") REFERENCES "SettlementProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillMapping" ADD CONSTRAINT "BillMapping_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLineMapping" ADD CONSTRAINT "BillLineMapping_billMappingId_fkey" FOREIGN KEY ("billMappingId") REFERENCES "BillMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsDataRow" ADD CONSTRAINT "AdsDataRow_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "AdsDataUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAdsAllocation" ADD CONSTRAINT "SettlementAdsAllocation_settlementProcessingId_fkey" FOREIGN KEY ("settlementProcessingId") REFERENCES "SettlementProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAdsAllocation" ADD CONSTRAINT "SettlementAdsAllocation_adsDataUploadId_fkey" FOREIGN KEY ("adsDataUploadId") REFERENCES "AdsDataUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAdsAllocationLine" ADD CONSTRAINT "SettlementAdsAllocationLine_settlementAdsAllocationId_fkey" FOREIGN KEY ("settlementAdsAllocationId") REFERENCES "SettlementAdsAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

