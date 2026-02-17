-- Create DisciplinaryAction table before 20241221_values_breached_array which ALTERs it.
-- Enums are guarded with DO-EXCEPTION so this is safe on databases that already have them.

DO $$ BEGIN CREATE TYPE "ValueBreach" AS ENUM ('BREACH_OF_DETAIL','BREACH_OF_HONESTY','BREACH_OF_INTEGRITY','BREACH_OF_COURAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationType" AS ENUM ('ATTENDANCE','CONDUCT','PERFORMANCE','POLICY_VIOLATION','SAFETY','HARASSMENT','INSUBORDINATION','THEFT_FRAUD','SUBSTANCE_ABUSE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationReason" AS ENUM ('EXCESSIVE_ABSENCES','TARDINESS','UNAUTHORIZED_LEAVE','NO_CALL_NO_SHOW','UNPROFESSIONAL_BEHAVIOR','DISRUPTIVE_CONDUCT','INAPPROPRIATE_LANGUAGE','DRESS_CODE_VIOLATION','POOR_QUALITY_WORK','MISSED_DEADLINES','FAILURE_TO_FOLLOW_INSTRUCTIONS','NEGLIGENCE','CONFIDENTIALITY_BREACH','DATA_SECURITY_VIOLATION','EXPENSE_POLICY_VIOLATION','IT_POLICY_VIOLATION','SAFETY_PROTOCOL_VIOLATION','EQUIPMENT_MISUSE','HARASSMENT_DISCRIMINATION','WORKPLACE_VIOLENCE','THEFT','FRAUD','FALSIFICATION','SUBSTANCE_USE_AT_WORK','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ViolationSeverity" AS ENUM ('MINOR','MODERATE','MAJOR','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DisciplinaryActionType" AS ENUM ('VERBAL_WARNING','WRITTEN_WARNING','FINAL_WARNING','SUSPENSION','DEMOTION','TERMINATION','PIP','TRAINING_REQUIRED','NO_ACTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DisciplinaryStatus" AS ENUM ('PENDING_HR_REVIEW','PENDING_SUPER_ADMIN','PENDING_ACKNOWLEDGMENT','OPEN','UNDER_INVESTIGATION','ACTION_TAKEN','ACTIVE','APPEALED','APPEAL_PENDING_HR','APPEAL_PENDING_SUPER_ADMIN','CLOSED','DISMISSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Initial DisciplinaryAction schema (before valuesBreached array migration).
-- primaryValueBreached is stored as TEXT here; 20241221_values_breached_array
-- converts it into the valuesBreached "ValueBreach"[] column.
CREATE TABLE IF NOT EXISTS "DisciplinaryAction" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "violationType" "ViolationType" NOT NULL,
  "violationReason" "ViolationReason" NOT NULL,
  "severity" "ViolationSeverity" NOT NULL,
  "primaryValueBreached" TEXT,
  "employeeTookOwnership" BOOLEAN,
  "severityEscalated" BOOLEAN NOT NULL DEFAULT false,
  "originalSeverity" "ViolationSeverity",
  "incidentDate" TIMESTAMP(3) NOT NULL,
  "reportedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedBy" TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS "DisciplinaryAction_employeeId_idx" ON "DisciplinaryAction"("employeeId");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_violationType_idx" ON "DisciplinaryAction"("violationType");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_severity_idx" ON "DisciplinaryAction"("severity");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_status_idx" ON "DisciplinaryAction"("status");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_incidentDate_idx" ON "DisciplinaryAction"("incidentDate");

DO $$ BEGIN ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
