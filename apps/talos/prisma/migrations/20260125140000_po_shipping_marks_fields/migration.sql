-- Add RFQ-stage document support + Shipping Marks inputs.

ALTER TYPE "PurchaseOrderDocumentStage" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TABLE "purchase_orders" ADD COLUMN "rfq_pdf_generated_at" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "rfq_pdf_generated_by_id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "rfq_pdf_generated_by_name" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "po_pdf_generated_at" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "po_pdf_generated_by_id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "po_pdf_generated_by_name" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "shipping_marks_generated_at" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "shipping_marks_generated_by_id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "shipping_marks_generated_by_name" TEXT;

ALTER TABLE "purchase_order_lines" ADD COLUMN "pi_number" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "product_number" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "commodity_code" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "country_of_origin" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "net_weight_kg" DECIMAL(8, 3);
ALTER TABLE "purchase_order_lines" ADD COLUMN "material" TEXT;
