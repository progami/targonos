-- Restore seeded US strategies in case they were removed from the main schema.
--
-- These strategy IDs are referenced across the team and are used for access control. The insert is
-- idempotent so it is safe to run in all environments.

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
    'DRAFT',
    'US',
    FALSE,
    TIMESTAMP '2025-12-23 18:19:29.43',
    NOW(),
    'user-jarrar',
    'jarrar@targonglobal.com',
    'mehdi@targonglobal.com'
  ),
  (
    'cmjrp4vjf0000xv08neh5loe3',
    'Q1 2026 - SB',
    NULL,
    'DRAFT',
    'US',
    FALSE,
    TIMESTAMP '2025-12-29 21:54:39.147',
    NOW(),
    'user-jarrar',
    'jarrar@targonglobal.com',
    'imran@targonglobal.com'
  )
ON CONFLICT ("id") DO NOTHING;
