-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "activeTitleId" TEXT;

-- AlterTable
ALTER TABLE "Snapshot" ADD COLUMN     "titleRevisionId" TEXT;

-- CreateTable
CREATE TABLE "TitleRevision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "origin" "RevisionOrigin" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TitleRevision_listingId_createdAt_idx" ON "TitleRevision"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TitleRevision_listingId_seq_key" ON "TitleRevision"("listingId", "seq");

-- AddForeignKey
ALTER TABLE "TitleRevision" ADD CONSTRAINT "TitleRevision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill v1 title revisions from existing Listing.label
INSERT INTO "TitleRevision" ("id", "listingId", "seq", "title", "origin", "createdAt")
SELECT
    md5("Listing"."id" || '-title-v1'),
    "Listing"."id",
    1,
    "Listing"."label",
    'CAPTURED_SNAPSHOT',
    CURRENT_TIMESTAMP
FROM "Listing"
WHERE NOT EXISTS (
    SELECT 1
    FROM "TitleRevision"
    WHERE "TitleRevision"."listingId" = "Listing"."id"
);

UPDATE "Listing"
SET "activeTitleId" = md5("Listing"."id" || '-title-v1')
WHERE "activeTitleId" IS NULL;
