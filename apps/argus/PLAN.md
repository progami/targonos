# Argus — Amazon Listing Page Replica + Asset Version Control

## Vision

"GitHub for Amazon Listings" — version control every listing element independently, preview it on a pixel-perfect Amazon PDP replica, and A/B test composed listing variants.

Argus = **Asset Management + A/B Testing** in one tool.

---

## What We're Building

A faithful Amazon Product Detail Page replica inside Argus. Every seller-editable element is independently versioned. Compositions tie element versions together for A/B testing.

### Page Layout — 3-Column (matches Amazon's actual PDP)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  [Version Control Bar]                                                        │
│  Title: v3 | Bullets: v5 | Images: v2 | EBC: v1                              │
├───────────────────────────────────────────────────────────────────────────────┤
│                         │                          │                          │
│  LEFT COL               │  CENTER COL              │  RIGHT COL (buy box)     │
│  (imageBlock)           │  (centerCol)             │  (rightCol)              │
│                         │                          │                          │
│  ┌──────────────┐       │  TITLE (versioned)       │  PRICE (from capture)    │
│  │              │       │                          │  $8.54 ($1.42/count)     │
│  │  Main Image  │       │  BRAND (from capture)    │                          │
│  │              │       │                          │  Delivery info           │
│  └──────────────┘       │  ★★★★☆ 4.3 (5,287)      │  (from capture)          │
│                         │  (from capture)          │                          │
│  [t1][t2][t3][t4][v]    │                          │  Stock status            │
│                         │  BULLETS (versioned)     │  (from capture)          │
│                         │  • bullet 1              │                          │
│                         │  • bullet 2              │  Coupons/promos          │
│                         │  • bullet 3              │  (from capture)          │
│                         │  • bullet 4              │                          │
│                         │  • bullet 5              │  [Add to Cart]           │
│                         │                          │  [Buy Now]               │
│                         │                          │                          │
├─────────────────────────┴──────────────────────────┴──────────────────────────┤
│  A+ / EBC CONTENT (versioned)                                                 │
│                                                                               │
│  ┌─ Brand Story Section ──────────────────────────────────────────────────┐   │
│  │  "From the brand" header + brand story modules                        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌─ Product Description Section ──────────────────────────────────────────┐   │
│  │  A+ modules (full-width images, etc.)                                 │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
├───────────────────────────────────────────────────────────────────────────────┤
│  DESCRIPTION (versioned — hidden behind EBC when EBC exists)                  │
│  (collapsed/dimmed if EBC is active, expandable to view)                      │
├───────────────────────────────────────────────────────────────────────────────┤
│  REVIEWS (read-only from captures)                                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Versionable Elements — 5 Independent Tracks

Each track has its own version history. Changing one does not affect others.

| # | Track | Storage | Fields |
|---|-------|---------|--------|
| 1 | **Title** | Text | `title` string |
| 2 | **Bullets** | Text (up to 5, nullable) | `bullet1?`..`bullet5?` |
| 3 | **Description** | Text/HTML | `html` string (hidden when EBC exists, manual-only) |
| 4 | **Gallery** | S3 blobs + external refs | Up to 9 image/video slots |
| 5 | **EBC / A+ Content** | S3 blobs + JSON + (sanitized) HTML | Sections → Modules (Brand Story, Product Description, etc.) |

### Read-Only Elements (rendered from latest capture data)

- Brand name
- Star rating + review count
- Price + per-unit price
- Buy box: delivery date, stock status, coupons/promos, shipping messages
- Variation selector (twister) — read-only display from captured `twisterModel` (+ `selectedDims`)
- Reviews

### Replica Scope (Pixel-Fidelity Expectations)

The archive includes additional major below-the-fold blocks that users will expect on a “replica”:
- `productDetails_feature_div` (product details/spec table)
- `importantInformation_feature_div`
- `productDocuments_feature_div`
- `ask_feature_div` (Q&A entry point)
- Other widgets (compare/similar items, related videos) depending on category

**V1 rule:** render read-only from capture when available; otherwise show an explicit “Not modeled yet” placeholder (no silent omissions).

---

## Data Model

### Core — Listing

#### Listing
The central entity. One per ASIN+marketplace combination.

```
id                    String      @id @default(cuid())
asin                  String
marketplace           Marketplace (US / UK)
label                 String      (human-friendly name, e.g. "Drop Cloth 6-Pack")
brandName             String?     (read-only, populated from captures)
enabled               Boolean     @default(true)
createdAt             DateTime
updatedAt             DateTime

// active version pointers (one per track, used when no composition is active)
activeTitleId         String?     → TitleRevision
activeBulletsId       String?     → BulletsRevision
activeDescriptionId   String?     → DescriptionRevision
activeGalleryId       String?     → GalleryRevision
activeEbcId           String?     → EbcRevision

// composition pointer (takes precedence over per-track pointers when set)
activeCompositionId   String?     → Composition

@@unique([marketplace, asin])
```

**Activation precedence:**
- If `activeCompositionId` is set → derive all active revisions from that Composition
- Else → use per-track `active*Id` pointers directly

### Version Tracks

All revision models share a common pattern:
- Immutable once created (append-only history)
- Child rows are immutable too (e.g. `GallerySlot`, `EbcSection`, `EbcModule`). Editing happens in a draft builder; on Save we always create a **new** Revision row (new `seq`) with a fresh set of child rows. No PATCH/DELETE on revision history.
- `origin` distinguishes manual uploads from automated captures
- `seq` is a monotonically increasing number per listing per track
- `seq` allocated via unique constraint + retry on conflict
- `sourceCaptureId` traces auto-created revisions back to the capture that triggered them
- `sourceCaptureId` uses `onDelete: SetNull` so revision history survives capture retention/pruning.

#### TitleRevision
```
id              String    @id @default(cuid())
listingId       String    → Listing
seq             Int
title           String
charCount       Int       (computed: title.length)
byteCount       Int       (computed: Buffer.byteLength(title, 'utf8'))
origin          RevisionOrigin (MANUAL / CAPTURED)
sourceCaptureId String?   → Capture
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime

@@unique([listingId, seq])
@@index([listingId, createdAt])
```

#### BulletsRevision
```
id              String    @id @default(cuid())
listingId       String    → Listing
seq             Int
bullet1         String?
bullet2         String?
bullet3         String?
bullet4         String?
bullet5         String?
origin          RevisionOrigin
sourceCaptureId String?   → Capture
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime

@@unique([listingId, seq])
@@index([listingId, createdAt])
```

> 5 explicit nullable fields instead of String[] — easier to diff, query, and display individually. Listings may have fewer than 5 bullets.

#### DescriptionRevision
```
id              String    @id @default(cuid())
listingId       String    → Listing
seq             Int
html            String    (seller's product description HTML)
origin          RevisionOrigin
sourceCaptureId String?   → Capture
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime

@@unique([listingId, seq])
@@index([listingId, createdAt])
```

> **Manual-only in practice.** When A+ is active on Amazon, the PDP's "Product description" area renders A+ content, not the seller's HTML description field. The capture worker should NOT auto-create DescriptionRevisions from PDP scrapes when A+ is detected — it would version the wrong thing. DescriptionRevisions come from manual entry (or SP-API in the future).

#### GalleryRevision
```
id              String    @id @default(cuid())
listingId       String    → Listing
seq             Int
origin          RevisionOrigin
sourceCaptureId String?   → Capture
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime

slots           GallerySlot[]

@@unique([listingId, seq])
@@index([listingId, createdAt])
```

#### GallerySlot
```
id              String    @id @default(cuid())
revisionId      String    → GalleryRevision
position        Int       (0 = main image, 1-8 = additional images/video)
mediaId         String    → MediaAsset
posterMediaId   String?   → MediaAsset (optional poster/thumbnail for video)
createdAt       DateTime

@@unique([revisionId, position])
```

> Named `GallerySlot` not `GalleryImage` because a slot can hold video (mp4) too.

#### MediaAsset
Content-addressed media storage (for S3-backed assets). Shared across all uses (gallery slots, EBC modules).

```
id              String    @id @default(cuid())
storageType     MediaStorageType
sha256          String?   @unique     (required when `storageType = S3`)
s3Key           String?   (required when `storageType = S3`)
sourceUrl       String?   (captured external reference, e.g. Amazon CDN URL)
mimeType        String    (image/jpeg, image/png, image/webp, video/mp4)
bytes           Int?
width           Int?      (null for video)
height          Int?      (null for video)
durationSec     Float?    (null for images, populated for video)
originalName    String?   (original filename at upload time)
createdAt       DateTime
```

```
enum MediaStorageType {
  S3
  EXTERNAL_URL
}
```

> Deduplication by sha256 (for S3-backed assets). Single table for all media — gallery and EBC reference the same pool. Supports both images and video via mimeType.

**Presigned upload + sha256 verification (required):**
- Uploads go to a temporary S3 key via presigned URL
- Backend finalizes the upload by streaming bytes from S3 to compute sha256 + extract metadata (width/height/duration)
- Backend then writes the `MediaAsset` row and moves/copies the object to the final hash-keyed location
- We do not trust client-supplied hashes/metadata

#### EbcRevision
```
id              String    @id @default(cuid())
listingId       String    → Listing
seq             Int
origin          RevisionOrigin
sourceCaptureId String?   → Capture
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime

sections        EbcSection[]

@@unique([listingId, seq])
@@index([listingId, createdAt])
```

#### EbcSection
Groups modules into the distinct A+ blocks that Amazon renders separately.

```
id              String          @id @default(cuid())
revisionId      String          → EbcRevision
position        Int             (display order among sections)
sectionType     EbcSectionType
sourceKey       String?         (e.g. Amazon feature_div id like `aplus_feature_div`)
createdAt       DateTime

modules         EbcModule[]

@@unique([revisionId, position])
```

```
enum EbcSectionType {
  BRAND_STORY              // "From the brand" — aplusBrandStory_feature_div
  PRODUCT_DESCRIPTION      // Main A+ content — aplus_feature_div
  SUSTAINABILITY           // Sustainability story — aplusSustainabilityStory_feature_div
  OTHER                    // Future/unknown A+ blocks
}
```

#### EbcModule
```
id              String        @id @default(cuid())
sectionId       String        → EbcSection
position        Int           (display order within section, 0-indexed)
moduleType      EbcModuleType
sourceKey       String?       (optional capture identifier for forward-compat)
mediaId         String?       → MediaAsset (for image-based modules)
altText         String?
headline        String?
body            String?
rawHtml         String?       (escape hatch for captured A+ content we can't parse yet)
sanitizedHtml   String?       (render-safe HTML for RAW_HTML modules; `rawHtml` is never rendered directly)
config          Json?         (type-specific structured data, e.g. comparison table rows)
createdAt       DateTime

@@unique([sectionId, position])
```

### EBC Module Types

```
enum EbcModuleType {
  // Phase 1 — launch with these
  FULL_IMAGE              // Single full-width image (970×600 recommended)
  RAW_HTML                // Escape hatch: render sanitized HTML from capture (read-only)

  // Phase 2
  SCROLLABLE_IMAGE        // Horizontally scrollable image carousel
  COMPARISON_TABLE        // Feature comparison grid

  // Phase 3 (future)
  IMAGE_TEXT_OVERLAY       // Image with text overlay
  FOUR_IMAGE_GRID          // 4 images with captions
  TECH_SPECS               // Specifications table
}
```

Phase 1: **FULL_IMAGE** for manual creation, **RAW_HTML** for captured A+ content we don't have structured parsers for yet. This avoids "replica can't show what Amazon shows" for real listings.

**RAW_HTML safety (non-negotiable):**
- Never render captured `rawHtml` directly in the main DOM (no direct `dangerouslySetInnerHTML`)
- Sanitize on ingest and render in a sandboxed iframe (no scripts, no same-origin)
- External assets may break; future work can snapshot/rewrite URLs if needed

### Compositions

A composition pins one specific revision from each track into a single "listing state."

**Composition rule (deterministic):**
- Compositions are **complete**: all 5 revision IDs are required.
- “No A+” is represented by an `EbcRevision` with zero sections.
- “No gallery media” is represented by a `GalleryRevision` with zero slots.
- “No description content” is represented by a `DescriptionRevision` with empty `html`.

#### Composition
```
id                    String    @id @default(cuid())
listingId             String    → Listing
seq                   Int
name                  String?   (e.g. "Launch variant", "Holiday copy")

titleRevisionId       String    → TitleRevision
bulletsRevisionId     String    → BulletsRevision
descriptionRevisionId String    → DescriptionRevision
galleryRevisionId     String    → GalleryRevision
ebcRevisionId         String    → EbcRevision

authorUserId          String?
authorEmail           String?
note                  String?
createdAt             DateTime

@@unique([listingId, seq])
@@index([listingId])
```

### A/B Tests (Phase 7)

#### SplitTest
```
id              String          @id @default(cuid())
listingId       String          → Listing
name            String
status          SplitTestStatus (DRAFT / LIVE / CONCLUDED)
variantAId      String          → Composition
variantBId      String          → Composition
winnerId        String?         → Composition
startedAt       DateTime?
concludedAt     DateTime?
authorUserId    String?
authorEmail     String?
note            String?
createdAt       DateTime
```

### Captures (monitoring)

#### Capture
Snapshot of what Amazon is actually showing for this listing.

```
id              String    @id @default(cuid())
listingId       String    → Listing
capturedAt      DateTime  @default(now())
url             String    (the Amazon URL that was scraped)
screenshotKey   String?   (S3 key for full-page screenshot)
extractedData   Json      (raw parsed data — title, bullets, price, rating, buy box, etc.)
contentHash     String    (hash of normalized extractedData for change detection; exclude noisy/personalized fields)
selectedDims    Json?     (variation dimensions selected at capture time, e.g. {"color":"Blue","size":"12x9"})
twisterModel    Json?     (read-only variation model: dimension names + options + selected value)
context         Json      (capture environment: ship-to zip/location, locale, currency, viewport, user agent, sessionType, offer selection)
diffFromId      String?   → Capture (previous capture for diff reference)
diffSummary     Json?     (what changed since last capture)
createdAt       DateTime

@@index([listingId, capturedAt])
@@index([capturedAt])
```

> `selectedDims` + `twisterModel` capture which variation was active and what options existed when the page was scraped. Critical for parent/child ASIN listings where images, title, bullets can change per selection.

#### CaptureSchedule
```
id              String    @id @default(cuid())
listingId       String    @unique → Listing
intervalMinutes Int       @default(360)
nextRunAt       DateTime
enabled         Boolean   @default(true)
lastCaptureId   String?   → Capture
updatedAt       DateTime
```

---

## Description Visibility Rule

When an EBC revision is active (either via composition or direct `activeEbcId`):
- Description section is **collapsed by default** behind the EBC
- A subtle "Show product description" toggle sits below the EBC
- Visual indicator: dimmed/grayed to signal it's not visible on the live Amazon listing
- Tooltip: "Hidden on Amazon when A+ Content is active"

When no EBC revision is active:
- Description renders in its normal position below the fold

This mirrors Amazon's actual behavior where A+ Content replaces the product description.

---

## Capture Auto-Revision Rules

When a capture detects changes, it can auto-create revisions for some tracks but NOT others:

| Track | Auto-create from capture? | Why |
|-------|---------------------------|-----|
| Title | Yes | Title text is reliably scrapeable from `#productTitle` |
| Bullets | Yes | Bullet text is reliably scrapeable from `#feature-bullets` |
| Description | **No** | When A+ is active, PDP shows A+ in the "Product description" area, not the seller's HTML description. Would version the wrong thing. Manual-only. |
| Gallery | Yes (images only) | Capture stores gallery media as **external URL references** (no S3 ingest required for v1). Video requires separate handling. |
| EBC | Yes, as RAW_HTML modules | Capture stores raw A+ HTML, sanitizes it, and renders via sandboxed iframe. Structured parsing comes later. |

**Capture drift policy (avoid false alerts):**
- Drift is evaluated against versioned tracks (title/bullets/gallery/A+/description) using normalized hashes and per-field diffs
- Buy box fields (price, delivery estimates, stock messages, coupons) are displayed from capture but are noisy and should not trigger “attention” by default unless explicitly enabled per listing/context

---

## Routes

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/listings` |
| `/listings` | All tracked listings (ASIN grid/table) |
| `/listings/new` | Add a new listing to track |
| `/listings/[id]` | **Listing page replica** — the main feature |
| `/listings/[id]/compare` | Side-by-side A/B comparison (Phase 7) |
| `/listings/[id]/history` | Version timeline across all 5 tracks |
| `/listings/[id]/captures` | Capture history + screenshots |
| `/attention` | Drift alerts / change detection queue |
| `/tests` | A/B test dashboard (Phase 7) |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/listings` | GET/POST | List/create listings |
| `/api/listings/[id]` | GET/PATCH | Get/update listing |
| `/api/listings/[id]/titles` | GET/POST | Title revision history / create new |
| `/api/listings/[id]/bullets` | GET/POST | Bullets revision history / create new |
| `/api/listings/[id]/descriptions` | GET/POST | Description revision history / create new |
| `/api/listings/[id]/gallery` | GET/POST | Gallery revision history / create new |
| `/api/listings/[id]/ebc` | GET/POST | EBC revision history / create new |
| `/api/listings/[id]/compositions` | GET/POST | Composition history / create new |
| `/api/listings/[id]/activate` | PATCH | Set active revisions or composition |
| `/api/media/presign` | POST | S3 presigned upload URLs for media |
| `/api/listings/[id]/captures` | GET | Capture history |
| `/api/attention` | GET/POST | Attention queue / acknowledge |

---

## UI Components

### Amazon Replica Components

```
components/listing-page/
  ListingPageShell.tsx         — 3-column Amazon PDP layout (leftCol + centerCol + rightCol above fold)
  ImageGallery.tsx             — main image + thumbnail strip with video slot
  ProductTitle.tsx             — title with version badge overlay
  BulletPoints.tsx             — up to 5 feature bullets with version badge
  BuyBox.tsx                   — right column: price, delivery, stock, coupons, add-to-cart (read-only from capture)
  StarRating.tsx               — star display + review count (from capture)
  VariationSelector.tsx        — read-only twister display (from capture selectedDims)
  EbcSection.tsx               — A+ content section renderer (dispatches to section type)
  EbcBrandStory.tsx            — "From the brand" section
  EbcProductDescription.tsx    — main A+ product description section
  EbcFullImageModule.tsx       — full-width image module
  EbcRawHtmlModule.tsx         — raw HTML module (captured A+ we can't parse yet)
  DescriptionSection.tsx       — product description (collapsible behind EBC)
  ReviewsSection.tsx           — reviews display (read-only from captures)
```

### Version Control Components

```
components/versions/
  RevisionBar.tsx              — top bar: shows active revision per track + dropdowns to switch
  RevisionBadge.tsx            — small badge on each element (e.g. "v3") with hover actions
  RevisionDrawer.tsx           — slide-out panel: revision history for one track
  RevisionDiff.tsx             — text diff highlighting between two revisions
  MediaUploader.tsx            — drag-and-drop image/video upload (gallery or EBC)
  CompositionPicker.tsx        — build a composition by selecting one revision per track
```

### App Shell

```
components/shell/
  AppSidebar.tsx               — left nav sidebar
  AppHeader.tsx                — top bar
  PageHeader.tsx               — page title + breadcrumbs
```

---

## Implementation Phases

### Phase 1: Foundation + Listing Replica UI
- Next.js app scaffold (layout, auth, sidebar, routing)
- Prisma schema with Listing + all revision models + MediaAsset + Capture
- Amazon PDP replica components with **mock/hardcoded data**
- **3-column layout** matching the archive: leftCol (images), centerCol (title/bullets), rightCol (buy box)
- All sections: image gallery, title, rating, bullets, buy box (price/delivery/stock/coupons), A+ (brand story + product description sections), description, reviews
- Visual fidelity first — replicate the reference HTML/CSS pixel-perfect (preserve DOM structure + classnames as much as practical)
- Reference fixture should live in-repo (source: Archive.zip): `apps/argus/fixtures/amazon-pdp/listingpage.html` + `apps/argus/fixtures/amazon-pdp/listingpage_files/`

### Phase 2: Listings CRUD
- Create/list/edit listings (ASIN + marketplace)
- Listing detail page wired to the replica shell

### Phase 3: Gallery Versioning
- MediaAsset + GalleryRevision + GallerySlot (append-only revisions; editor saves create new revision)
- S3 presigned upload flow
- Image gallery renders from active gallery revision
- Video slot support (mimeType-aware)
- Revision drawer for gallery history

### Phase 4: Copy Versioning (Title + Bullets + Description)
- TitleRevision, BulletsRevision, DescriptionRevision (append-only revisions; editor saves create new revision)
- Edit-in-place UI on the listing replica (click element → edit → save as new revision)
- Revision drawer with text diffs
- Description hidden-behind-EBC behavior

### Phase 5: EBC Versioning
- EbcRevision + EbcSection + EbcModule (append-only revisions; editor saves create new revision)
- Section types: BRAND_STORY, PRODUCT_DESCRIPTION, SUSTAINABILITY
- FULL_IMAGE module type for manual creation
- RAW_HTML module type for captured content
- Add/remove/reorder modules within sections

### Phase 6: Compositions + Capture Integration
- Composition model — pin revisions from each track
- `activeCompositionId` on Listing with precedence over per-track pointers
- Active composition switching
- Capture worker + schedule
- Auto-revision creation (title, bullets, gallery — NOT description when A+ active)
- RAW_HTML A+ capture fallback
- Drift detection (captured vs active)
- Attention queue

### Phase 7: A/B Testing
- SplitTest model
- Create tests with two compositions as variants
- Side-by-side comparison view
- Manual winner declaration (metric import later)

---

## Future Considerations (not in current phases)

- **Variation families** — parent/child ASIN awareness, per-variation gallery/title/bullets. Currently we store `selectedDims` on Capture for context but don't model variation trees.
- **Push-to-Amazon** — SP-API integration to actually update listings from Argus. Purely planning/preview/tracking for now.
- **Category-specific constraints** — title/bullet char limits vary by marketplace/category. Store constraints per listing when we have category data.

---

## Tech Stack

- **Framework**: Next.js 16 (standalone, basePath=/argus)
- **UI**: Archive-first replica styling (import/scoped reference CSS + preserve DOM/classnames) + shadcn/ui/Tailwind for app shell and non-replica UI
- **DB**: PostgreSQL (portal_db, schema: dev_argus / argus)
- **ORM**: Prisma (packages/prisma-argus)
- **Storage**: AWS S3 (content-addressed by sha256) + external URL refs for captured media
- **Auth**: @targon/auth (Portal SSO, role-gated)
- **State**: Zustand (client-side)
- **Validation**: Zod (API request schemas)

---

## Key Decisions

- **3-column layout** — leftCol (images) + centerCol (title/bullets) + rightCol (buy box), matching Amazon's actual PDP structure
- **5 independent version tracks** — title, bullets, description, gallery, EBC each versioned separately
- **Explicit bullet fields** (bullet1-5, all nullable) — cleaner diffs, supports listings with fewer than 5 bullets
- **Append-only revisions (true immutability)** — revisions (and their child rows) are never patched; editors save by creating a new revision (new `seq`) with a full child set
- **Complete compositions** — compositions are deterministic and always specify all 5 track revisions; “none” states are represented by empty revisions
- **Shared MediaAsset table** — gallery and EBC images/video pull from the same pool; S3-backed assets are deduplicated by sha256; captured media can start as external URL references
- **Presigned upload verification** — server finalizes uploads by computing sha256 + extracting metadata from S3 before committing MediaAsset rows / final keys
- **EBC has sections** — BRAND_STORY / PRODUCT_DESCRIPTION / SUSTAINABILITY, each containing ordered modules. Matches Amazon's actual `aplus*_feature_div` structure
- **RAW_HTML module type** — escape hatch for captured A+ content we can't structurally parse yet, with sanitize + sandbox rendering. Prevents "replica can't show what Amazon shows"
- **Description is manual-only** — capture worker does NOT auto-create DescriptionRevisions when A+ is active (would version the wrong content)
- **sourceCaptureId on revisions** — traces auto-created revisions back to the capture that triggered them
- **activeCompositionId** — composition takes precedence over per-track active pointers when set
- **Buy box is read-only from capture** — renders real delivery dates, stock, coupons, promos from `extractedData`, not static placeholders
- **Capture context + twister model** — store capture environment + a full twister model so drift and UI are explainable and the variation selector can be rendered read-only
- **GallerySlot (not GalleryImage)** — slots can hold images or video
- **seq concurrency** — unique constraint + retry, no separate counter table
- **Fresh start** — no code or schema carried over from previous implementation
