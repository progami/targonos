DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'PurchaseOrder'
      AND column_name = 'sourcePrepWeeks'
  ) THEN
    ALTER TABLE "PurchaseOrder" RENAME COLUMN "sourcePrepWeeks" TO "sourceWeeks";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'PurchaseOrder'
      AND column_name = 'finalMileWeeks'
  ) THEN
    ALTER TABLE "PurchaseOrder" RENAME COLUMN "finalMileWeeks" TO "finalWeeks";
  END IF;
END
$$;
