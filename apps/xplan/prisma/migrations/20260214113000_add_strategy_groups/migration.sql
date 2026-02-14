-- CreateTable
CREATE TABLE "StrategyGroup" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" "StrategyRegion" NOT NULL DEFAULT 'US',
  "createdById" TEXT,
  "createdByEmail" TEXT,
  "assigneeId" TEXT,
  "assigneeEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StrategyGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Strategy" ADD COLUMN "strategyGroupId" TEXT;

-- Backfill one strategy group per existing strategy.
-- This preserves all current strategy data while introducing the group/scenario model.
CREATE TEMP TABLE "__strategy_group_map" AS
SELECT
  s."id" AS "strategyId",
  CONCAT('sg_', MD5(s."id")) AS "groupId",
  CASE
    WHEN NULLIF(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER(TRIM(s."name")), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ) IS NULL
      THEN CONCAT('group-', SUBSTRING(MD5(s."id") FROM 1 FOR 8))
    ELSE NULLIF(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER(TRIM(s."name")), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    )
  END AS "baseCode",
  s."name" AS "groupName",
  s."region" AS "groupRegion",
  s."createdById" AS "createdById",
  s."createdByEmail" AS "createdByEmail",
  s."assigneeId" AS "assigneeId",
  s."assigneeEmail" AS "assigneeEmail",
  s."createdAt" AS "createdAt"
FROM "Strategy" s;

CREATE TEMP TABLE "__strategy_group_ranked" AS
SELECT
  m.*,
  ROW_NUMBER() OVER (
    PARTITION BY m."groupRegion", m."baseCode"
    ORDER BY m."createdAt", m."strategyId"
  ) AS "codeRank"
FROM "__strategy_group_map" m;

INSERT INTO "StrategyGroup" (
  "id",
  "code",
  "name",
  "region",
  "createdById",
  "createdByEmail",
  "assigneeId",
  "assigneeEmail",
  "createdAt",
  "updatedAt"
)
SELECT
  r."groupId",
  CASE
    WHEN r."codeRank" = 1 THEN r."baseCode"
    ELSE CONCAT(r."baseCode", '-', r."codeRank")
  END AS "code",
  r."groupName",
  r."groupRegion",
  r."createdById",
  r."createdByEmail",
  r."assigneeId",
  r."assigneeEmail",
  r."createdAt",
  NOW()
FROM "__strategy_group_ranked" r;

UPDATE "Strategy" s
SET
  "strategyGroupId" = r."groupId",
  "isPrimary" = TRUE
FROM "__strategy_group_ranked" r
WHERE r."strategyId" = s."id";

DROP TABLE "__strategy_group_ranked";
DROP TABLE "__strategy_group_map";

ALTER TABLE "Strategy" ALTER COLUMN "strategyGroupId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StrategyGroup_region_code_key" ON "StrategyGroup"("region", "code");
CREATE INDEX "StrategyGroup_region_idx" ON "StrategyGroup"("region");
CREATE INDEX "StrategyGroup_createdById_idx" ON "StrategyGroup"("createdById");
CREATE INDEX "StrategyGroup_createdByEmail_idx" ON "StrategyGroup"("createdByEmail");
CREATE INDEX "StrategyGroup_assigneeId_idx" ON "StrategyGroup"("assigneeId");
CREATE INDEX "StrategyGroup_assigneeEmail_idx" ON "StrategyGroup"("assigneeEmail");

CREATE UNIQUE INDEX "Strategy_strategyGroupId_name_key" ON "Strategy"("strategyGroupId", "name");
CREATE INDEX "Strategy_strategyGroupId_idx" ON "Strategy"("strategyGroupId");
CREATE INDEX "Strategy_strategyGroupId_isPrimary_idx" ON "Strategy"("strategyGroupId", "isPrimary");

-- Enforce one primary scenario per strategy group.
CREATE UNIQUE INDEX "Strategy_primary_per_group_key"
ON "Strategy"("strategyGroupId")
WHERE "isPrimary" = TRUE;

-- AddForeignKey
ALTER TABLE "Strategy"
ADD CONSTRAINT "Strategy_strategyGroupId_fkey"
FOREIGN KEY ("strategyGroupId") REFERENCES "StrategyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
