-- Create dedicated schema for X-Plan
CREATE SCHEMA IF NOT EXISTS "xplan";

-- Enum definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
    CREATE TYPE "xplan"."PurchaseOrderStatus" AS ENUM ('PLANNED', 'PRODUCTION', 'IN_TRANSIT', 'ARRIVED', 'CLOSED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LogisticsEventType') THEN
    CREATE TYPE "xplan"."LogisticsEventType" AS ENUM ('PRODUCTION_START', 'PRODUCTION_COMPLETE', 'INBOUND_DEPARTURE', 'PORT_ARRIVAL', 'WAREHOUSE_ARRIVAL', 'CUSTOM');
  END IF;
END$$;

-- Product catalog
CREATE TABLE IF NOT EXISTS "xplan"."Product" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "sellingPrice" DECIMAL(10,2) NOT NULL,
  "manufacturingCost" DECIMAL(10,2) NOT NULL,
  "freightCost" DECIMAL(10,2) NOT NULL,
  "tariffRate" DECIMAL(5,4) NOT NULL,
  "tacosPercent" DECIMAL(5,4) NOT NULL,
  "fbaFee" DECIMAL(10,2) NOT NULL,
  "amazonReferralRate" DECIMAL(5,4) NOT NULL,
  "storagePerMonth" DECIMAL(10,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "xplan"."Product" ("sku");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "xplan"."Product" ("name");

-- Lead stages
CREATE TABLE IF NOT EXISTS "xplan"."LeadStageTemplate" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "defaultWeeks" DECIMAL(5,2) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadStageTemplate_sequence_key" ON "xplan"."LeadStageTemplate" ("sequence");

CREATE TABLE IF NOT EXISTS "xplan"."LeadTimeOverride" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "stageTemplateId" TEXT NOT NULL,
  "durationWeeks" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadTimeOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "xplan"."Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadTimeOverride_stageTemplateId_fkey" FOREIGN KEY ("stageTemplateId") REFERENCES "xplan"."LeadStageTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadTimeOverride_product_stage_key" ON "xplan"."LeadTimeOverride" ("productId", "stageTemplateId");

-- Business parameters
CREATE TABLE IF NOT EXISTS "xplan"."BusinessParameter" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "valueNumeric" DECIMAL(14,2),
  "valueText" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessParameter_label_key" ON "xplan"."BusinessParameter" ("label");

-- Purchase orders
CREATE TABLE IF NOT EXISTS "xplan"."PurchaseOrder" (
  "id" TEXT PRIMARY KEY,
  "orderCode" TEXT NOT NULL,
  "poDate" TIMESTAMP(3),
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
    "productionWeeks" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sourceWeeks" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "oceanWeeks" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "finalWeeks" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "pay1Date" TIMESTAMP(3),
  "pay1Percent" DECIMAL(6,4),
  "pay1Amount" DECIMAL(12,2),
  "pay2Date" TIMESTAMP(3),
  "pay2Percent" DECIMAL(6,4),
  "pay2Amount" DECIMAL(12,2),
  "pay3Date" TIMESTAMP(3),
  "pay3Percent" DECIMAL(6,4),
  "pay3Amount" DECIMAL(12,2),
  "productionStart" TIMESTAMP(3),
  "productionComplete" TIMESTAMP(3),
  "sourceDeparture" TIMESTAMP(3),
  "transportReference" TEXT,
  "portEta" TIMESTAMP(3),
  "inboundEta" TIMESTAMP(3),
  "availableDate" TIMESTAMP(3),
  "totalLeadDays" INTEGER,
  "status" "xplan"."PurchaseOrderStatus" NOT NULL DEFAULT 'PLANNED',
  "statusIcon" TEXT,
  "weeksUntilArrival" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "xplan"."Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_orderCode_key" ON "xplan"."PurchaseOrder" ("orderCode");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_orderCode_idx" ON "xplan"."PurchaseOrder" ("orderCode");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "xplan"."PurchaseOrder" ("status");

CREATE TABLE IF NOT EXISTS "xplan"."PurchaseOrderPayment" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL,
  "paymentIndex" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3),
  "percentage" DECIMAL(6,4),
  "amount" DECIMAL(12,2),
  "status" TEXT DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderPayment_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "xplan"."PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderPayment_unique_payment" ON "xplan"."PurchaseOrderPayment" ("purchaseOrderId", "paymentIndex");

CREATE TABLE IF NOT EXISTS "xplan"."LogisticsEvent" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL,
  "type" "xplan"."LogisticsEventType" NOT NULL,
  "eventDate" TIMESTAMP(3),
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LogisticsEvent_po_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "xplan"."PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LogisticsEvent_type_idx" ON "xplan"."LogisticsEvent" ("type");

-- Sales weeks
CREATE TABLE IF NOT EXISTS "xplan"."SalesWeek" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "weekDate" TIMESTAMP(3) NOT NULL,
  "stockStart" INTEGER,
  "actualSales" INTEGER,
  "forecastSales" INTEGER,
  "finalSales" INTEGER,
  "stockWeeks" DECIMAL(8,2),
  "stockEnd" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesWeek_product_fkey" FOREIGN KEY ("productId") REFERENCES "xplan"."Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesWeek_product_week_key" ON "xplan"."SalesWeek" ("productId", "weekNumber");
CREATE INDEX IF NOT EXISTS "SalesWeek_weekDate_idx" ON "xplan"."SalesWeek" ("weekDate");

-- Profit & Loss weeks
CREATE TABLE IF NOT EXISTS "xplan"."ProfitAndLossWeek" (
  "id" TEXT PRIMARY KEY,
  "weekNumber" INTEGER NOT NULL,
  "weekDate" TIMESTAMP(3) NOT NULL,
  "units" INTEGER,
  "revenue" DECIMAL(14,2),
  "cogs" DECIMAL(14,2),
  "grossProfit" DECIMAL(14,2),
  "grossMargin" DECIMAL(7,4),
  "amazonFees" DECIMAL(14,2),
  "ppcSpend" DECIMAL(14,2),
  "fixedCosts" DECIMAL(14,2),
  "totalOpex" DECIMAL(14,2),
  "netProfit" DECIMAL(14,2),
  "periodLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProfitAndLossWeek_weekNumber_key" ON "xplan"."ProfitAndLossWeek" ("weekNumber");

-- Cash flow weeks
CREATE TABLE IF NOT EXISTS "xplan"."CashFlowWeek" (
  "id" TEXT PRIMARY KEY,
  "weekNumber" INTEGER NOT NULL,
  "weekDate" TIMESTAMP(3) NOT NULL,
  "amazonPayout" DECIMAL(14,2),
  "inventorySpend" DECIMAL(14,2),
  "fixedCosts" DECIMAL(14,2),
  "netCash" DECIMAL(14,2),
  "cashBalance" DECIMAL(14,2),
  "periodLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashFlowWeek_weekNumber_key" ON "xplan"."CashFlowWeek" ("weekNumber");

-- Monthly summary
CREATE TABLE IF NOT EXISTS "xplan"."MonthlySummary" (
  "id" TEXT PRIMARY KEY,
  "periodLabel" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "revenue" DECIMAL(14,2),
  "cogs" DECIMAL(14,2),
  "grossProfit" DECIMAL(14,2),
  "amazonFees" DECIMAL(14,2),
  "ppcSpend" DECIMAL(14,2),
  "fixedCosts" DECIMAL(14,2),
  "totalOpex" DECIMAL(14,2),
  "netProfit" DECIMAL(14,2),
  "amazonPayout" DECIMAL(14,2),
  "inventorySpend" DECIMAL(14,2),
  "netCash" DECIMAL(14,2),
  "closingCash" DECIMAL(14,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlySummary_year_month_period_key" ON "xplan"."MonthlySummary" ("year", "month", "periodLabel");

-- Quarterly summary
CREATE TABLE IF NOT EXISTS "xplan"."QuarterlySummary" (
  "id" TEXT PRIMARY KEY,
  "periodLabel" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "revenue" DECIMAL(14,2),
  "cogs" DECIMAL(14,2),
  "grossProfit" DECIMAL(14,2),
  "amazonFees" DECIMAL(14,2),
  "ppcSpend" DECIMAL(14,2),
  "fixedCosts" DECIMAL(14,2),
  "totalOpex" DECIMAL(14,2),
  "netProfit" DECIMAL(14,2),
  "amazonPayout" DECIMAL(14,2),
  "inventorySpend" DECIMAL(14,2),
  "netCash" DECIMAL(14,2),
  "closingCash" DECIMAL(14,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuarterlySummary_year_quarter_period_key" ON "xplan"."QuarterlySummary" ("year", "quarter", "periodLabel");

-- Scenario snapshots
CREATE TABLE IF NOT EXISTS "xplan"."ScenarioSnapshot" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workbook" JSONB NOT NULL
);
