-- Remove ARCHIVED, REJECTED, and CANCELLED statuses from X-Plan.
-- These statuses are not used in WMS and cause confusion.
-- Convert any existing POs with these statuses to SHIPPED.

UPDATE "PurchaseOrder"
SET "status" = 'SHIPPED'
WHERE "status" IN ('ARCHIVED', 'REJECTED', 'CANCELLED');
