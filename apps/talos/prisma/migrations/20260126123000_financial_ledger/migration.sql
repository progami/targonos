-- Financial ledger (unifies StorageLedger + CostLedger into one money ledger)

CREATE TYPE "FinancialLedgerSourceType" AS ENUM ('COST_LEDGER', 'STORAGE_LEDGER', 'MANUAL');
CREATE TYPE "FinancialLedgerCategory" AS ENUM (
  'Inbound',
  'Storage',
  'Outbound',
  'Forwarding',
  'Product',
  'Duty',
  'Adjustment',
  'SupplierCredit',
  'SupplierDebit',
  'Other'
);

CREATE TABLE "financial_ledger" (
  "id" TEXT NOT NULL,
  "source_type" "FinancialLedgerSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "category" "FinancialLedgerCategory" NOT NULL,
  "cost_name" TEXT NOT NULL,
  "quantity" DECIMAL(14, 4),
  "unit_rate" DECIMAL(14, 4),
  "amount" DECIMAL(14, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "warehouse_code" TEXT NOT NULL,
  "warehouse_name" TEXT NOT NULL,
  "sku_code" TEXT,
  "sku_description" TEXT,
  "batch_lot" TEXT,
  "inventory_transaction_id" TEXT,
  "storage_ledger_id" TEXT,
  "purchase_order_id" TEXT,
  "purchase_order_line_id" TEXT,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_name" TEXT NOT NULL,
  "notes" TEXT,

  CONSTRAINT "financial_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_ledger_source_type_source_id_key"
  ON "financial_ledger"("source_type", "source_id");
CREATE INDEX "financial_ledger_warehouse_code_idx" ON "financial_ledger"("warehouse_code");
CREATE INDEX "financial_ledger_category_idx" ON "financial_ledger"("category");
CREATE INDEX "financial_ledger_effective_at_idx" ON "financial_ledger"("effective_at");
CREATE INDEX "financial_ledger_purchase_order_id_idx" ON "financial_ledger"("purchase_order_id");

ALTER TABLE "financial_ledger"
  ADD CONSTRAINT "financial_ledger_inventory_transaction_id_fkey"
  FOREIGN KEY ("inventory_transaction_id") REFERENCES "inventory_transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_ledger"
  ADD CONSTRAINT "financial_ledger_storage_ledger_id_fkey"
  FOREIGN KEY ("storage_ledger_id") REFERENCES "storage_ledger"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_ledger"
  ADD CONSTRAINT "financial_ledger_purchase_order_id_fkey"
  FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_ledger"
  ADD CONSTRAINT "financial_ledger_purchase_order_line_id_fkey"
  FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from CostLedger
INSERT INTO "financial_ledger" (
  "id",
  "source_type",
  "source_id",
  "category",
  "cost_name",
  "quantity",
  "unit_rate",
  "amount",
  "currency",
  "warehouse_code",
  "warehouse_name",
  "sku_code",
  "sku_description",
  "batch_lot",
  "inventory_transaction_id",
  "purchase_order_id",
  "purchase_order_line_id",
  "effective_at",
  "created_at",
  "created_by_name"
)
SELECT
  cl."id",
  'COST_LEDGER',
  cl."id"::text,
  CASE cl."cost_category"
    WHEN 'Inbound' THEN 'Inbound'
    WHEN 'Storage' THEN 'Storage'
    WHEN 'Outbound' THEN 'Outbound'
    WHEN 'Forwarding' THEN 'Forwarding'
    ELSE 'Other'
  END::"FinancialLedgerCategory",
  cl."cost_name",
  cl."quantity",
  cl."unit_rate",
  cl."total_cost",
  'USD',
  cl."warehouse_code",
  cl."warehouse_name",
  tx."sku_code",
  tx."sku_description",
  tx."batch_lot",
  cl."transaction_id",
  tx."purchase_order_id",
  tx."purchase_order_line_id",
  cl."created_at",
  cl."created_at",
  cl."created_by_name"
FROM "cost_ledger" cl
JOIN "inventory_transactions" tx ON tx."id" = cl."transaction_id"
ON CONFLICT ("source_type", "source_id") DO NOTHING;

-- Backfill from StorageLedger (only rows with calculated cost)
INSERT INTO "financial_ledger" (
  "id",
  "source_type",
  "source_id",
  "category",
  "cost_name",
  "quantity",
  "unit_rate",
  "amount",
  "currency",
  "warehouse_code",
  "warehouse_name",
  "sku_code",
  "sku_description",
  "batch_lot",
  "storage_ledger_id",
  "effective_at",
  "created_at",
  "created_by_name"
)
SELECT
  sl."id",
  'STORAGE_LEDGER',
  sl."storage_ledger_id",
  'Storage',
  'Storage',
  sl."pallet_days"::decimal,
  sl."storage_rate_per_pallet_day",
  sl."total_storage_cost",
  'USD',
  sl."warehouse_code",
  sl."warehouse_name",
  sl."sku_code",
  sl."sku_description",
  sl."batch_lot",
  sl."id",
  sl."week_ending_date"::timestamp,
  sl."created_at",
  sl."created_by_name"
FROM "storage_ledger" sl
WHERE sl."total_storage_cost" IS NOT NULL
ON CONFLICT ("source_type", "source_id") DO NOTHING;
