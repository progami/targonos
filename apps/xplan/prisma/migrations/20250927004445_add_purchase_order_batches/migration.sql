/*
  Warnings:

  - Made the column `status` on table `PurchaseOrderPayment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "BusinessParameter" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CashFlowWeek" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeadStageTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeadTimeOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LogisticsEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MonthlySummary" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProfitAndLossWeek" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "quantity" DROP DEFAULT,
ALTER COLUMN "productionWeeks" DROP DEFAULT,
ALTER COLUMN "sourceWeeks" DROP DEFAULT,
ALTER COLUMN "oceanWeeks" DROP DEFAULT,
ALTER COLUMN "finalWeeks" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrderPayment" ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuarterlySummary" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SalesWeek" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PurchaseOrderBatch" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "batchCode" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "overrideSellingPrice" DECIMAL(10,2),
    "overrideManufacturingCost" DECIMAL(10,2),
    "overrideFreightCost" DECIMAL(10,2),
    "overrideTariffRate" DECIMAL(5,4),
    "overrideTacosPercent" DECIMAL(5,4),
    "overrideFbaFee" DECIMAL(10,2),
    "overrideReferralRate" DECIMAL(5,4),
    "overrideStoragePerMonth" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderBatch_purchaseOrderId_idx" ON "PurchaseOrderBatch"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderBatch_productId_idx" ON "PurchaseOrderBatch"("productId");

-- CreateIndex
CREATE INDEX "CashFlowWeek_weekDate_idx" ON "CashFlowWeek"("weekDate");

-- CreateIndex
CREATE INDEX "ProfitAndLossWeek_weekDate_idx" ON "ProfitAndLossWeek"("weekDate");

-- RenameForeignKey
ALTER TABLE "LogisticsEvent" RENAME CONSTRAINT "LogisticsEvent_po_fkey" TO "LogisticsEvent_purchaseOrderId_fkey";

-- RenameForeignKey
ALTER TABLE "PurchaseOrderPayment" RENAME CONSTRAINT "PurchaseOrderPayment_purchaseOrder_fkey" TO "PurchaseOrderPayment_purchaseOrderId_fkey";

-- RenameForeignKey
ALTER TABLE "SalesWeek" RENAME CONSTRAINT "SalesWeek_product_fkey" TO "SalesWeek_productId_fkey";

-- AddForeignKey
ALTER TABLE "PurchaseOrderBatch" ADD CONSTRAINT "PurchaseOrderBatch_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderBatch" ADD CONSTRAINT "PurchaseOrderBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LeadTimeOverride_product_stage_key" RENAME TO "LeadTimeOverride_productId_stageTemplateId_key";

-- RenameIndex
ALTER INDEX "MonthlySummary_year_month_period_key" RENAME TO "MonthlySummary_year_month_periodLabel_key";

-- RenameIndex
ALTER INDEX "PurchaseOrderPayment_unique_payment" RENAME TO "PurchaseOrderPayment_purchaseOrderId_paymentIndex_key";

-- RenameIndex
ALTER INDEX "QuarterlySummary_year_quarter_period_key" RENAME TO "QuarterlySummary_year_quarter_periodLabel_key";

-- RenameIndex
ALTER INDEX "SalesWeek_product_week_key" RENAME TO "SalesWeek_productId_weekNumber_key";
