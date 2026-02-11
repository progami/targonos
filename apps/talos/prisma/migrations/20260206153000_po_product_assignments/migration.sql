CREATE TABLE IF NOT EXISTS "po_product_assignments" (
  "user_email" TEXT NOT NULL,
  "sku_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_email" TEXT NOT NULL,
  CONSTRAINT "po_product_assignments_pkey" PRIMARY KEY ("user_email", "sku_code")
);

CREATE INDEX IF NOT EXISTS "po_product_assignments_user_email_idx"
  ON "po_product_assignments"("user_email");

CREATE INDEX IF NOT EXISTS "po_product_assignments_sku_code_idx"
  ON "po_product_assignments"("sku_code");
