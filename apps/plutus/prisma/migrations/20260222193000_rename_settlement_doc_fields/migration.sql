-- Rename legacy settlement fields away from old integration naming.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SettlementProcessing'
      AND column_name = 'lmbDocNumber'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'SettlementProcessing'
        AND column_name = 'settlementDocNumber'
    ) THEN
      RAISE EXCEPTION 'Both lmbDocNumber and settlementDocNumber exist on SettlementProcessing';
    END IF;

    EXECUTE 'ALTER TABLE "SettlementProcessing" RENAME COLUMN "lmbDocNumber" TO "settlementDocNumber"';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SettlementProcessing'
      AND column_name = 'lmbPostedDate'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'SettlementProcessing'
        AND column_name = 'settlementPostedDate'
    ) THEN
      RAISE EXCEPTION 'Both lmbPostedDate and settlementPostedDate exist on SettlementProcessing';
    END IF;

    EXECUTE 'ALTER TABLE "SettlementProcessing" RENAME COLUMN "lmbPostedDate" TO "settlementPostedDate"';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SettlementRollback'
      AND column_name = 'lmbDocNumber'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'SettlementRollback'
        AND column_name = 'settlementDocNumber'
    ) THEN
      RAISE EXCEPTION 'Both lmbDocNumber and settlementDocNumber exist on SettlementRollback';
    END IF;

    EXECUTE 'ALTER TABLE "SettlementRollback" RENAME COLUMN "lmbDocNumber" TO "settlementDocNumber"';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SettlementRollback'
      AND column_name = 'lmbPostedDate'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'SettlementRollback'
        AND column_name = 'settlementPostedDate'
    ) THEN
      RAISE EXCEPTION 'Both lmbPostedDate and settlementPostedDate exist on SettlementRollback';
    END IF;

    EXECUTE 'ALTER TABLE "SettlementRollback" RENAME COLUMN "lmbPostedDate" TO "settlementPostedDate"';
END IF;
END $$;
