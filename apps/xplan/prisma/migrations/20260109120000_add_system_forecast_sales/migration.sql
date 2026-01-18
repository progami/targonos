-- Add system forecast fields to sales planning.

ALTER TABLE "SalesWeek"
ADD COLUMN "systemForecastSales" INTEGER,
ADD COLUMN "systemForecastVersion" VARCHAR(64);

