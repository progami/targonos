-- Store Amazon item package dimensions at batch level (used for FBA size tier)
ALTER TABLE "sku_batches"
  ADD COLUMN "amazon_item_package_dimensions_cm" text,
  ADD COLUMN "amazon_item_package_side1_cm" numeric(8, 2),
  ADD COLUMN "amazon_item_package_side2_cm" numeric(8, 2),
  ADD COLUMN "amazon_item_package_side3_cm" numeric(8, 2);

