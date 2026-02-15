-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "activeVideoId" TEXT;

-- CreateTable
CREATE TABLE "EbcModulePointer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "modulePosition" INTEGER NOT NULL,
    "ebcRevisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbcModulePointer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRevision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "origin" "RevisionOrigin" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mediaId" TEXT NOT NULL,
    "posterMediaId" TEXT,

    CONSTRAINT "VideoRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EbcModulePointer_listingId_idx" ON "EbcModulePointer"("listingId");

-- CreateIndex
CREATE INDEX "EbcModulePointer_ebcRevisionId_idx" ON "EbcModulePointer"("ebcRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "EbcModulePointer_listingId_sectionType_modulePosition_key" ON "EbcModulePointer"("listingId", "sectionType", "modulePosition");

-- CreateIndex
CREATE INDEX "VideoRevision_listingId_createdAt_idx" ON "VideoRevision"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRevision_listingId_seq_key" ON "VideoRevision"("listingId", "seq");

-- AddForeignKey
ALTER TABLE "EbcModulePointer" ADD CONSTRAINT "EbcModulePointer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbcModulePointer" ADD CONSTRAINT "EbcModulePointer_ebcRevisionId_fkey" FOREIGN KEY ("ebcRevisionId") REFERENCES "EbcRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevision" ADD CONSTRAINT "VideoRevision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevision" ADD CONSTRAINT "VideoRevision_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevision" ADD CONSTRAINT "VideoRevision_posterMediaId_fkey" FOREIGN KEY ("posterMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
