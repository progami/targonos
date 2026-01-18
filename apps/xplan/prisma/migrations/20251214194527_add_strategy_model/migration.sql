-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Strategy_status_idx" ON "Strategy"("status");

-- Create a default strategy for existing data
INSERT INTO "Strategy" ("id", "name", "description", "status", "isDefault", "createdAt", "updatedAt")
VALUES ('default-strategy', 'Default Strategy', 'Default strategy for existing data', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add strategyId column to Product with default
ALTER TABLE "Product" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to BusinessParameter with default
ALTER TABLE "BusinessParameter" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to PurchaseOrder with default
ALTER TABLE "PurchaseOrder" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to SalesWeek with default
ALTER TABLE "SalesWeek" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to ProfitAndLossWeek with default
ALTER TABLE "ProfitAndLossWeek" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to CashFlowWeek with default
ALTER TABLE "CashFlowWeek" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to MonthlySummary with default
ALTER TABLE "MonthlySummary" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Add strategyId column to QuarterlySummary with default
ALTER TABLE "QuarterlySummary" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'default-strategy';

-- Remove defaults (data has been migrated)
ALTER TABLE "Product" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "BusinessParameter" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "SalesWeek" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "ProfitAndLossWeek" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "CashFlowWeek" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "MonthlySummary" ALTER COLUMN "strategyId" DROP DEFAULT;
ALTER TABLE "QuarterlySummary" ALTER COLUMN "strategyId" DROP DEFAULT;

-- CreateIndex for strategyId columns
CREATE INDEX "Product_strategyId_idx" ON "Product"("strategyId");
CREATE INDEX "BusinessParameter_strategyId_idx" ON "BusinessParameter"("strategyId");
CREATE INDEX "PurchaseOrder_strategyId_idx" ON "PurchaseOrder"("strategyId");
CREATE INDEX "SalesWeek_strategyId_idx" ON "SalesWeek"("strategyId");
CREATE INDEX "ProfitAndLossWeek_strategyId_idx" ON "ProfitAndLossWeek"("strategyId");
CREATE INDEX "CashFlowWeek_strategyId_idx" ON "CashFlowWeek"("strategyId");
CREATE INDEX "MonthlySummary_strategyId_idx" ON "MonthlySummary"("strategyId");
CREATE INDEX "QuarterlySummary_strategyId_idx" ON "QuarterlySummary"("strategyId");

-- Drop old unique constraints and create new ones with strategyId
-- Product: drop @@unique([sku]) and add @@unique([strategyId, sku])
DROP INDEX IF EXISTS "Product_sku_key";
CREATE UNIQUE INDEX "Product_strategyId_sku_key" ON "Product"("strategyId", "sku");

-- BusinessParameter: drop @@unique([label]) and add @@unique([strategyId, label])
DROP INDEX IF EXISTS "BusinessParameter_label_key";
CREATE UNIQUE INDEX "BusinessParameter_strategyId_label_key" ON "BusinessParameter"("strategyId", "label");

-- PurchaseOrder: drop @@unique([orderCode]) and add @@unique([strategyId, orderCode])
DROP INDEX IF EXISTS "PurchaseOrder_orderCode_key";
CREATE UNIQUE INDEX "PurchaseOrder_strategyId_orderCode_key" ON "PurchaseOrder"("strategyId", "orderCode");

-- SalesWeek: drop @@unique([productId, weekNumber]) and add @@unique([strategyId, productId, weekNumber])
DROP INDEX IF EXISTS "SalesWeek_productId_weekNumber_key";
CREATE UNIQUE INDEX "SalesWeek_strategyId_productId_weekNumber_key" ON "SalesWeek"("strategyId", "productId", "weekNumber");

-- ProfitAndLossWeek: drop @@unique([weekNumber]) and add @@unique([strategyId, weekNumber])
DROP INDEX IF EXISTS "ProfitAndLossWeek_weekNumber_key";
CREATE UNIQUE INDEX "ProfitAndLossWeek_strategyId_weekNumber_key" ON "ProfitAndLossWeek"("strategyId", "weekNumber");

-- CashFlowWeek: drop @@unique([weekNumber]) and add @@unique([strategyId, weekNumber])
DROP INDEX IF EXISTS "CashFlowWeek_weekNumber_key";
CREATE UNIQUE INDEX "CashFlowWeek_strategyId_weekNumber_key" ON "CashFlowWeek"("strategyId", "weekNumber");

-- MonthlySummary: drop @@unique([year, month, periodLabel]) and add @@unique([strategyId, year, month, periodLabel])
DROP INDEX IF EXISTS "MonthlySummary_year_month_periodLabel_key";
CREATE UNIQUE INDEX "MonthlySummary_strategyId_year_month_periodLabel_key" ON "MonthlySummary"("strategyId", "year", "month", "periodLabel");

-- QuarterlySummary: drop @@unique([year, quarter, periodLabel]) and add @@unique([strategyId, year, quarter, periodLabel])
DROP INDEX IF EXISTS "QuarterlySummary_year_quarter_periodLabel_key";
CREATE UNIQUE INDEX "QuarterlySummary_strategyId_year_quarter_periodLabel_key" ON "QuarterlySummary"("strategyId", "year", "quarter", "periodLabel");

-- AddForeignKey constraints
ALTER TABLE "Product" ADD CONSTRAINT "Product_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessParameter" ADD CONSTRAINT "BusinessParameter_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesWeek" ADD CONSTRAINT "SalesWeek_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfitAndLossWeek" ADD CONSTRAINT "ProfitAndLossWeek_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashFlowWeek" ADD CONSTRAINT "CashFlowWeek_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlySummary" ADD CONSTRAINT "MonthlySummary_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuarterlySummary" ADD CONSTRAINT "QuarterlySummary_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
