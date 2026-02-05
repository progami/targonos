-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('US', 'UK');

-- CreateEnum
CREATE TYPE "WatchTargetType" AS ENUM ('ASIN', 'SEARCH', 'BROWSE_BESTSELLERS');

-- CreateEnum
CREATE TYPE "WatchTargetOwner" AS ENUM ('OURS', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "WatchTargetSource" AS ENUM ('MANUAL', 'TALOS');

-- CreateEnum
CREATE TYPE "CaptureJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('ASIN_FULLPAGE', 'SEARCH_TOP', 'SEARCH_RESULT_CARD', 'BROWSE_TOP', 'BROWSE_RESULT_CARD');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('TALOS');

-- CreateTable
CREATE TABLE "WatchTarget" (
    "id" TEXT NOT NULL,
    "type" "WatchTargetType" NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "owner" "WatchTargetOwner" NOT NULL,
    "source" "WatchTargetSource" NOT NULL DEFAULT 'MANUAL',
    "label" TEXT NOT NULL,
    "asin" TEXT,
    "keyword" TEXT,
    "trackedAsins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrl" TEXT,
    "browseNodeId" TEXT,
    "cadenceMinutes" INTEGER NOT NULL DEFAULT 360,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureJob" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "CaptureJobStatus" NOT NULL DEFAULT 'QUEUED',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptureJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureRun" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "finalUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawExtracted" JSONB,
    "normalizedExtracted" JSONB,
    "changedFromRunId" TEXT,
    "changeSummary" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptureRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "asin" TEXT,
    "position" INTEGER,
    "s3Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT NOT NULL,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "details" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchTarget_type_idx" ON "WatchTarget"("type");

-- CreateIndex
CREATE INDEX "WatchTarget_marketplace_idx" ON "WatchTarget"("marketplace");

-- CreateIndex
CREATE INDEX "WatchTarget_owner_idx" ON "WatchTarget"("owner");

-- CreateIndex
CREATE INDEX "WatchTarget_enabled_idx" ON "WatchTarget"("enabled");

-- CreateIndex
CREATE INDEX "WatchTarget_nextRunAt_idx" ON "WatchTarget"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchTarget_marketplace_type_asin_key" ON "WatchTarget"("marketplace", "type", "asin");

-- CreateIndex
CREATE UNIQUE INDEX "WatchTarget_marketplace_type_keyword_key" ON "WatchTarget"("marketplace", "type", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "WatchTarget_marketplace_type_sourceUrl_key" ON "WatchTarget"("marketplace", "type", "sourceUrl");

-- CreateIndex
CREATE INDEX "CaptureJob_status_scheduledAt_idx" ON "CaptureJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CaptureJob_targetId_idx" ON "CaptureJob"("targetId");

-- CreateIndex
CREATE INDEX "CaptureJob_scheduledAt_idx" ON "CaptureJob"("scheduledAt");

-- CreateIndex
CREATE INDEX "CaptureRun_targetId_startedAt_idx" ON "CaptureRun"("targetId", "startedAt");

-- CreateIndex
CREATE INDEX "CaptureRun_startedAt_idx" ON "CaptureRun"("startedAt");

-- CreateIndex
CREATE INDEX "RunArtifact_runId_idx" ON "RunArtifact"("runId");

-- CreateIndex
CREATE INDEX "RunArtifact_kind_idx" ON "RunArtifact"("kind");

-- CreateIndex
CREATE INDEX "AlertRule_targetId_idx" ON "AlertRule"("targetId");

-- CreateIndex
CREATE INDEX "AlertEvent_sentAt_idx" ON "AlertEvent"("sentAt");

-- CreateIndex
CREATE INDEX "AlertEvent_runId_idx" ON "AlertEvent"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_ruleId_runId_key" ON "AlertEvent"("ruleId", "runId");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportRun_source_idx" ON "ImportRun"("source");

-- AddForeignKey
ALTER TABLE "CaptureJob" ADD CONSTRAINT "CaptureJob_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WatchTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureJob" ADD CONSTRAINT "CaptureJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CaptureRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureRun" ADD CONSTRAINT "CaptureRun_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WatchTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureRun" ADD CONSTRAINT "CaptureRun_changedFromRunId_fkey" FOREIGN KEY ("changedFromRunId") REFERENCES "CaptureRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunArtifact" ADD CONSTRAINT "RunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CaptureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WatchTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CaptureRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

