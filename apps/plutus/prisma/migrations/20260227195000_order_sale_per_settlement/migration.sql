-- Allow the same order+SKU to appear across multiple settlements.
DROP INDEX IF EXISTS "OrderSale_marketplace_orderId_sku_key";

-- Keep idempotency per settlement while allowing cross-settlement accumulation.
CREATE UNIQUE INDEX IF NOT EXISTS "OrderSale_marketplace_orderId_sku_settlementProcessingId_key"
ON "OrderSale"("marketplace", "orderId", "sku", "settlementProcessingId");

-- Fast historical lookup for refund matching and replay.
CREATE INDEX IF NOT EXISTS "OrderSale_marketplace_orderId_sku_idx"
ON "OrderSale"("marketplace", "orderId", "sku");
