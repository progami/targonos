-- Add amazonItemPackage dimension fields to SKU table
ALTER TABLE "skus" ADD COLUMN "amazon_item_package_dimensions_cm" VARCHAR(120);
ALTER TABLE "skus" ADD COLUMN "amazon_item_package_side1_cm" DECIMAL(8,2);
ALTER TABLE "skus" ADD COLUMN "amazon_item_package_side2_cm" DECIMAL(8,2);
ALTER TABLE "skus" ADD COLUMN "amazon_item_package_side3_cm" DECIMAL(8,2);

-- Migrate data from sku_batches to skus
-- For each SKU, copy amazon item package dimensions from the batch that has non-null values
UPDATE "skus" s
SET 
  "amazon_item_package_dimensions_cm" = b."amazon_item_package_dimensions_cm",
  "amazon_item_package_side1_cm" = b."amazon_item_package_side1_cm",
  "amazon_item_package_side2_cm" = b."amazon_item_package_side2_cm",
  "amazon_item_package_side3_cm" = b."amazon_item_package_side3_cm"
FROM (
  SELECT DISTINCT ON (sku_id) 
    sku_id,
    amazon_item_package_dimensions_cm,
    amazon_item_package_side1_cm,
    amazon_item_package_side2_cm,
    amazon_item_package_side3_cm
  FROM "sku_batches"
  WHERE amazon_item_package_side1_cm IS NOT NULL
  ORDER BY sku_id, created_at DESC
) b
WHERE s.id = b.sku_id
  AND s."amazon_item_package_side1_cm" IS NULL;

-- Also migrate unit dimensions from batch to SKU if SKU doesn't have them
UPDATE "skus" s
SET 
  "unit_dimensions_cm" = COALESCE(s."unit_dimensions_cm", b."unit_dimensions_cm"),
  "unit_side1_cm" = COALESCE(s."unit_side1_cm", b."unit_side1_cm"),
  "unit_side2_cm" = COALESCE(s."unit_side2_cm", b."unit_side2_cm"),
  "unit_side3_cm" = COALESCE(s."unit_side3_cm", b."unit_side3_cm"),
  "unit_weight_kg" = COALESCE(s."unit_weight_kg", b."unit_weight_kg")
FROM (
  SELECT DISTINCT ON (sku_id) 
    sku_id,
    unit_dimensions_cm,
    unit_side1_cm,
    unit_side2_cm,
    unit_side3_cm,
    unit_weight_kg
  FROM "sku_batches"
  WHERE unit_side1_cm IS NOT NULL OR unit_weight_kg IS NOT NULL
  ORDER BY sku_id, created_at DESC
) b
WHERE s.id = b.sku_id;

-- Drop columns from sku_batches (dimensions now live on SKU only)
ALTER TABLE "sku_batches" DROP COLUMN "unit_dimensions_cm";
ALTER TABLE "sku_batches" DROP COLUMN "unit_side1_cm";
ALTER TABLE "sku_batches" DROP COLUMN "unit_side2_cm";
ALTER TABLE "sku_batches" DROP COLUMN "unit_side3_cm";
ALTER TABLE "sku_batches" DROP COLUMN "unit_weight_kg";
ALTER TABLE "sku_batches" DROP COLUMN "amazon_item_package_dimensions_cm";
ALTER TABLE "sku_batches" DROP COLUMN "amazon_item_package_side1_cm";
ALTER TABLE "sku_batches" DROP COLUMN "amazon_item_package_side2_cm";
ALTER TABLE "sku_batches" DROP COLUMN "amazon_item_package_side3_cm";
