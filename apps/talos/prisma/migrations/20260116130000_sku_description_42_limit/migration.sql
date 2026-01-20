-- Truncate existing descriptions to 42 characters
UPDATE skus SET description = LEFT(description, 42) WHERE LENGTH(description) > 42;

-- Alter column to VarChar(42)
ALTER TABLE skus ALTER COLUMN description TYPE VARCHAR(42);
