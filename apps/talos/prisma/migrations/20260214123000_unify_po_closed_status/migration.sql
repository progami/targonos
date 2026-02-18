-- Unify terminal purchase-order workflow statuses into CLOSED.
-- REJECTED and CANCELLED remain enum values for legacy compatibility only.

UPDATE "purchase_orders"
SET "status" = 'CLOSED'
WHERE "status" IN ('REJECTED', 'CANCELLED');
