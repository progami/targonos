-- AlterTable
ALTER TABLE "WatchTarget" ADD COLUMN "activeImageVersionId" TEXT;

-- CreateTable
CREATE TABLE "ListingImageBlob" (
    "sha256" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImageBlob_pkey" PRIMARY KEY ("sha256")
);

-- CreateTable
CREATE TABLE "ListingImageVersion" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImageVersionSlot" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImageVersionSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchTarget_activeImageVersionId_idx" ON "WatchTarget"("activeImageVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImageVersion_targetId_versionNumber_key" ON "ListingImageVersion"("targetId", "versionNumber");

-- CreateIndex
CREATE INDEX "ListingImageVersion_targetId_createdAt_idx" ON "ListingImageVersion"("targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImageVersionSlot_versionId_position_key" ON "ListingImageVersionSlot"("versionId", "position");

-- CreateIndex
CREATE INDEX "ListingImageVersionSlot_versionId_idx" ON "ListingImageVersionSlot"("versionId");

-- CreateIndex
CREATE INDEX "ListingImageVersionSlot_blobSha256_idx" ON "ListingImageVersionSlot"("blobSha256");

-- AddForeignKey
ALTER TABLE "ListingImageVersion" ADD CONSTRAINT "ListingImageVersion_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WatchTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImageVersionSlot" ADD CONSTRAINT "ListingImageVersionSlot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ListingImageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImageVersionSlot" ADD CONSTRAINT "ListingImageVersionSlot_blobSha256_fkey" FOREIGN KEY ("blobSha256") REFERENCES "ListingImageBlob"("sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchTarget" ADD CONSTRAINT "WatchTarget_activeImageVersionId_fkey" FOREIGN KEY ("activeImageVersionId") REFERENCES "ListingImageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

