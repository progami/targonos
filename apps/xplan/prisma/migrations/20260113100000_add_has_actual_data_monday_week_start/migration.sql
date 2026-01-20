-- Add hasActualData column to SalesWeek
ALTER TABLE "SalesWeek" ADD COLUMN "hasActualData" BOOLEAN NOT NULL DEFAULT false;

-- Backfill hasActualData = true for rows that have actualSales
UPDATE "SalesWeek" SET "hasActualData" = true WHERE "actualSales" IS NOT NULL;

-- Shift weekDates for US region strategies from Sunday to Monday (+1 day)
-- This aligns all weeks with Sellerboard's Monday-Sunday week boundaries
UPDATE "SalesWeek" sw
SET "weekDate" = sw."weekDate" + INTERVAL '1 day'
FROM "Strategy" s
WHERE sw."strategyId" = s.id
  AND s.region = 'US';

-- Also shift ProfitAndLossWeek weekDates for US region strategies
UPDATE "ProfitAndLossWeek" plw
SET "weekDate" = plw."weekDate" + INTERVAL '1 day'
FROM "Strategy" s
WHERE plw."strategyId" = s.id
  AND s.region = 'US';

-- Also shift CashFlowWeek weekDates for US region strategies
UPDATE "CashFlowWeek" cfw
SET "weekDate" = cfw."weekDate" + INTERVAL '1 day'
FROM "Strategy" s
WHERE cfw."strategyId" = s.id
  AND s.region = 'US';
