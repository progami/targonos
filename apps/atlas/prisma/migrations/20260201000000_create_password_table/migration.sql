-- Create Password table before 20260202120000_password_created_by which ALTERs it.
-- createdById is NOT included here; it is added by that later migration.

DO $$ BEGIN CREATE TYPE "PasswordDepartment" AS ENUM ('OPS','SALES_MARKETING','LEGAL','HR','FINANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Password" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "password" TEXT NOT NULL,
  "url" TEXT,
  "department" "PasswordDepartment" NOT NULL DEFAULT 'OPS',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Password_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Password_department_idx" ON "Password"("department");
CREATE INDEX IF NOT EXISTS "Password_title_idx" ON "Password"("title");
