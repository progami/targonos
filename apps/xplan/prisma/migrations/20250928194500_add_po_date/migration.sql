-- Guard against re-running after the column moved into earlier snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'PurchaseOrder'
      AND column_name = 'poDate'
  ) THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "poDate" TIMESTAMP(3);
  END IF;
END
$$;
