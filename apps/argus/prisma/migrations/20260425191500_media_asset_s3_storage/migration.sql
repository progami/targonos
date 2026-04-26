CREATE TYPE "MediaStorageBackend" AS ENUM ('LOCAL', 'S3');

ALTER TABLE "MediaAsset"
  ADD COLUMN "storageBackend" "MediaStorageBackend" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "s3Bucket" TEXT,
  ADD COLUMN "s3Key" TEXT;

CREATE INDEX "MediaAsset_filePath_idx" ON "MediaAsset"("filePath");
