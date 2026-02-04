-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE_SCREEN', 'TECHNICAL', 'CULTURE', 'FINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInterview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "interviewType" "InterviewType" NOT NULL DEFAULT 'OTHER',
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "location" TEXT,
    "meetingLink" TEXT,
    "googleEventId" TEXT,
    "googleHtmlLink" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInterviewInterviewer" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "CandidateInterviewInterviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_fullName_idx" ON "Candidate"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateInterview_googleEventId_key" ON "CandidateInterview"("googleEventId");

-- CreateIndex
CREATE INDEX "CandidateInterview_candidateId_idx" ON "CandidateInterview"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateInterview_status_idx" ON "CandidateInterview"("status");

-- CreateIndex
CREATE INDEX "CandidateInterview_startAt_idx" ON "CandidateInterview"("startAt");

-- CreateIndex
CREATE INDEX "CandidateInterviewInterviewer_employeeId_idx" ON "CandidateInterviewInterviewer"("employeeId");

-- CreateIndex
CREATE INDEX "CandidateInterviewInterviewer_interviewId_idx" ON "CandidateInterviewInterviewer"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateInterviewInterviewer_interviewId_employeeId_key" ON "CandidateInterviewInterviewer"("interviewId", "employeeId");

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterviewInterviewer" ADD CONSTRAINT "CandidateInterviewInterviewer_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "CandidateInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterviewInterviewer" ADD CONSTRAINT "CandidateInterviewInterviewer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
