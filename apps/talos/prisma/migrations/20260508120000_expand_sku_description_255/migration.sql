DROP VIEW IF EXISTS "sku";

ALTER TABLE skus ALTER COLUMN description TYPE VARCHAR(255);

CREATE OR REPLACE VIEW "sku" AS
SELECT
  s."id" AS "sku_id",
  s."sku_code",
  s."sku_group",
  s."asin",
  s."description",
  s."is_active",
  s."default_supplier_id",
  s."secondary_supplier_id",
  CASE
    WHEN s."carton_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side1_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_length_in",
  CASE
    WHEN s."carton_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side2_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_width_in",
  CASE
    WHEN s."carton_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."carton_side3_cm" / 2.54)::numeric, 4)
  END AS "ref_pkg_height_in",
  CASE
    WHEN s."carton_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."carton_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "ref_pkg_weight_lb",
  CASE
    WHEN s."item_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side1_cm" / 2.54)::numeric, 4)
  END AS "ref_item_length_in",
  CASE
    WHEN s."item_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side2_cm" / 2.54)::numeric, 4)
  END AS "ref_item_width_in",
  CASE
    WHEN s."item_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."item_side3_cm" / 2.54)::numeric, 4)
  END AS "ref_item_height_in",
  CASE
    WHEN s."item_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."item_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "ref_item_weight_lb",
  CASE
    WHEN s."amazon_item_package_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side1_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_length_in",
  CASE
    WHEN s."amazon_item_package_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side2_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_width_in",
  CASE
    WHEN s."amazon_item_package_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_package_side3_cm" / 2.54)::numeric, 4)
  END AS "amz_pkg_height_in",
  CASE
    WHEN s."amazon_reference_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."amazon_reference_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "amz_pkg_weight_lb",
  CASE
    WHEN s."amazon_item_side1_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side1_cm" / 2.54)::numeric, 4)
  END AS "amz_item_length_in",
  CASE
    WHEN s."amazon_item_side2_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side2_cm" / 2.54)::numeric, 4)
  END AS "amz_item_width_in",
  CASE
    WHEN s."amazon_item_side3_cm" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_side3_cm" / 2.54)::numeric, 4)
  END AS "amz_item_height_in",
  CASE
    WHEN s."amazon_item_weight_kg" IS NULL THEN NULL
    ELSE ROUND((s."amazon_item_weight_kg" * 2.2046226218)::numeric, 4)
  END AS "amz_item_weight_lb",
  s."category",
  s."subcategory",
  s."size_tier",
  s."referral_fee_percent" AS "referral_fee_pct",
  s."fba_fulfillment_fee"
FROM "skus" s;
