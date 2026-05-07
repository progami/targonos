DROP TABLE IF EXISTS "NotificationPreference";

ALTER TABLE "SetupConfig"
  DROP COLUMN IF EXISTS "autopostEnabled",
  DROP COLUMN IF EXISTS "autopostStartDate";
