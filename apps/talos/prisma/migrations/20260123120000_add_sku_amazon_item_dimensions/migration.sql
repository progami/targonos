-- Store Amazon catalog item (unpackaged) dimensions on SKU records.
ALTER TABLE "skus" ADD COLUMN "amazon_item_dimensions_cm" TEXT;
ALTER TABLE "skus" ADD COLUMN "amazon_item_side1_cm" DECIMAL(8, 2);
ALTER TABLE "skus" ADD COLUMN "amazon_item_side2_cm" DECIMAL(8, 2);
ALTER TABLE "skus" ADD COLUMN "amazon_item_side3_cm" DECIMAL(8, 2);
ALTER TABLE "skus" ADD COLUMN "amazon_item_weight_kg" DECIMAL(8, 3);
