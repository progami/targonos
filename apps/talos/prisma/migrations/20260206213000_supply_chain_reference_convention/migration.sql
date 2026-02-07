ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "sku_group" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "sku_group" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "lot_ref" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "production_date" date;

WITH sku_reference_groups AS (
  SELECT
    pol."sku_code",
    upper(substring(coalesce(po."po_number", po."order_number") FROM '^(?:INV|PO)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$')) AS "sku_group",
    COUNT(*) AS usage_count,
    MAX(po."created_at") AS last_used_at
  FROM "purchase_order_lines" pol
  JOIN "purchase_orders" po
    ON po."id" = pol."purchase_order_id"
  GROUP BY
    pol."sku_code",
    upper(substring(coalesce(po."po_number", po."order_number") FROM '^(?:INV|PO)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$'))
),
best_sku_group AS (
  SELECT DISTINCT ON ("sku_code")
    "sku_code",
    "sku_group"
  FROM sku_reference_groups
  WHERE "sku_group" IS NOT NULL
  ORDER BY "sku_code", usage_count DESC, last_used_at DESC
)
UPDATE "skus" s
SET "sku_group" = b."sku_group"
FROM best_sku_group b
WHERE s."sku_code" = b."sku_code"
  AND s."sku_group" IS NULL;

UPDATE "skus"
SET "sku_group" = 'CDS'
WHERE "sku_group" IS NULL
  AND upper("sku_code") LIKE '%CDS%';

UPDATE "skus"
SET "sku_group" = 'PDS'
WHERE "sku_group" IS NULL
  AND upper("sku_code") LIKE 'CS%';

UPDATE "purchase_orders"
SET "sku_group" = upper(substring(coalesce("po_number", "order_number") FROM '^(?:INV|PO)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$'))
WHERE "sku_group" IS NULL
  AND upper(substring(coalesce("po_number", "order_number") FROM '^(?:INV|PO)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$')) IS NOT NULL;

WITH order_line_groups AS (
  SELECT
    pol."purchase_order_id",
    MIN(s."sku_group") AS "sku_group",
    COUNT(DISTINCT s."sku_group") AS group_count
  FROM "purchase_order_lines" pol
  JOIN "skus" s
    ON s."sku_code" = pol."sku_code"
  WHERE s."sku_group" IS NOT NULL
  GROUP BY pol."purchase_order_id"
)
UPDATE "purchase_orders" po
SET "sku_group" = olg."sku_group"
FROM order_line_groups olg
WHERE po."id" = olg."purchase_order_id"
  AND po."sku_group" IS NULL
  AND olg.group_count = 1;

WITH order_seed AS (
  SELECT
    po."id" AS "purchase_order_id",
    COALESCE(
      NULLIF(po."sku_group", ''),
      upper(substring(coalesce(po."po_number", po."order_number") FROM '^(?:INV|PO)-[0-9]+[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$'))
    ) AS "sku_group",
    NULLIF(substring(coalesce(po."po_number", po."order_number") FROM '^(?:INV|PO)-([0-9]+)[A-Z]?-[A-Z0-9]+(?:-[A-Z]{2})?$'), '') AS "sequence_text"
  FROM "purchase_orders" po
)
UPDATE "purchase_order_lines" pol
SET "lot_ref" = format(
  'Lot-%s-%s-%s',
  (seed."sequence_text")::integer,
  seed."sku_group",
  upper(regexp_replace(pol."sku_code", '[^A-Za-z0-9]', '', 'g'))
)
FROM order_seed seed
WHERE pol."purchase_order_id" = seed."purchase_order_id"
  AND seed."sku_group" IS NOT NULL
  AND seed."sequence_text" IS NOT NULL;

CREATE OR REPLACE VIEW "lot" AS
SELECT
  pol."purchase_order_id" AS "po_id",
  s."id" AS "sku_id",
  pol."lot_ref" AS "lot_ref",
  pol."units_ordered" AS "qty_units",
  pol."units_per_carton",
  pol."quantity" AS "cartons",
  pol."unit_cost",
  pol."pi_number" AS "pi_ref",
  pol."production_date"::date AS "production_date",
  pol."status"::text AS "status"
FROM "purchase_order_lines" pol
LEFT JOIN "skus" s
  ON s."sku_code" = pol."sku_code";
