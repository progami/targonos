-- Normalize the seeded default strategy so it behaves like any other strategy.
-- This keeps existing migrated data intact while removing the special "default" flag/name.

UPDATE "Strategy"
SET
  "isDefault" = FALSE,
  "name" = CASE WHEN "name" = 'Default Strategy' THEN 'Strategy' ELSE "name" END,
  "description" = CASE
    WHEN "description" = 'Default strategy for existing data' THEN NULL
    ELSE "description"
  END
WHERE "id" = 'default-strategy';

