-- Seed known strategy assignees by email.
-- We intentionally clear assigneeId to avoid mismatched user IDs granting access.

UPDATE "Strategy"
SET
  "assigneeEmail" = 'hamadkhan@targonglobal.com',
  "assigneeId" = NULL,
  "updatedAt" = NOW()
WHERE "name" = 'Q1 2026 - PDS - UK';

UPDATE "Strategy"
SET
  "assigneeEmail" = 'mehdi@targonglobal.com',
  "assigneeId" = NULL,
  "updatedAt" = NOW()
WHERE "name" = 'S1 2026 - PDS - US';

UPDATE "Strategy"
SET
  "assigneeEmail" = 'imran@targonglobal.com',
  "assigneeId" = NULL,
  "updatedAt" = NOW()
WHERE "name" = 'Q1 2026 - SB';

