/*
  Argus v2: ASIN-only monitoring + attention acknowledgements

  - Hard delete non-ASIN targets (SEARCH / BROWSE_BESTSELLERS)
  - Remove WatchTarget.type and other non-ASIN fields
  - Reduce ArtifactKind enum to ASIN_FULLPAGE only
  - Enforce one AlertRule per target (unique)
  - Add acknowledgement fields for Attention workflow
*/

-- 1) Delete non-ASIN targets and any dependent rows that would block cascades.
DELETE FROM "AlertEvent" ae
USING "AlertRule" ar, "WatchTarget" t
WHERE ae."ruleId" = ar.id
  AND ar."targetId" = t.id
  AND t."type" <> 'ASIN';

DELETE FROM "AlertEvent" ae
USING "CaptureRun" r, "WatchTarget" t
WHERE ae."runId" = r.id
  AND r."targetId" = t.id
  AND t."type" <> 'ASIN';

DELETE FROM "WatchTarget"
WHERE "type" <> 'ASIN';

-- Remove any malformed ASIN targets before making asin NOT NULL.
DELETE FROM "WatchTarget"
WHERE "type" = 'ASIN' AND "asin" IS NULL;

UPDATE "WatchTarget"
SET "asin" = UPPER("asin")
WHERE "asin" IS NOT NULL;

-- 2) Enforce one AlertRule per target: keep the newest rule per targetId.
DELETE FROM "AlertRule"
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "targetId"
        ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
      ) AS rn
    FROM "AlertRule"
  ) ranked
  WHERE ranked.rn > 1
);

-- 3) Clean up ArtifactKind usage prior to enum shrink.
DELETE FROM "RunArtifact"
WHERE "kind" <> 'ASIN_FULLPAGE';

-- 4) Add acknowledgement fields for Attention.
ALTER TABLE "CaptureJob"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedByUserId" TEXT,
  ADD COLUMN "acknowledgedByEmail" TEXT;

ALTER TABLE "CaptureRun"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedByUserId" TEXT,
  ADD COLUMN "acknowledgedByEmail" TEXT;

ALTER TABLE "AlertEvent"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedByUserId" TEXT,
  ADD COLUMN "acknowledgedByEmail" TEXT;

-- 5) Drop non-ASIN WatchTarget schema.
DROP INDEX IF EXISTS "WatchTarget_type_idx";
DROP INDEX IF EXISTS "WatchTarget_marketplace_type_asin_key";
DROP INDEX IF EXISTS "WatchTarget_marketplace_type_keyword_key";
DROP INDEX IF EXISTS "WatchTarget_marketplace_type_sourceUrl_key";

ALTER TABLE "WatchTarget"
  DROP COLUMN "type",
  DROP COLUMN "keyword",
  DROP COLUMN "trackedAsins",
  DROP COLUMN "sourceUrl",
  DROP COLUMN "browseNodeId";

ALTER TABLE "WatchTarget"
  ALTER COLUMN "asin" SET NOT NULL;

CREATE UNIQUE INDEX "WatchTarget_marketplace_asin_key" ON "WatchTarget"("marketplace", "asin");
CREATE INDEX "WatchTarget_source_idx" ON "WatchTarget"("source");

-- 6) AlertRule: enforce one-per-target.
DROP INDEX IF EXISTS "AlertRule_targetId_idx";
CREATE UNIQUE INDEX "AlertRule_targetId_key" ON "AlertRule"("targetId");

-- 7) Shrink enums to ASIN-only.
ALTER TYPE "ArtifactKind" RENAME TO "ArtifactKind_old";
CREATE TYPE "ArtifactKind" AS ENUM ('ASIN_FULLPAGE');
ALTER TABLE "RunArtifact"
  ALTER COLUMN "kind" TYPE "ArtifactKind"
  USING ("kind"::text::"ArtifactKind");
DROP TYPE "ArtifactKind_old";

DROP TYPE "WatchTargetType";

