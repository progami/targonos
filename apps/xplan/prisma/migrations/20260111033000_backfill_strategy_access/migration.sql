-- Backfill strategy ownership + assignees for legacy data.
--
-- Earlier strategies were created before `createdBy*`/`assignee*` fields existed, which
-- makes them invisible once access control is enabled. This migration is idempotent and
-- only fills missing values.

-- 1) Ensure creator metadata exists for strategies missing it entirely.
UPDATE "Strategy"
SET
  "createdById" = 'user-jarrar',
  "createdByEmail" = 'jarrar@targonglobal.com',
  "updatedAt" = NOW()
WHERE "createdById" IS NULL AND "createdByEmail" IS NULL;

-- 2) If the seeded `default-strategy` still uses a placeholder label, normalize it to the UK strategy.
UPDATE "Strategy"
SET
  "name" = 'Q1 2026 - PDS - UK',
  "region" = 'UK',
  "updatedAt" = NOW()
WHERE "id" = 'default-strategy'
  AND ("name" = 'Default Strategy' OR "name" = 'Strategy')
  AND "region" = 'US';

-- 3) Seed known 2026 strategies by ID (safe in all environments).
INSERT INTO "Strategy" (
  "id",
  "name",
  "description",
  "status",
  "region",
  "isDefault",
  "createdAt",
  "updatedAt",
  "createdById",
  "createdByEmail",
  "assigneeEmail"
)
VALUES
  (
    'cmjiwt2c50000xv40iug75zzw',
    'Q1 2026 - PDS - USA',
    NULL,
    'ACTIVE',
    'US',
    FALSE,
    NOW(),
    NOW(),
    'user-jarrar',
    'jarrar@targonglobal.com',
    'mehdi@targonglobal.com'
  ),
  (
    'cmjrp4vjf0000xv08neh5loe3',
    'Q1 2026 - SB',
    NULL,
    'ACTIVE',
    'US',
    FALSE,
    NOW(),
    NOW(),
    'user-jarrar',
    'jarrar@targonglobal.com',
    'imran@targonglobal.com'
  )
ON CONFLICT ("id") DO NOTHING;

-- 4) Backfill missing assignee emails for the known strategies.
UPDATE "Strategy"
SET
  "assigneeEmail" = 'hamadkhan@targonglobal.com',
  "updatedAt" = NOW()
WHERE "id" = 'default-strategy'
  AND ("assigneeEmail" IS NULL OR TRIM("assigneeEmail") = '');

UPDATE "Strategy"
SET
  "assigneeEmail" = 'mehdi@targonglobal.com',
  "updatedAt" = NOW()
WHERE "id" = 'cmjiwt2c50000xv40iug75zzw'
  AND ("assigneeEmail" IS NULL OR TRIM("assigneeEmail") = '');

UPDATE "Strategy"
SET
  "assigneeEmail" = 'imran@targonglobal.com',
  "updatedAt" = NOW()
WHERE "id" = 'cmjrp4vjf0000xv08neh5loe3'
  AND ("assigneeEmail" IS NULL OR TRIM("assigneeEmail") = '');

