-- Add workbook-structure fields used by the Excel parity UI.

ALTER TABLE "PurchaseOrder"
ADD COLUMN "poClass" TEXT,
ADD COLUMN "inboundWeekOverride" TIMESTAMP(3);

CREATE TABLE "ProductSetupYear" (
  "id" TEXT NOT NULL,
  "strategyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "openingStock" INTEGER,
  "nextYearOpeningOverride" INTEGER,
  "notes" TEXT,
  "totalCoverThresholdWeeks" DECIMAL(8,2),
  "fbaCoverThresholdWeeks" DECIMAL(8,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductSetupYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSetupYear_strategyId_productId_year_key"
ON "ProductSetupYear"("strategyId", "productId", "year");

CREATE INDEX "ProductSetupYear_strategyId_year_idx"
ON "ProductSetupYear"("strategyId", "year");

CREATE INDEX "ProductSetupYear_productId_idx"
ON "ProductSetupYear"("productId");

ALTER TABLE "ProductSetupYear"
ADD CONSTRAINT "ProductSetupYear_strategyId_fkey"
FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductSetupYear"
ADD CONSTRAINT "ProductSetupYear_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
