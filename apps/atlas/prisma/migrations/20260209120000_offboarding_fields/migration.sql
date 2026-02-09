-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('RESIGNATION', 'TERMINATION', 'LAYOFF', 'MUTUAL_AGREEMENT', 'CONTRACT_END', 'RETIREMENT', 'OTHER');

-- AlterTable: Add offboarding fields to Employee
ALTER TABLE "Employee" ADD COLUMN "exitReason" "ExitReason";
ALTER TABLE "Employee" ADD COLUMN "lastWorkingDay" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "exitNotes" TEXT;

-- AlterTable: Add actionUrl to Task
ALTER TABLE "Task" ADD COLUMN "actionUrl" TEXT;
