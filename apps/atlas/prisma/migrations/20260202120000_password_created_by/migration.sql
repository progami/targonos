-- AlterTable
ALTER TABLE "Password" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Password_createdById_idx" ON "Password"("createdById");

-- AddForeignKey
ALTER TABLE "Password" ADD CONSTRAINT "Password_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

