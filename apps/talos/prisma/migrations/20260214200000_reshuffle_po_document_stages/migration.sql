-- Reshuffle PO document stages: move documents one stage earlier.
--
-- box_artwork_*       : MANUFACTURING -> ISSUED
-- packing_list        : OCEAN         -> MANUFACTURING
-- bill_of_lading      : OCEAN         -> MANUFACTURING
-- commercial_invoice  : OCEAN         -> MANUFACTURING
-- grn                 : WAREHOUSE     -> OCEAN
-- custom_declaration  : WAREHOUSE     -> OCEAN
--
-- Unchanged: inspection_report (stays MANUFACTURING), grs_tc (stays OCEAN),
--            pi_* docs (stay ISSUED).
--
-- Safety: skip rows where the target (purchaseOrderId, stage, documentType)
-- already exists to avoid unique constraint violations.

-- 1. box_artwork_* : MANUFACTURING -> ISSUED
UPDATE "purchase_order_documents" d
SET "stage" = 'ISSUED'
WHERE d."stage" = 'MANUFACTURING'
  AND (d."document_type" = 'box_artwork' OR d."document_type" LIKE 'box_artwork_%')
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'ISSUED'
      AND e."document_type" = d."document_type"
  );

-- 2. packing_list : OCEAN -> MANUFACTURING
UPDATE "purchase_order_documents" d
SET "stage" = 'MANUFACTURING'
WHERE d."stage" = 'OCEAN'
  AND d."document_type" = 'packing_list'
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'MANUFACTURING'
      AND e."document_type" = d."document_type"
  );

-- 3. bill_of_lading : OCEAN -> MANUFACTURING
UPDATE "purchase_order_documents" d
SET "stage" = 'MANUFACTURING'
WHERE d."stage" = 'OCEAN'
  AND d."document_type" = 'bill_of_lading'
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'MANUFACTURING'
      AND e."document_type" = d."document_type"
  );

-- 4. commercial_invoice : OCEAN -> MANUFACTURING
UPDATE "purchase_order_documents" d
SET "stage" = 'MANUFACTURING'
WHERE d."stage" = 'OCEAN'
  AND d."document_type" = 'commercial_invoice'
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'MANUFACTURING'
      AND e."document_type" = d."document_type"
  );

-- 5. grn : WAREHOUSE -> OCEAN
UPDATE "purchase_order_documents" d
SET "stage" = 'OCEAN'
WHERE d."stage" = 'WAREHOUSE'
  AND d."document_type" = 'grn'
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'OCEAN'
      AND e."document_type" = d."document_type"
  );

-- 6. custom_declaration : WAREHOUSE -> OCEAN
UPDATE "purchase_order_documents" d
SET "stage" = 'OCEAN'
WHERE d."stage" = 'WAREHOUSE'
  AND d."document_type" = 'custom_declaration'
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_order_documents" e
    WHERE e."purchase_order_id" = d."purchase_order_id"
      AND e."stage" = 'OCEAN'
      AND e."document_type" = d."document_type"
  );
