# PDP Version Control — Implementation Plan

## Scope

Build React components for the three versioned PDP sections: **Bullets**, **Images**, and **EBC Modules**. These replace the corresponding sections in the iframe replica with our own code. Everything else (title, price, buy box, rating, breadcrumbs, variations) stays in the iframe for now.

The page layout becomes a hybrid: the iframe renders the full Amazon PDP, but the three versioned sections are overlaid/replaced by our React components that render from extracted data stored in the DB.

---

## Architecture

```
Daily HTML + assets (Chrome Ctrl+S)
    │
    ▼
Ingest Pipeline (cheerio)
    ├─ Extract bullets → BulletsRevision
    ├─ Extract images → GalleryRevision + MediaAsset files
    └─ Extract EBC HTML + images → EbcRevision
    │
    ▼
Database (Prisma / PostgreSQL)
    │
    ▼
React Components (our own JSX, no Amazon CSS)
    ├─ BulletPoints.tsx
    ├─ ImageGallery.tsx
    └─ EbcRenderer.tsx
```

---

## Phase 1: Database Schema

### Prisma Schema

File: `apps/argus/prisma/schema.prisma`

```prisma
datasource db {
  provider = "postgresql"
  url      = env("ARGUS_DATABASE_URL")
  schemas  = ["argus_dev"]
}

generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client-argus"
}

enum RevisionOrigin {
  MANUAL
  CAPTURED

  @@schema("argus_dev")
}

model Listing {
  id              String    @id @default(cuid())
  asin            String
  marketplace     String    @default("US")
  label           String
  brandName       String?
  enabled         Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  activeBulletsId String?
  activeGalleryId String?
  activeEbcId     String?

  bulletsRevisions  BulletsRevision[]
  galleryRevisions  GalleryRevision[]
  ebcRevisions      EbcRevision[]
  snapshots         Snapshot[]

  @@unique([marketplace, asin])
  @@schema("argus_dev")
}

model Snapshot {
  id            String    @id @default(cuid())
  listingId     String
  listing       Listing   @relation(fields: [listingId], references: [id])
  seq           Int
  rawHtmlPath   String?
  capturedAt    DateTime
  ingestedAt    DateTime  @default(now())
  note          String?

  bulletsRevisionId  String?
  galleryRevisionId  String?
  ebcRevisionId      String?

  @@unique([listingId, seq])
  @@index([listingId, capturedAt])
  @@schema("argus_dev")
}

model BulletsRevision {
  id              String          @id @default(cuid())
  listingId       String
  listing         Listing         @relation(fields: [listingId], references: [id])
  seq             Int
  bullet1         String?
  bullet2         String?
  bullet3         String?
  bullet4         String?
  bullet5         String?
  origin          RevisionOrigin
  note            String?
  createdAt       DateTime        @default(now())

  @@unique([listingId, seq])
  @@index([listingId, createdAt])
  @@schema("argus_dev")
}

model GalleryRevision {
  id              String          @id @default(cuid())
  listingId       String
  listing         Listing         @relation(fields: [listingId], references: [id])
  seq             Int
  origin          RevisionOrigin
  note            String?
  createdAt       DateTime        @default(now())

  slots           GallerySlot[]

  @@unique([listingId, seq])
  @@index([listingId, createdAt])
  @@schema("argus_dev")
}

model GallerySlot {
  id              String          @id @default(cuid())
  revisionId      String
  revision        GalleryRevision @relation(fields: [revisionId], references: [id])
  position        Int
  mediaId         String
  media           MediaAsset      @relation(fields: [mediaId], references: [id])

  @@unique([revisionId, position])
  @@schema("argus_dev")
}

model MediaAsset {
  id              String    @id @default(cuid())
  sha256          String    @unique
  filePath        String
  mimeType        String
  bytes           Int?
  width           Int?
  height          Int?
  sourceUrl       String?
  originalName    String?
  createdAt       DateTime  @default(now())

  gallerySlots    GallerySlot[]
  ebcImages       EbcImage[]

  @@schema("argus_dev")
}

model EbcRevision {
  id              String          @id @default(cuid())
  listingId       String
  listing         Listing         @relation(fields: [listingId], references: [id])
  seq             Int
  origin          RevisionOrigin
  note            String?
  createdAt       DateTime        @default(now())

  sections        EbcSection[]

  @@unique([listingId, seq])
  @@index([listingId, createdAt])
  @@schema("argus_dev")
}

model EbcSection {
  id              String    @id @default(cuid())
  revisionId      String
  revision        EbcRevision @relation(fields: [revisionId], references: [id])
  position        Int
  sectionType     String
  heading         String?
  createdAt       DateTime  @default(now())

  modules         EbcModule[]

  @@unique([revisionId, position])
  @@schema("argus_dev")
}

model EbcModule {
  id              String    @id @default(cuid())
  sectionId       String
  section         EbcSection @relation(fields: [sectionId], references: [id])
  position        Int
  moduleType      String
  headline        String?
  bodyText        String?
  createdAt       DateTime  @default(now())

  images          EbcImage[]

  @@unique([sectionId, position])
  @@schema("argus_dev")
}

model EbcImage {
  id              String    @id @default(cuid())
  moduleId        String
  module          EbcModule @relation(fields: [moduleId], references: [id])
  position        Int
  mediaId         String
  media           MediaAsset @relation(fields: [mediaId], references: [id])
  altText         String?

  @@unique([moduleId, position])
  @@schema("argus_dev")
}
```

---

## Phase 2: Ingest Pipeline

### 2.1 Cheerio Extractor

File: `apps/argus/lib/extractor.ts`

Parses the saved HTML and returns structured data for bullets, images, and EBC.

```ts
interface ExtractedBullets {
  bullet1: string | null
  bullet2: string | null
  bullet3: string | null
  bullet4: string | null
  bullet5: string | null
}

interface ExtractedImage {
  position: number
  src: string          // local path in assets folder
  hiRes: string | null // data-old-hires or largest from data-a-dynamic-image
  isVideo: boolean
}

interface ExtractedGallery {
  main: ExtractedImage
  thumbnails: ExtractedImage[]
}

interface ExtractedEbcSection {
  sectionType: string  // 'BRAND_STORY' | 'PRODUCT_DESCRIPTION'
  heading: string | null
  modules: ExtractedEbcModule[]
}

interface ExtractedEbcModule {
  moduleType: string   // 'FULL_IMAGE' | 'IMAGE_TEXT' | 'COMPARISON_TABLE' | 'RAW_HTML'
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}
```

**Bullet selectors:**
| Selector | Notes |
|----------|-------|
| `#feature-bullets .a-list-item` | Filter empty/whitespace. Take first 5. |

**Image selectors:**
| Field | Selector | Notes |
|-------|----------|-------|
| Main image | `#landingImage` | `data-old-hires` for hi-res, `src` for display size |
| Thumbnails | `.imageThumbnail img, .videoThumbnail img` | Position = DOM order |
| Hi-res | `data-a-dynamic-image` JSON on parent `div` | Pick largest dimension variant |

**EBC selectors:**
| Section | Selector |
|---------|----------|
| Brand Story | `#aplusBrandStory_feature_div` |
| Product Description | `#aplus_feature_div` |
| Individual modules | `.apm-brand-story-carousel-hero-container`, `.aplus-module` |
| Module images | `img` within each module container |
| Module text | `.aplus-module p, .aplus-module h3, .aplus-module h4` |

### 2.2 Image Storage

File: `apps/argus/lib/image-store.ts`

Images are copied from the Chrome save assets folder to a content-addressable store.

```
apps/argus/public/media/
  {sha256-first-2}/{sha256}.{ext}
```

Example: `public/media/a1/a1b2c3d4e5...f6.jpg`

Process:
1. Read image from `listingpage_files/` assets folder
2. Compute sha256
3. If file already exists at target path, skip (dedup)
4. Copy to `public/media/{prefix}/{sha256}.{ext}`
5. Create/reuse `MediaAsset` row
6. Return media ID for linking to GallerySlot / EbcImage

### 2.3 Ingest Orchestrator

File: `apps/argus/lib/ingest.ts`

Ties it all together. Called when a new HTML + assets folder is provided.

```ts
async function ingestSnapshot(
  listingId: string,
  htmlPath: string,
  assetsDir: string
): Promise<{ snapshotId: string; changes: string[] }>
```

Steps:
1. Read HTML, load into cheerio
2. Extract bullets → compare with current active BulletsRevision → create new if changed
3. Extract gallery → compare image hashes with current active GalleryRevision → create new if changed
4. Extract EBC sections/modules → compare with current active EbcRevision → create new if changed
5. Copy new images to content-addressable store
6. Create Snapshot row linking to the new (or existing) revision IDs
7. Update Listing active pointers if revisions changed
8. Return summary of what changed

---

## Phase 3: React Components

All components are our own JSX. No Amazon CSS. Styled with Tailwind to visually match the Amazon PDP layout.

### 3.1 Bullet Points

File: `apps/argus/components/pdp/BulletPoints.tsx`

Renders the 5 feature bullets. Highlights changed bullets when diff data is available.

```tsx
interface BulletPointsProps {
  bullets: {
    bullet1: string | null
    bullet2: string | null
    bullet3: string | null
    bullet4: string | null
    bullet5: string | null
  }
  diff?: {
    changedIndices: number[]  // which bullets changed from prev version
  }
}
```

Visual spec:
- Unordered list with disc markers
- Font: 14px, line-height 1.5, color #0F1111 (Amazon's body text color)
- Each bullet is a `<li>` with left padding
- Changed bullets get a subtle yellow-left-border highlight when diff is active
- Null bullets are not rendered

### 3.2 Image Gallery

File: `apps/argus/components/pdp/ImageGallery.tsx`

Interactive image gallery. Click thumbnails to swap the main image.

```tsx
interface ImageGalleryProps {
  gallery: {
    main: { src: string; hiRes: string | null }
    thumbnails: {
      position: number
      src: string
      hiRes: string | null
      isVideo: boolean
    }[]
  }
  diff?: {
    mainChanged: boolean
    changedPositions: number[]
  }
}
```

Visual spec:
- Left column layout matching Amazon's `#leftCol` width (~40% of page)
- Main image container: max 480x480px, centered
- Thumbnail strip below main image: horizontal row, 6-8 thumbnails
- Active thumbnail gets orange border (Amazon's `#C45500`)
- Hover on thumbnail swaps main image (controlled via `useState`)
- Video thumbnails show a play icon overlay
- Changed images get a subtle highlight ring when diff is active
- Images served from `/media/{sha256-prefix}/{sha256}.{ext}` (our public dir)

### 3.3 EBC Renderer

File: `apps/argus/components/pdp/EbcRenderer.tsx`

Renders A+ content from structured data. Each module type has its own sub-component.

```tsx
interface EbcRendererProps {
  sections: {
    sectionType: string
    heading: string | null
    modules: {
      moduleType: string
      headline: string | null
      bodyText: string | null
      images: { src: string; alt: string | null }[]
    }[]
  }[]
  diff?: {
    changedSections: number[]
  }
}
```

Module sub-components in `apps/argus/components/pdp/ebc/`:

| File | Module Type | Layout |
|------|-------------|--------|
| `EbcFullImage.tsx` | `FULL_IMAGE` | Full-width image, optional headline + body below |
| `EbcImageText.tsx` | `IMAGE_TEXT` | Image left/right + text block |
| `EbcComparisonTable.tsx` | `COMPARISON_TABLE` | Grid of product images with feature rows |
| `EbcFourImageText.tsx` | `FOUR_IMAGE_TEXT` | 4 images in a row with captions |

Visual spec:
- Full-width below the fold, matches Amazon's A+ content area
- Section headings: 21px bold
- Module images: responsive, max-width 100%
- Body text: 14px, color #333
- Sections separated by 24px vertical spacing
- Each section can be highlighted when diff shows changes

### 3.4 Version Bar

File: `apps/argus/components/versions/VersionBar.tsx`

Sits above the PDP replica. Shows current version for each track with navigation.

```tsx
interface VersionBarProps {
  listing: { id: string; asin: string; label: string }
  bullets: { seq: number; createdAt: string } | null
  gallery: { seq: number; createdAt: string } | null
  ebc: { seq: number; createdAt: string } | null
  totalSnapshots: number
}
```

Visual spec:
- Horizontal bar with 3 version badges: `Bullets v3` `Images v2` `EBC v1`
- Each badge is clickable → opens version history drawer for that track
- "Upload Snapshot" button on the right
- "Compare" dropdown to select two versions for side-by-side

### 3.5 Diff Components

File: `apps/argus/lib/differ.ts`

Compares two revisions of the same track.

```ts
function diffBullets(prev: BulletsRevision, next: BulletsRevision): BulletsDiff
function diffGallery(prev: GalleryRevision, next: GalleryRevision): GalleryDiff
function diffEbc(prev: EbcRevision, next: EbcRevision): EbcDiff
```

File: `apps/argus/components/versions/ChangeSummary.tsx`

Renders a collapsible panel below the version bar listing all changes between current and previous version.

---

## Phase 4: Page Integration

### 4.1 Listing Detail Page

File: `apps/argus/app/(app)/listings/[id]/page.tsx`

The page fetches the listing + active revisions from the DB and renders:

1. **Version Bar** (top)
2. **PDP Replica** (hybrid):
   - Iframe for the full page (title, price, buy box, rating, variations, etc.)
   - Our React components overlaid for bullets, images, and EBC
3. **Change Summary** (bottom, collapsible)

Approach for hybrid rendering:
- The iframe loads the full replica.html as before
- Below the iframe (or replacing specific sections), we render our React components
- Initially: show the React components in their own section below/above the iframe
- Later: inject them into the iframe via postMessage or replace the iframe entirely

### 4.2 API Routes

| Route | File | Purpose |
|-------|------|---------|
| `GET /api/listings` | `apps/argus/app/api/listings/route.ts` | List all listings |
| `GET /api/listings/[id]` | `apps/argus/app/api/listings/[id]/route.ts` | Get listing + active revisions |
| `POST /api/listings/[id]/ingest` | `apps/argus/app/api/listings/[id]/ingest/route.ts` | Upload HTML+assets, run ingest |
| `GET /api/listings/[id]/bullets` | `apps/argus/app/api/listings/[id]/bullets/route.ts` | List all bullet revisions |
| `GET /api/listings/[id]/gallery` | `apps/argus/app/api/listings/[id]/gallery/route.ts` | List all gallery revisions |
| `GET /api/listings/[id]/ebc` | `apps/argus/app/api/listings/[id]/ebc/route.ts` | List all EBC revisions |
| `GET /api/listings/[id]/snapshots` | `apps/argus/app/api/listings/[id]/snapshots/route.ts` | List all snapshots |

### 4.3 Upload Flow

File: `apps/argus/app/(app)/listings/[id]/upload/page.tsx`

1. User clicks "Upload Snapshot" in version bar
2. Selects `.zip` file (contains HTML + assets folder)
3. `POST /api/listings/[id]/ingest` — multipart upload
4. Server extracts zip, runs ingest pipeline
5. Returns new snapshot ID + change summary
6. UI redirects to listing detail with new version active

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Prisma schema + migration | `apps/argus/prisma/schema.prisma` |
| 2 | DB client setup + env | `apps/argus/lib/db.ts`, `apps/argus/.env.local` |
| 3 | Cheerio bullet extractor | `apps/argus/lib/extractor.ts` |
| 4 | Image store (content-addressable) | `apps/argus/lib/image-store.ts` |
| 5 | Gallery extractor | `apps/argus/lib/extractor.ts` (extend) |
| 6 | EBC extractor | `apps/argus/lib/extractor.ts` (extend) |
| 7 | Differ (bullets, gallery, ebc) | `apps/argus/lib/differ.ts` |
| 8 | Ingest orchestrator | `apps/argus/lib/ingest.ts` |
| 9 | BulletPoints component | `apps/argus/components/pdp/BulletPoints.tsx` |
| 10 | ImageGallery component | `apps/argus/components/pdp/ImageGallery.tsx` |
| 11 | EbcRenderer + module components | `apps/argus/components/pdp/EbcRenderer.tsx`, `apps/argus/components/pdp/ebc/*.tsx` |
| 12 | VersionBar component | `apps/argus/components/versions/VersionBar.tsx` |
| 13 | ChangeSummary component | `apps/argus/components/versions/ChangeSummary.tsx` |
| 14 | Listing API routes | `apps/argus/app/api/listings/route.ts`, `apps/argus/app/api/listings/[id]/route.ts` |
| 15 | Ingest API route | `apps/argus/app/api/listings/[id]/ingest/route.ts` |
| 16 | Revision history API routes | `apps/argus/app/api/listings/[id]/bullets/route.ts`, etc. |
| 17 | Update listing detail page | `apps/argus/app/(app)/listings/[id]/page.tsx` |
| 18 | Upload page | `apps/argus/app/(app)/listings/[id]/upload/page.tsx` |
| 19 | Seed existing fixture as v1 | `apps/argus/scripts/seed-v1.ts` |

---

## File Tree (all new files)

```
apps/argus/
├── prisma/
│   └── schema.prisma
├── lib/
│   ├── db.ts                          # Prisma client singleton
│   ├── extractor.ts                   # Cheerio: extract bullets, images, ebc
│   ├── image-store.ts                 # Content-addressable image storage
│   ├── ingest.ts                      # Orchestrates full ingest pipeline
│   └── differ.ts                      # Diff bullets/gallery/ebc revisions
├── components/
│   ├── pdp/
│   │   ├── BulletPoints.tsx           # 5 feature bullets with diff highlights
│   │   ├── ImageGallery.tsx           # Interactive main image + thumbnails
│   │   └── EbcRenderer.tsx            # A+ content from structured data
│   │   └── ebc/
│   │       ├── EbcFullImage.tsx       # Full-width image module
│   │       ├── EbcImageText.tsx       # Image + text side-by-side
│   │       ├── EbcComparisonTable.tsx # Product comparison grid
│   │       └── EbcFourImageText.tsx   # 4 images with captions
│   └── versions/
│       ├── VersionBar.tsx             # Version badges + navigation
│       └── ChangeSummary.tsx          # Collapsible diff panel
├── app/
│   ├── api/
│   │   └── listings/
│   │       ├── route.ts               # GET all listings
│   │       └── [id]/
│   │           ├── route.ts           # GET listing + active revisions
│   │           ├── ingest/
│   │           │   └── route.ts       # POST upload + ingest
│   │           ├── bullets/
│   │           │   └── route.ts       # GET bullet revision history
│   │           ├── gallery/
│   │           │   └── route.ts       # GET gallery revision history
│   │           ├── ebc/
│   │           │   └── route.ts       # GET ebc revision history
│   │           └── snapshots/
│   │               └── route.ts       # GET snapshot history
│   └── (app)/
│       └── listings/
│           └── [id]/
│               ├── page.tsx           # Updated: hybrid iframe + React components
│               └── upload/
│                   └── page.tsx       # Upload snapshot UI
├── public/
│   └── media/                         # Content-addressable image store
│       └── {2-char-prefix}/
│           └── {sha256}.{ext}
└── scripts/
    └── seed-v1.ts                     # Seed existing fixture as first snapshot
```
