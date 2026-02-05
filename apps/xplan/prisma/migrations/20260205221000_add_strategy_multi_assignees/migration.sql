-- CreateTable
CREATE TABLE "StrategyAssignee" (
  "id" TEXT NOT NULL,
  "strategyId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "assigneeEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StrategyAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyAssignee_strategyId_assigneeId_key" ON "StrategyAssignee"("strategyId", "assigneeId");
CREATE INDEX "StrategyAssignee_strategyId_idx" ON "StrategyAssignee"("strategyId");
CREATE INDEX "StrategyAssignee_assigneeId_idx" ON "StrategyAssignee"("assigneeId");
CREATE INDEX "StrategyAssignee_assigneeEmail_idx" ON "StrategyAssignee"("assigneeEmail");

-- AddForeignKey
ALTER TABLE "StrategyAssignee"
ADD CONSTRAINT "StrategyAssignee_strategyId_fkey"
FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single assignee values into the new table.
INSERT INTO "StrategyAssignee" ("id", "strategyId", "assigneeId", "assigneeEmail", "createdAt")
SELECT
  CONCAT('sa_', MD5(CONCAT("id", ':', "assigneeId"))),
  "id",
  "assigneeId",
  LOWER(TRIM("assigneeEmail")),
  NOW()
FROM "Strategy"
WHERE "assigneeId" IS NOT NULL
  AND TRIM("assigneeId") <> ''
  AND "assigneeEmail" IS NOT NULL
  AND TRIM("assigneeEmail") <> ''
ON CONFLICT ("strategyId", "assigneeId") DO NOTHING;
