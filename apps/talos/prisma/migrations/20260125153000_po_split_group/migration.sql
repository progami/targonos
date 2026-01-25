-- Add PO split tracking + carton range fields for split shipments.

ALTER TABLE "purchase_orders" ADD COLUMN "split_group_id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "split_parent_id" TEXT;

CREATE INDEX IF NOT EXISTS "purchase_orders_split_group_id_idx" ON "purchase_orders"("split_group_id");

ALTER TABLE "purchase_order_lines" ADD COLUMN "carton_range_start" INTEGER;
ALTER TABLE "purchase_order_lines" ADD COLUMN "carton_range_end" INTEGER;
ALTER TABLE "purchase_order_lines" ADD COLUMN "carton_range_total" INTEGER;

