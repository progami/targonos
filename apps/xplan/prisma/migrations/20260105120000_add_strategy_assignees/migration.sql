-- AlterTable
ALTER TABLE "Strategy"
ADD COLUMN "createdById" TEXT,
ADD COLUMN "createdByEmail" TEXT,
ADD COLUMN "assigneeId" TEXT,
ADD COLUMN "assigneeEmail" TEXT;

-- CreateIndex
CREATE INDEX "Strategy_createdById_idx" ON "Strategy"("createdById");
CREATE INDEX "Strategy_createdByEmail_idx" ON "Strategy"("createdByEmail");
CREATE INDEX "Strategy_assigneeId_idx" ON "Strategy"("assigneeId");
CREATE INDEX "Strategy_assigneeEmail_idx" ON "Strategy"("assigneeEmail");

