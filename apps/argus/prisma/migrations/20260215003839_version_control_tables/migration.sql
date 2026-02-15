-- CreateEnum
CREATE TYPE "RevisionOrigin" AS ENUM ('MANUAL_ENTRY', 'CAPTURED_SNAPSHOT');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'US',
    "label" TEXT NOT NULL,
    "brandName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeBulletsId" TEXT,
    "activeGalleryId" TEXT,
    "activeEbcId" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "rawHtmlPath" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "bulletsRevisionId" TEXT,
    "galleryRevisionId" TEXT,
    "ebcRevisionId" TEXT,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulletsRevision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "bullet1" TEXT,
    "bullet2" TEXT,
    "bullet3" TEXT,
    "bullet4" TEXT,
    "bullet5" TEXT,
    "origin" "RevisionOrigin" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulletsRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryRevision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "origin" "RevisionOrigin" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GallerySlot" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "GallerySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sourceUrl" TEXT,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbcRevision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "origin" "RevisionOrigin" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbcRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbcSection" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sectionType" TEXT NOT NULL,
    "heading" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbcSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbcModule" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "moduleType" TEXT NOT NULL,
    "headline" TEXT,
    "bodyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbcModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbcImage" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "altText" TEXT,

    CONSTRAINT "EbcImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_marketplace_asin_key" ON "Listing"("marketplace", "asin");

-- CreateIndex
CREATE INDEX "Snapshot_listingId_capturedAt_idx" ON "Snapshot"("listingId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_listingId_seq_key" ON "Snapshot"("listingId", "seq");

-- CreateIndex
CREATE INDEX "BulletsRevision_listingId_createdAt_idx" ON "BulletsRevision"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulletsRevision_listingId_seq_key" ON "BulletsRevision"("listingId", "seq");

-- CreateIndex
CREATE INDEX "GalleryRevision_listingId_createdAt_idx" ON "GalleryRevision"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryRevision_listingId_seq_key" ON "GalleryRevision"("listingId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "GallerySlot_revisionId_position_key" ON "GallerySlot"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_sha256_key" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "EbcRevision_listingId_createdAt_idx" ON "EbcRevision"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EbcRevision_listingId_seq_key" ON "EbcRevision"("listingId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "EbcSection_revisionId_position_key" ON "EbcSection"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EbcModule_sectionId_position_key" ON "EbcModule"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EbcImage_moduleId_position_key" ON "EbcImage"("moduleId", "position");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulletsRevision" ADD CONSTRAINT "BulletsRevision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryRevision" ADD CONSTRAINT "GalleryRevision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GallerySlot" ADD CONSTRAINT "GallerySlot_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "GalleryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GallerySlot" ADD CONSTRAINT "GallerySlot_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcRevision" ADD CONSTRAINT "EbcRevision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcSection" ADD CONSTRAINT "EbcSection_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EbcRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcModule" ADD CONSTRAINT "EbcModule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EbcSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcImage" ADD CONSTRAINT "EbcImage_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "EbcModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcImage" ADD CONSTRAINT "EbcImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
