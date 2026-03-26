-- Add billing_config JSON column to warehouses for warehouse-specific billing rules.
-- Example: { "storageBillingModel": "WEEKLY_ARRIVAL_CUTOFF", "cutoffHour": 12, "halfWeekRate": 1.95, "fullWeekRate": 3.90 }

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "billing_config" JSONB;
