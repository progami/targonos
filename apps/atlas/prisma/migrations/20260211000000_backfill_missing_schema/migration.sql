-- Backfill migration: create all tables, enums, columns, and indexes that were
-- previously applied via `prisma db push` but never captured in a migration file.
--
-- Every statement uses IF NOT EXISTS / DO-EXCEPTION guards so this migration is
-- idempotent and safe to run on databases that already have these objects.

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('POLICY_CREATED','POLICY_UPDATED','POLICY_ARCHIVED','ANNOUNCEMENT','SYSTEM','PROFILE_INCOMPLETE','REVIEW_SUBMITTED','REVIEW_ACKNOWLEDGED','DISCIPLINARY_CREATED','DISCIPLINARY_UPDATED','HIERARCHY_CHANGED','STANDING_CHANGED','VIOLATION_PENDING_HR','VIOLATION_PENDING_ADMIN','VIOLATION_APPROVED','VIOLATION_REJECTED','VIOLATION_ACKNOWLEDGED','REVIEW_PENDING_HR','REVIEW_PENDING_ADMIN','REVIEW_APPROVED','REVIEW_REJECTED','APPEAL_PENDING_HR','APPEAL_PENDING_ADMIN','APPEAL_DECIDED','LEAVE_REQUESTED','LEAVE_PENDING_HR','LEAVE_PENDING_SUPER_ADMIN','LEAVE_APPROVED','LEAVE_REJECTED','LEAVE_CANCELLED','RESOURCE_CREATED','QUARTERLY_REVIEW_CREATED','QUARTERLY_REVIEW_REMINDER','QUARTERLY_REVIEW_OVERDUE','QUARTERLY_REVIEW_ESCALATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CoreValue" AS ENUM ('ATTENTION_TO_DETAIL','HONESTY','INTEGRITY','COURAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ValueBreach" AS ENUM ('BREACH_OF_DETAIL','BREACH_OF_HONESTY','BREACH_OF_INTEGRITY','BREACH_OF_COURAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EmployeeStanding" AS ENUM ('GREEN','YELLOW','RED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Region" AS ENUM ('ALL','KANSAS_US','PAKISTAN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE','COMPLETED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewType" AS ENUM ('PROBATION','QUARTERLY','SEMI_ANNUAL','ANNUAL','PROMOTION','PIP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewPeriodType" AS ENUM ('Q1','Q2','Q3','Q4','H1','H2','ANNUAL','PROBATION','CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','DRAFT','PENDING_REVIEW','PENDING_HR_REVIEW','PENDING_SUPER_ADMIN','PENDING_ACKNOWLEDGMENT','ACKNOWLEDGED','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationType" AS ENUM ('ATTENDANCE','CONDUCT','PERFORMANCE','POLICY_VIOLATION','SAFETY','HARASSMENT','INSUBORDINATION','THEFT_FRAUD','SUBSTANCE_ABUSE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationReason" AS ENUM ('EXCESSIVE_ABSENCES','TARDINESS','UNAUTHORIZED_LEAVE','NO_CALL_NO_SHOW','UNPROFESSIONAL_BEHAVIOR','DISRUPTIVE_CONDUCT','INAPPROPRIATE_LANGUAGE','DRESS_CODE_VIOLATION','POOR_QUALITY_WORK','MISSED_DEADLINES','FAILURE_TO_FOLLOW_INSTRUCTIONS','NEGLIGENCE','CONFIDENTIALITY_BREACH','DATA_SECURITY_VIOLATION','EXPENSE_POLICY_VIOLATION','IT_POLICY_VIOLATION','SAFETY_PROTOCOL_VIOLATION','EQUIPMENT_MISUSE','HARASSMENT_DISCRIMINATION','WORKPLACE_VIOLENCE','THEFT','FRAUD','FALSIFICATION','SUBSTANCE_USE_AT_WORK','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationSeverity" AS ENUM ('MINOR','MODERATE','MAJOR','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DisciplinaryActionType" AS ENUM ('VERBAL_WARNING','WRITTEN_WARNING','FINAL_WARNING','SUSPENSION','DEMOTION','TERMINATION','PIP','TRAINING_REQUIRED','NO_ACTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DisciplinaryStatus" AS ENUM ('PENDING_HR_REVIEW','PENDING_SUPER_ADMIN','PENDING_ACKNOWLEDGMENT','OPEN','UNDER_INVESTIGATION','ACTION_TAKEN','ACTIVE','APPEALED','APPEAL_PENDING_HR','APPEAL_PENDING_SUPER_ADMIN','CLOSED','DISMISSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PasswordDepartment" AS ENUM ('OPS','SALES_MARKETING','LEGAL','HR','FINANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ContractorStatus" AS ENUM ('ACTIVE','ON_HOLD','COMPLETED','TERMINATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. EMPLOYEE TABLE - missing columns
-- ============================================================

-- Rename reportsTo -> reportsToId (if old column exists and new one does not)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Employee' AND column_name='reportsTo')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Employee' AND column_name='reportsToId')
  THEN
    ALTER TABLE "Employee" RENAME COLUMN "reportsTo" TO "reportsToId";
  END IF;
END $$;

-- Add reportsToId if neither column exists
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "reportsToId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "googleId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "permissionLevel" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "nameLocalOverride" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "departmentLocalOverride" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "positionLocalOverride" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD COLUMN "region" "EmployeeRegion" NOT NULL DEFAULT 'PAKISTAN'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Unique index on googleId
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_googleId_key" ON "Employee"("googleId");
-- Self-referential FK for reportsToId
CREATE INDEX IF NOT EXISTS "Employee_reportsToId_idx" ON "Employee"("reportsToId");
CREATE INDEX IF NOT EXISTS "Employee_isSuperAdmin_idx" ON "Employee"("isSuperAdmin");

-- FK constraint (idempotent via IF NOT EXISTS on constraint name)
DO $$ BEGIN
  ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportsToId_fkey"
    FOREIGN KEY ("reportsToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. POLICY TABLE - missing columns (region, unique constraints)
-- ============================================================
DO $$ BEGIN ALTER TABLE "Policy" ADD COLUMN "region" "Region" NOT NULL DEFAULT 'ALL'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Policy" ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Policy_region_idx" ON "Policy"("region");

-- ============================================================
-- 4. TABLES - create if not exists
-- ============================================================

-- EmployeeDepartment
CREATE TABLE IF NOT EXISTS "EmployeeDepartment" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeDepartment_employeeId_departmentId_key" ON "EmployeeDepartment"("employeeId","departmentId");
CREATE INDEX IF NOT EXISTS "EmployeeDepartment_employeeId_idx" ON "EmployeeDepartment"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeDepartment_departmentId_idx" ON "EmployeeDepartment"("departmentId");
DO $$ BEGIN ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Project
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "leadId" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Project_name_key" ON "Project"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_code_key" ON "Project"("code");
CREATE INDEX IF NOT EXISTS "Project_leadId_idx" ON "Project"("leadId");
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");
DO $$ BEGIN ALTER TABLE "Project" ADD CONSTRAINT "Project_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ProjectMember
CREATE TABLE IF NOT EXISTS "ProjectMember" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "role" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_employeeId_key" ON "ProjectMember"("projectId","employeeId");
CREATE INDEX IF NOT EXISTS "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectMember_employeeId_idx" ON "ProjectMember"("employeeId");
DO $$ BEGIN ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "employeeId" TEXT,
  "relatedId" TEXT,
  "relatedType" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_employeeId_idx" ON "Notification"("employeeId");
DO $$ BEGIN ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add FK from NotificationReadReceipt -> Notification (if missing)
DO $$ BEGIN ALTER TABLE "NotificationReadReceipt" ADD CONSTRAINT "NotificationReadReceipt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Add FK from NotificationEmailDispatch -> Notification (if missing)
DO $$ BEGIN ALTER TABLE "NotificationEmailDispatch" ADD CONSTRAINT "NotificationEmailDispatch_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- QuarterlyReviewCycle
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

-- PerformanceReview
CREATE TABLE IF NOT EXISTS "PerformanceReview" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reviewType" "ReviewType" NOT NULL,
  "periodType" "ReviewPeriodType",
  "periodYear" INTEGER,
  "reviewPeriod" TEXT NOT NULL,
  "reviewDate" TIMESTAMP(3) NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "roleTitle" TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS "PerformanceReview_hrReviewedById_idx" ON "PerformanceReview"("hrReviewedById");
CREATE INDEX IF NOT EXISTS "PerformanceReview_superAdminApprovedById_idx" ON "PerformanceReview"("superAdminApprovedById");
CREATE INDEX IF NOT EXISTS "PerformanceReview_quarterlyCycleId_idx" ON "PerformanceReview"("quarterlyCycleId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_assignedReviewerId_idx" ON "PerformanceReview"("assignedReviewerId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_deadline_idx" ON "PerformanceReview"("deadline");
CREATE INDEX IF NOT EXISTS "PerformanceReview_escalatedToHR_idx" ON "PerformanceReview"("escalatedToHR");
CREATE INDEX IF NOT EXISTS "PerformanceReview_roleTitle_idx" ON "PerformanceReview"("roleTitle");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodType_idx" ON "PerformanceReview"("periodType");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodYear_idx" ON "PerformanceReview"("periodYear");
CREATE INDEX IF NOT EXISTS "PerformanceReview_periodType_periodYear_idx" ON "PerformanceReview"("periodType","periodYear");
CREATE INDEX IF NOT EXISTS "PerformanceReview_employeeId_roleTitle_periodType_periodYear_idx" ON "PerformanceReview"("employeeId","roleTitle","periodType","periodYear");
DO $$ BEGIN ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_quarterlyCycleId_fkey" FOREIGN KEY ("quarterlyCycleId") REFERENCES "QuarterlyReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DisciplinaryAction
CREATE TABLE IF NOT EXISTS "DisciplinaryAction" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "caseId" TEXT,
  "violationType" "ViolationType" NOT NULL,
  "violationReason" "ViolationReason" NOT NULL,
  "severity" "ViolationSeverity" NOT NULL,
  "valuesBreached" "ValueBreach"[] NOT NULL DEFAULT '{}',
  "employeeTookOwnership" BOOLEAN,
  "severityEscalated" BOOLEAN NOT NULL DEFAULT false,
  "originalSeverity" "ViolationSeverity",
  "incidentDate" TIMESTAMP(3) NOT NULL,
  "reportedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedBy" TEXT NOT NULL,
  "createdById" TEXT,
  "description" TEXT NOT NULL,
  "witnesses" TEXT,
  "evidence" TEXT,
  "actionTaken" "DisciplinaryActionType" NOT NULL,
  "actionDate" TIMESTAMP(3),
  "actionDetails" TEXT,
  "followUpDate" TIMESTAMP(3),
  "followUpNotes" TEXT,
  "status" "DisciplinaryStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "employeeAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "employeeAcknowledgedAt" TIMESTAMP(3),
  "managerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "managerAcknowledgedAt" TIMESTAMP(3),
  "managerAcknowledgerId" TEXT,
  "appealReason" TEXT,
  "appealedAt" TIMESTAMP(3),
  "appealStatus" "AppealStatus",
  "appealResolution" TEXT,
  "appealResolvedAt" TIMESTAMP(3),
  "appealResolvedById" TEXT,
  "hrReviewedAt" TIMESTAMP(3),
  "hrReviewedById" TEXT,
  "hrReviewNotes" TEXT,
  "hrApproved" BOOLEAN,
  "superAdminApprovedAt" TIMESTAMP(3),
  "superAdminApprovedById" TEXT,
  "superAdminNotes" TEXT,
  "superAdminApproved" BOOLEAN,
  "appealHrReviewedAt" TIMESTAMP(3),
  "appealHrReviewedById" TEXT,
  "appealHrNotes" TEXT,
  "appealSuperAdminDecidedAt" TIMESTAMP(3),
  "appealSuperAdminDecidedById" TEXT,
  "appealSuperAdminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DisciplinaryAction_caseId_key" ON "DisciplinaryAction"("caseId");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_employeeId_idx" ON "DisciplinaryAction"("employeeId");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_violationType_idx" ON "DisciplinaryAction"("violationType");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_severity_idx" ON "DisciplinaryAction"("severity");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_status_idx" ON "DisciplinaryAction"("status");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_incidentDate_idx" ON "DisciplinaryAction"("incidentDate");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_valuesBreached_idx" ON "DisciplinaryAction" USING GIN ("valuesBreached");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_hrReviewedById_idx" ON "DisciplinaryAction"("hrReviewedById");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_superAdminApprovedById_idx" ON "DisciplinaryAction"("superAdminApprovedById");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_createdById_idx" ON "DisciplinaryAction"("createdById");
DO $$ BEGIN ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HRCalendarEvent
CREATE TABLE IF NOT EXISTS "HRCalendarEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "eventType" "HREventType" NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT true,
  "employeeId" TEXT,
  "relatedRecordId" TEXT,
  "relatedRecordType" TEXT,
  "googleEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HRCalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HRCalendarEvent_eventType_idx" ON "HRCalendarEvent"("eventType");
CREATE INDEX IF NOT EXISTS "HRCalendarEvent_startDate_idx" ON "HRCalendarEvent"("startDate");
CREATE INDEX IF NOT EXISTS "HRCalendarEvent_employeeId_idx" ON "HRCalendarEvent"("employeeId");

-- Password
CREATE TABLE IF NOT EXISTS "Password" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "password" TEXT NOT NULL,
  "url" TEXT,
  "department" "PasswordDepartment" NOT NULL DEFAULT 'OPS',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Password_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Password_department_idx" ON "Password"("department");
CREATE INDEX IF NOT EXISTS "Password_title_idx" ON "Password"("title");
CREATE INDEX IF NOT EXISTS "Password_createdById_idx" ON "Password"("createdById");
DO $$ BEGIN ALTER TABLE "Password" ADD CONSTRAINT "Password_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contractor
CREATE TABLE IF NOT EXISTS "Contractor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "role" TEXT,
  "department" TEXT,
  "hourlyRate" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "contractStart" TIMESTAMP(3),
  "contractEnd" TIMESTAMP(3),
  "status" "ContractorStatus" NOT NULL DEFAULT 'ACTIVE',
  "address" TEXT,
  "city" TEXT,
  "country" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Contractor_status_idx" ON "Contractor"("status");
CREATE INDEX IF NOT EXISTS "Contractor_name_idx" ON "Contractor"("name");
CREATE INDEX IF NOT EXISTS "Contractor_company_idx" ON "Contractor"("company");
