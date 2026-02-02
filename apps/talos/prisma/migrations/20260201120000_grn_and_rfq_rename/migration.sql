-- Rename RFQ stage enum values (previously misused DRAFT)
ALTER TYPE "PurchaseOrderStatus" RENAME VALUE 'DRAFT' TO 'RFQ';
ALTER TYPE "PurchaseOrderDocumentStage" RENAME VALUE 'DRAFT' TO 'RFQ';

-- Rename approval-tracking columns (draft -> rfq)
ALTER TABLE "purchase_orders" RENAME COLUMN "draft_approved_at" TO "rfq_approved_at";
ALTER TABLE "purchase_orders" RENAME COLUMN "draft_approved_by_id" TO "rfq_approved_by_id";
ALTER TABLE "purchase_orders" RENAME COLUMN "draft_approved_by_name" TO "rfq_approved_by_name";

-- Normalize PO document types (movement note / delivery note -> grn)
UPDATE "purchase_order_documents"
SET "document_type" = 'grn'
WHERE "document_type" IN ('movement_note', 'delivery_note', 'movementNote', 'deliveryNote');

-- Normalize inventory transaction attachment keys (movement note / delivery note -> grn)
-- Only affects JSON objects; leaves arrays untouched.
UPDATE "inventory_transactions"
SET "attachments" = CASE
  WHEN "attachments" ? 'grn' THEN "attachments" - 'movement_note'
  ELSE ("attachments" - 'movement_note') || jsonb_build_object('grn', "attachments"->'movement_note')
END
WHERE "attachments" IS NOT NULL
  AND jsonb_typeof("attachments") = 'object'
  AND "attachments" ? 'movement_note';

UPDATE "inventory_transactions"
SET "attachments" = CASE
  WHEN "attachments" ? 'grn' THEN "attachments" - 'movementNote'
  ELSE ("attachments" - 'movementNote') || jsonb_build_object('grn', "attachments"->'movementNote')
END
WHERE "attachments" IS NOT NULL
  AND jsonb_typeof("attachments") = 'object'
  AND "attachments" ? 'movementNote';

UPDATE "inventory_transactions"
SET "attachments" = CASE
  WHEN "attachments" ? 'grn' THEN "attachments" - 'delivery_note'
  ELSE ("attachments" - 'delivery_note') || jsonb_build_object('grn', "attachments"->'delivery_note')
END
WHERE "attachments" IS NOT NULL
  AND jsonb_typeof("attachments") = 'object'
  AND "attachments" ? 'delivery_note';

UPDATE "inventory_transactions"
SET "attachments" = CASE
  WHEN "attachments" ? 'grn' THEN "attachments" - 'deliveryNote'
  ELSE ("attachments" - 'deliveryNote') || jsonb_build_object('grn', "attachments"->'deliveryNote')
END
WHERE "attachments" IS NOT NULL
  AND jsonb_typeof("attachments") = 'object'
  AND "attachments" ? 'deliveryNote';

