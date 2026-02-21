-- AlterTable
ALTER TABLE "AwdDataRow" ADD COLUMN "chargeType" TEXT;

-- CreateIndex
CREATE INDEX "AwdDataRow_uploadId_feeType_chargeType_idx" ON "AwdDataRow"("uploadId", "feeType", "chargeType");

