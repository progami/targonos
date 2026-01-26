-- Remove unused PO line product number field
ALTER TABLE "purchase_order_lines" DROP COLUMN "product_number";
