-- Create QuarterlyReviewCycle and PerformanceReview tables before
-- 20251224003000_performance_review_role_title which ALTERs PerformanceReview.
-- Note: roleTitle is NOT included here; it is added by that later migration.

DO $$ BEGIN CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE','COMPLETED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewType" AS ENUM ('PROBATION','QUARTERLY','SEMI_ANNUAL','ANNUAL','PROMOTION','PIP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewPeriodType" AS ENUM ('Q1','Q2','Q3','Q4','H1','H2','ANNUAL','PROBATION','CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','DRAFT','PENDING_REVIEW','PENDING_HR_REVIEW','PENDING_SUPER_ADMIN','PENDING_ACKNOWLEDGMENT','ACKNOWLEDGED','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "QuarterlyReviewCycle" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "reviewPeriod" TEXT NOT NULL,
  "quarterEndDate" TIMESTAMP(3) NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "status" "CycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "totalReviews" INTEGER NOT NULL DEFAULT 0,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "overdueCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuarterlyReviewCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuarterlyReviewCycle_year_quarter_key" ON "QuarterlyReviewCycle"("year","quarter");
CREATE INDEX IF NOT EXISTS "QuarterlyReviewCycle_status_idx" ON "QuarterlyReviewCycle"("status");
CREATE INDEX IF NOT EXISTS "QuarterlyReviewCycle_deadline_idx" ON "QuarterlyReviewCycle"("deadline");

-- PerformanceReview without roleTitle (added by 20251224003000_performance_review_role_title)
CREATE TABLE IF NOT EXISTS "PerformanceReview" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reviewType" "ReviewType" NOT NULL,
  "periodType" "ReviewPeriodType",
  "periodYear" INTEGER,
  "reviewPeriod" TEXT NOT NULL,
  "reviewDate" TIMESTAMP(3) NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "qualityOfWork" INTEGER,
  "productivity" INTEGER,
  "communication" INTEGER,
  "teamwork" INTEGER,
  "initiative" INTEGER,
  "attendance" INTEGER,
  "ratingPrecision" INTEGER,
  "ratingTransparency" INTEGER,
  "ratingReliability" INTEGER,
  "ratingInitiative" INTEGER,
  "selfRatingPrecision" INTEGER,
  "selfRatingTransparency" INTEGER,
  "selfRatingReliability" INTEGER,
  "selfRatingInitiative" INTEGER,
  "valuesScore" DOUBLE PRECISION,
  "valuesVetoApplied" BOOLEAN NOT NULL DEFAULT false,
  "valuesVetoReason" TEXT,
  "lowHonestyJustification" TEXT,
  "lowIntegrityJustification" TEXT,
  "strengths" TEXT,
  "areasToImprove" TEXT,
  "goals" TEXT,
  "comments" TEXT,
  "status" "ReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "hrReviewedAt" TIMESTAMP(3),
  "hrReviewedById" TEXT,
  "hrReviewNotes" TEXT,
  "hrApproved" BOOLEAN,
  "superAdminApprovedAt" TIMESTAMP(3),
  "superAdminApprovedById" TEXT,
  "superAdminNotes" TEXT,
  "superAdminApproved" BOOLEAN,
  "acknowledgedAt" TIMESTAMP(3),
  "quarterlyCycleId" TEXT,
  "assignedReviewerId" TEXT,
  "deadline" TIMESTAMP(3),
  "remindersSent" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMP(3),
  "escalatedToHR" BOOLEAN NOT NULL DEFAULT false,
  "escalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_reviewType_idx" ON "PerformanceReview"("reviewType");
CREATE INDEX IF NOT EXISTS "PerformanceReview_reviewDate_idx" ON "PerformanceReview"("reviewDate");
CREATE INDEX IF NOT EXISTS "PerformanceReview_status_idx" ON "PerformanceReview"("status");
CREATE INDEX IF NOT EXISTS "PerformanceReview_quarterlyCycleId_idx" ON "PerformanceReview"("quarterlyCycleId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_assignedReviewerId_idx" ON "PerformanceReview"("assignedReviewerId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_deadline_idx" ON "PerformanceReview"("deadline");
CREATE INDEX IF NOT EXISTS "PerformanceReview_escalatedToHR_idx" ON "PerformanceReview"("escalatedToHR");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodType_idx" ON "PerformanceReview"("periodType");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodYear_idx" ON "PerformanceReview"("periodYear");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodType_periodYear_idx" ON "PerformanceReview"("periodType","periodYear");

DO $$ BEGIN ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_quarterlyCycleId_fkey" FOREIGN KEY ("quarterlyCycleId") REFERENCES "QuarterlyReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
