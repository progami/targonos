-- Seed a global demo strategy and make it the sole default.
--
-- The default strategy is used when no `strategy` query param is provided. It should never
-- point at a real planning strategy seeded for a specific person/team.

UPDATE "Strategy"
SET
  "isDefault" = FALSE,
  "updatedAt" = NOW()
WHERE "isDefault" = TRUE
  AND "id" <> 'demo-strategy';

INSERT INTO "Strategy" (
  "id",
  "name",
  "description",
  "status",
  "region",
  "isDefault",
  "createdAt",
  "updatedAt"
)
VALUES (
  'demo-strategy',
  'Demo Strategy',
  'Demo strategy for exploring X-Plan without using real planning data.',
  'DRAFT',
  'US',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = EXCLUDED."status",
  "region" = EXCLUDED."region",
  "isDefault" = TRUE,
  "updatedAt" = NOW();

