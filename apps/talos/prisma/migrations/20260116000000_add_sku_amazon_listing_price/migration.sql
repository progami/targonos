-- Store the Amazon listing price used for fee calculations (2026 tables depend on price bands).
ALTER TABLE "skus"
  ADD COLUMN "amazon_listing_price" numeric(12, 2);

