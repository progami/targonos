-- CreateTable
CREATE TABLE "AwdDataUpload" (
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

    CONSTRAINT "AwdDataUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwdDataRow" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "monthStartDate" TEXT NOT NULL,
    "monthEndDate" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "feeType" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "AwdDataRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwdDataUpload_marketplace_idx" ON "AwdDataUpload"("marketplace");

-- CreateIndex
CREATE INDEX "AwdDataUpload_reportType_idx" ON "AwdDataUpload"("reportType");

-- CreateIndex
CREATE INDEX "AwdDataUpload_marketplace_reportType_idx" ON "AwdDataUpload"("marketplace", "reportType");

-- CreateIndex
CREATE INDEX "AwdDataUpload_uploadedAt_idx" ON "AwdDataUpload"("uploadedAt");

-- CreateIndex
CREATE INDEX "AwdDataUpload_marketplace_startDate_endDate_idx" ON "AwdDataUpload"("marketplace", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AwdDataRow_uploadId_idx" ON "AwdDataRow"("uploadId");

-- CreateIndex
CREATE INDEX "AwdDataRow_uploadId_monthStartDate_monthEndDate_idx" ON "AwdDataRow"("uploadId", "monthStartDate", "monthEndDate");

-- CreateIndex
CREATE INDEX "AwdDataRow_sku_idx" ON "AwdDataRow"("sku");

-- AddForeignKey
ALTER TABLE "AwdDataRow" ADD CONSTRAINT "AwdDataRow_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "AwdDataUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
