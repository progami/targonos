-- Global reference counter table for cross-tenant unique PO numbering.
-- This table intentionally lives in public so US/UK tenant schemas can share it.

CREATE TABLE IF NOT EXISTS "public"."global_reference_counters" (
  "counter_key" TEXT NOT NULL,
  "next_value" BIGINT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "global_reference_counters_pkey" PRIMARY KEY ("counter_key")
);

ALTER TABLE "public"."global_reference_counters"
  DROP CONSTRAINT IF EXISTS "global_reference_counters_next_value_check";
ALTER TABLE "public"."global_reference_counters"
  ADD CONSTRAINT "global_reference_counters_next_value_check"
  CHECK ("next_value" > 0);
