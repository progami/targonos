-- Drop and recreate foreign key on PurchaseOrder.productId with CASCADE
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_productId_fkey";
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop and recreate foreign key on BatchTableRow.productId with CASCADE
ALTER TABLE "BatchTableRow" DROP CONSTRAINT IF EXISTS "BatchTableRow_productId_fkey";
ALTER TABLE "BatchTableRow" ADD CONSTRAINT "BatchTableRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
