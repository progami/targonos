-- Align X-Plan purchase order statuses with Talos workflow statuses.
--
-- NOTE:
-- Postgres requires new enum values to be committed before they can be referenced in UPDATE/ALTER TABLE.
-- This migration only adds the enum values; data backfill + default updates live in the next migration.

ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ISSUED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'MANUFACTURING';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'OCEAN';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
