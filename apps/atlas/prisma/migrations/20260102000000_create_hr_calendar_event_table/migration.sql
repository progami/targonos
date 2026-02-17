-- Create HRCalendarEvent table before 20260103032929_remove_checklists_and_offboarding
-- which UPDATEs and ALTERs HRCalendarEvent.
-- HREventType includes ONBOARDING here; that migration renames the enum and removes it.

DO $$ BEGIN
  CREATE TYPE "HREventType" AS ENUM (
    'PERFORMANCE_REVIEW',
    'PROBATION_END',
    'PIP_REVIEW',
    'DISCIPLINARY_HEARING',
    'INTERVIEW',
    'TRAINING',
    'COMPANY_EVENT',
    'HOLIDAY',
    'ONBOARDING',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
