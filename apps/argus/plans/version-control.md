# PDP Snapshot Version Control — Implementation Plan

## Problem

A cronjob visits the Amazon listing daily, presses Ctrl+S, and produces an HTML file + assets folder. We need to:
- Ingest that HTML, extract all structured data from it
- Render the PDP with our own React components (not raw HTML in an iframe)
- Track every version, detect changes, and show diffs
- Make images and variations fully interactive (native React, not dead Amazon JS)

## Core Insight

**The saved HTML is a data source, not the display layer.** We parse it with cheerio, extract everything (title, price, bullets, images, variations, A+ content), store the structured data in the DB, and render the PDP entirely in React/JSX. This gives us:

- **Full interactivity** — image thumbnails, variation selector, zoom — all native React
- **Clean diffing** — compare structured JSON, not raw HTML
- **Version control** — every field tracked independently, changes highlighted
- **Consistency** — different HTML structures (B2B vs consumer, old vs new ODF layout) produce the same normalized data

---

## Architecture

```
Cronjob: Ctrl+S on Amazon PDP
    │
    ▼
HTML file + assets folder (on disk or uploaded)
    │
    ▼
┌──────────────────────────────┐
│  Ingest Pipeline             │
│  1. Parse HTML with cheerio  │
│  2. Extract structured data  │
│  3. Copy images to storage   │
│  4. Diff against prev        │
│  5. Write Snapshot to DB     │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Database (Snapshot row)     │
│  - extractedData (JSON)      │
│  - images (local paths)      │
│  - aplusHtml (sanitized)     │
│  - diffSummary               │
│  - contentHash               │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  React PDP Components        │
│  - ImageGallery (clickable)  │
│  - ProductTitle              │
│  - BulletPoints              │
│  - PriceDisplay              │
│  - VariationSelector         │
│  - BuyBox                    │
│  - AplusContent (sandboxed)  │
│  - StarRating                │
│  All fed by extractedData    │
└──────────────────────────────┘
```

---

## Phase 1: Database + Snapshot Model

### 1.1 Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("ARGUS_DATABASE_URL")
  schemas  = ["argus_dev"]
}

model Listing {
  id            String     @id @default(cuid())
  asin          String
  marketplace   String     @default("US")
  label         String
  enabled       Boolean    @default(true)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  snapshots     Snapshot[]

  @@unique([marketplace, asin])
  @@schema("argus_dev")
}

model Snapshot {
  id            String    @id @default(cuid())
  listingId     String
  listing       Listing   @relation(fields: [listingId], references: [id])
  seq           Int       // monotonic version number (v1, v2, v3...)

  // Extracted structured data — this IS the PDP content
  extractedData Json      // ExtractedData (see below)
  contentHash   String    // sha256 of normalized extractedData for change detection

  // A+ content stored separately (can be large)
  aplusHtml     String?   // sanitized A+ HTML for sandboxed rendering
  aplusSections Json?     // structured A+ section metadata

  // Image storage
  // Images are copied from the saved HTML assets folder into:
  //   public/snapshots/{listingId}/{seq}/images/
  // extractedData.images contains relative paths to these
  imageStoragePath String  // "snapshots/{listingId}/{seq}/images"

  // Diff against previous
  prevSnapshotId String?
  prevSnapshot   Snapshot?  @relation("SnapshotDiff", fields: [prevSnapshotId], references: [id])
  nextSnapshots  Snapshot[] @relation("SnapshotDiff")
  diffSummary   Json?      // DiffSummary (see below)

  // Raw source reference (not served to client)
  rawHtmlPath   String?    // path to raw saved HTML on disk (for re-extraction if needed)

  // Metadata
  sourceUrl     String?
  capturedAt    DateTime
  ingestedAt    DateTime  @default(now())
  note          String?

  @@unique([listingId, seq])
  @@index([listingId, capturedAt])
  @@schema("argus_dev")
}
```

### 1.2 ExtractedData Schema

```ts
interface ExtractedData {
  // Title
  title: string

  // Brand
  brand: string | null

  // Bullets (up to 5)
  bullets: string[]

  // Pricing
  price: {
    current: string               // "$8.54"
    perUnit: string | null        // "$1.42 / count"
    typical: string | null        // "$8.99" (struck-through basis price)
    savings: string | null        // "$0.45 (5%)"
    isPrime: boolean
  }

  // Rating
  rating: number | null           // 4.3
  reviewCount: number | null      // 5287
  boughtPastMonth: string | null  // "1K+ bought in past month"

  // Images — stored as local paths relative to imageStoragePath
  images: {
    main: string                  // "main.jpg" (hi-res from data-old-hires)
    thumbnails: {
      position: number            // 0-based
      src: string                 // "thumb-0.jpg"
      hiRes: string               // "hires-0.jpg"
      isVideo: boolean
    }[]
  }

  // Variations (twister)
  variations: {
    dimensionLabel: string        // "Model"
    options: {
      name: string                // "6 PK - Light"
      asin: string                // "B09HXC3NL8"
      price: string | null        // "$8.54"
      selected: boolean
      available: boolean
    }[]
  } | null

  // Buy box
  buyBox: {
    inStock: boolean
    stockMessage: string | null   // "In Stock"
    seller: string | null         // "Targon LLC"
    fulfiller: string | null      // "Amazon"
    delivery: string | null       // "FREE delivery Wednesday, February 18"
    returnPolicy: string | null   // "30-day refund / replacement"
    addToCartEnabled: boolean
  }

  // Below-fold flags
  hasAplus: boolean
  hasProductDescription: boolean

  // Breadcrumbs
  breadcrumbs: string[]           // ["Tools & Home Improvement", "Paint...", ...]

  // Product details table
  productDetails: Record<string, string> | null  // { "Manufacturer": "Caelum Star", ... }
}
```

### 1.3 DiffSummary Schema

```ts
interface DiffSummary {
  changes: DiffChange[]
  changeCount: number
}

interface DiffChange {
  field: string           // "title", "price.current", "bullets[2]", "images.main"
  type: 'modified' | 'added' | 'removed'
  prev: string | null
  next: string | null
}
```

---

## Phase 2: Ingest Pipeline

### 2.1 Accepted Input

The cronjob produces two things:
1. An HTML file (e.g., `6pk.html`, `listingpage.html`)
2. An assets folder (e.g., `6pk/`, `listingpage_files/`)

The folder name varies — Chrome names it based on the page title. The pipeline must auto-detect the HTML file and its corresponding assets folder by matching the naming convention (`{name}.html` + `{name}/` or `{name}_files/`).

Upload accepts either:
- A `.zip` containing both (manual upload via UI)
- A directory path on disk (cronjob drops files to a watched directory)

### 2.2 Extractor (`lib/extractor.ts`)

Uses `cheerio` to parse the HTML and extract `ExtractedData`.

Key selectors (validated against both B2B and consumer HTML variants):

| Field | Primary Selector | Notes |
|-------|-----------------|-------|
| title | `#productTitle` | .trim() |
| brand | `#bylineInfo` | Text after "Brand: " or "Visit the ... Store" |
| bullets | `#feature-bullets .a-list-item` | Filter out empty/whitespace-only |
| price | `#corePrice_feature_div .a-price .a-offscreen` | First occurrence = current price |
| perUnit | `.a-price[data-a-size="mini"] .a-offscreen` in priceToPay area | Or `.pricePerUnit` |
| typical | `.basisPrice .a-offscreen` | Struck-through price |
| savings | `#savings-percentage, .savingsPercentage` | |
| rating | `#acrPopover .a-icon-alt` | Parse "4.3 out of 5 stars" |
| reviewCount | `#acrCustomerReviewText` | Parse "(5,287)" |
| boughtPastMonth | `#social-proofing-faceout-title-tk_bought` | |
| mainImage | `#landingImage` attr `data-old-hires` | Hi-res URL |
| thumbnails | `#altImages li.imageThumbnail img` | Position = DOM order |
| thumbnail hiRes | `data-old-hires` on parent, or `data-a-dynamic-image` JSON | |
| video thumb | `li` with `.videoThumbnail` class | |
| variations | `#twister_feature_div` + embedded `<script type="a-state">` JSON | Parse twister model JSON for complete data |
| inStock | `#availability .a-size-medium` | Contains "In Stock" |
| seller | `#merchant-info` or `#merchantInfoFeature_feature_div .offer-display-feature-text-message` | Two patterns (old vs new ODF) |
| fulfiller | `#fulfillerInfoFeature_feature_div` or check "Fulfilled by Amazon" in merchant-info | |
| delivery | `#deliveryBlockMessage .a-text-bold` | |
| aplus | `#aplus_feature_div` existence | |
| breadcrumbs | `#wayfinding-breadcrumbs_feature_div .a-link-normal` | |
| productDetails | `#productDetails_feature_div .prodDetTable td` | Key-value pairs |

### 2.3 Image Extractor

Images are the most important asset to persist locally (Amazon CDN URLs can change or expire).

For each snapshot:
1. Parse all image URLs from the HTML (main image, thumbnails, A+ images)
2. Check if the image exists in the saved assets folder (Chrome saves most of them)
3. Copy found images to `public/snapshots/{listingId}/{seq}/images/` with normalized names
4. For images NOT in the assets folder (e.g., lazy-loaded A+ images), store the Amazon CDN URL as fallback
5. Store local paths in `extractedData.images`

Image naming convention:
```
main.jpg                    # main product image (hi-res)
thumb-0.jpg ... thumb-8.jpg # thumbnails in position order
aplus-0.jpg ... aplus-N.jpg # A+ content images
```

### 2.4 A+ Content Extractor

A+ content is complex (brand story, product description sections with mixed layouts). Rather than trying to fully decompose it into structured data now:

1. Extract the raw HTML of each A+ section (`#aplus_feature_div`, `#aplusBrandStory_feature_div`)
2. Sanitize it (strip scripts, strip Amazon-specific attributes)
3. Rewrite image `src` attributes to point to our locally-stored copies
4. Store as `aplusHtml` on the Snapshot
5. Render in the React PDP inside a sandboxed container (not a full iframe — just a `<div>` with scoped styles)

Later (Phase 5 from PLAN.md), we decompose A+ into structured `EbcSection` / `EbcModule` records.

### 2.5 Diff Engine (`lib/differ.ts`)

Compares two `ExtractedData` objects field by field:

```ts
function diffSnapshots(prev: ExtractedData, next: ExtractedData): DiffSummary
```

Rules:
- **Title**: string equality after trim + normalize whitespace
- **Bullets**: compare each index. Detect add/remove/modify.
- **Price fields**: string comparison on each sub-field (current, perUnit, typical, savings)
- **Images**: compare main image by pixel hash (not URL — URLs change between saves). Compare thumbnail count and order.
- **Variations**: compare option names, prices, availability, selected state
- **Rating/Reviews**: numeric comparison
- **Buy box**: compare seller, fulfiller, stock, delivery
- **A+**: presence check only (detailed A+ diffing is future work)

Content hash for change detection:
```ts
contentHash = sha256(JSON.stringify(normalizeForHash(extractedData)))
```
`normalizeForHash` strips noisy fields (delivery date text, "order within X hours", review count minor fluctuations).

---

## Phase 3: React PDP Components

### 3.1 Component Tree

```
components/pdp/
  PdpShell.tsx              — outer 3-column Amazon layout
  ImageGallery.tsx          — main image + clickable thumbnails + video slot
  ProductTitle.tsx          — title text with optional version badge
  BrandLink.tsx             — "Brand: Caelum star"
  StarRating.tsx            — star icons + review count + "1K+ bought"
  PriceDisplay.tsx          — current price, per-unit, typical, savings, Prime badge
  VariationSelector.tsx     — clickable variant buttons (visual toggle)
  BulletPoints.tsx          — up to 5 feature bullets
  BuyBox.tsx                — right column: price, delivery, stock, add-to-cart (visual only)
  Breadcrumbs.tsx           — category breadcrumb trail
  AplusRenderer.tsx         — renders sanitized A+ HTML in a scoped container
  ProductDetailsTable.tsx   — technical details / additional info tables
```

### 3.2 ImageGallery (interactive)

```tsx
function ImageGallery({ images }: { images: ExtractedData['images'] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeImage = activeIndex === -1
    ? images.main
    : images.thumbnails[activeIndex]?.hiRes ?? images.main

  return (
    <div id="leftCol">
      <div id="imgTagWrapperId">
        <img src={activeImage} alt="Product" className="main-image" />
      </div>
      <div id="altImages">
        {images.thumbnails.map((thumb, i) => (
          <li
            key={i}
            className={i === activeIndex ? 'selected' : ''}
            onClick={() => setActiveIndex(i)}
          >
            {thumb.isVideo ? <VideoThumb /> : <img src={thumb.src} />}
          </li>
        ))}
      </div>
    </div>
  )
}
```

### 3.3 VariationSelector (interactive)

```tsx
function VariationSelector({ variations }: { variations: ExtractedData['variations'] }) {
  const [selectedIndex, setSelectedIndex] = useState(
    variations?.options.findIndex(o => o.selected) ?? 0
  )

  return (
    <div id="twister">
      <label>{variations?.dimensionLabel}:</label>
      <div className="variation-buttons">
        {variations?.options.map((opt, i) => (
          <button
            key={opt.asin}
            className={i === selectedIndex ? 'selected' : ''}
            onClick={() => setSelectedIndex(i)}
          >
            <span className="name">{opt.name}</span>
            <span className="price">{opt.price}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

### 3.4 Styling Approach

Two layers:
1. **Amazon reference CSS** — import a subset of Amazon's AUI (Amazon UI) CSS for layout classes (`a-section`, `a-spacing-*`, `a-container`, etc.). Extract the minimal CSS needed from the saved stylesheets. This gives us the exact Amazon layout grid.
2. **Component CSS** — Tailwind/CSS modules for our custom version-control UI elements (version bar, diff badges, etc.) that sit outside the PDP replica area.

The PDP components use Amazon class names where needed for layout fidelity, scoped under a `.pdp-replica` wrapper to avoid conflicts with the app shell.

### 3.5 A+ Content Rendering

A+ content is too complex to fully decompose into React components right now. Approach:

```tsx
function AplusRenderer({ html }: { html: string }) {
  // Render sanitized HTML in a scoped container
  // Amazon's A+ CSS is loaded as a scoped stylesheet
  return (
    <div
      className="aplus-container"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

The `aplusHtml` is sanitized on ingest (scripts stripped, event handlers stripped). Image `src` attributes are rewritten to point to our local copies. CSS from the saved assets folder provides the A+ layout.

---

## Phase 4: Version Control UI

### 4.1 Listing Detail Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Listings    Drop Cloth 6-Pack (B09HXC3NL8)     [Upload Snapshot] │
├──────────────────────────────────────────────────────────────────────┤
│  ┌── Version Bar ──────────────────────────────────────────────────┐ │
│  │ ◀ v3 (Feb 14) ▶ │ ●─●─[●] │  3 changes from v2 │ Compare ▾  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌── React PDP Replica ──────────────────────────────────────────┐  │
│  │  [ImageGallery]        [Title]                  [BuyBox]      │  │
│  │   clickable thumbs     [Brand]                   price        │  │
│  │   main image swap      [Rating ★★★★☆]           delivery     │  │
│  │                        [Price $8.54]             stock        │  │
│  │                        [Variations ●●●●]         seller       │  │
│  │                        [Bullets • • • • •]       CTA buttons  │  │
│  │                                                               │  │
│  │  [A+ Content — rendered from sanitized HTML]                  │  │
│  │  [Product Details Table]                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ┌── Change Summary (collapsible) ────────────────────────────────┐ │
│  │  ● Price: $8.54 → $8.99                                       │ │
│  │  ● Bullet 3: "6-PACK ESSENTIAL..." → "6-PACK PREMIUM..."      │ │
│  │  ● Main image changed (visual diff available)                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Diff Highlighting on the PDP

When viewing a version that has changes from the previous:
- Changed fields get a subtle colored border/highlight on the PDP itself
- Example: price text gets a yellow highlight if it changed from v2→v3
- Click the highlight to see prev/next values inline
- Toggle "Show changes" on/off in the version bar

### 4.3 Compare Mode (split-screen)

`/listings/[id]/compare?a=2&b=3`

```
┌─────────────────────────────┬──────────────────────────────┐
│  v2 (Feb 13)                │  v3 (Feb 14)                 │
│  ┌───── React PDP ────────┐│  ┌───── React PDP ─────────┐ │
│  │  Same components,      ││  │  Same components,       │ │
│  │  fed by v2 data        ││  │  fed by v3 data         │ │
│  │                        ││  │  changed fields          │ │
│  │                        ││  │  highlighted in yellow   │ │
│  └────────────────────────┘│  └──────────────────────────┘ │
├─────────────────────────────┴──────────────────────────────┤
│  Diff Panel (field-by-field comparison)                     │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Timeline View

`/listings/[id]/history`

Vertical timeline showing every snapshot with change badges:

```
  ● v3 — Feb 14, 2026    2 changes                    [View]
  │   ▸ Price: $8.54 → $8.99
  │   ▸ Bullet 3 modified
  │
  ● v2 — Feb 13, 2026    1 change                     [View]
  │   ▸ Main image changed
  │
  ● v1 — Feb 12, 2026    Initial snapshot              [View]
```

### 4.5 Upload Flow

1. User clicks "Upload Snapshot"
2. Selects either a `.zip` or an `.html` file (if `.html`, also select the assets folder)
3. `POST /api/listings/[id]/snapshots` — multipart upload
4. Server runs ingest pipeline → new Snapshot row
5. UI updates to show new version + change summary

---

## Phase 5: Image Storage + Serving

### 5.1 Storage Layout

```
public/snapshots/
  {listingId}/
    {seq}/
      images/
        main.jpg
        thumb-0.jpg
        thumb-1.jpg
        ...
        aplus-0.jpg
        aplus-1.jpg
        ...
```

Using `public/` means Next.js serves them as static files. No API route needed for images.

### 5.2 Image Deduplication

Many images stay the same between daily snapshots. To avoid storing duplicates:
1. Hash each image file (sha256)
2. Store in a content-addressable pool: `public/snapshots/images/{sha256}.{ext}`
3. The `extractedData.images` paths reference the pool: `/snapshots/images/{sha256}.jpg`
4. Same image across 30 snapshots = 1 file on disk

This solves the storage budget concern (18MB per snapshot → only new/changed images take space).

---

## Phase 6: Automated Ingest (Cronjob Integration)

### 6.1 Watch Directory

The cronjob drops saved HTML + assets to a known directory:
```
/data/argus-inbox/{asin}/
  6pk.html
  6pk/
```

A scheduled task (Node.js cron or PM2 cron) watches this directory:
1. Detects new HTML files
2. Matches ASIN from directory name
3. Runs the ingest pipeline
4. Moves processed files to archive directory
5. Cleans up

### 6.2 API-Based Ingest

Alternatively, the cronjob can POST directly to the API:
```bash
# Cronjob script
zip -r /tmp/snapshot.zip 6pk.html 6pk/
curl -X POST https://os.targonglobal.com/argus/api/listings/{id}/snapshots \
  -F "file=@/tmp/snapshot.zip"
```

---

## Implementation Order

| Step | What | Key Files |
|------|------|-----------|
| **1** | Prisma schema + initial migration | `packages/prisma-argus/schema.prisma` |
| **2** | Cheerio extractor | `lib/extractor.ts` |
| **3** | Diff engine | `lib/differ.ts` |
| **4** | Image extractor + storage | `lib/image-store.ts` |
| **5** | A+ content extractor + sanitizer | `lib/aplus-extractor.ts` |
| **6** | Ingest API route | `app/api/listings/[id]/snapshots/route.ts` |
| **7** | PDP React components (ImageGallery, Title, Price, Bullets, Variations, BuyBox) | `components/pdp/*.tsx` |
| **8** | Amazon CSS extraction (minimal AUI subset) | `styles/amazon-aui.css` |
| **9** | A+ renderer component | `components/pdp/AplusRenderer.tsx` |
| **10** | Listing detail page (renders PDP from snapshot data) | `app/(app)/listings/[id]/page.tsx` |
| **11** | Version bar + navigation | `components/versions/VersionBar.tsx` |
| **12** | Change summary + diff highlighting | `components/versions/ChangeSummary.tsx` |
| **13** | Compare mode | `app/(app)/listings/[id]/compare/page.tsx` |
| **14** | Timeline view | `app/(app)/listings/[id]/history/page.tsx` |
| **15** | Listings CRUD (dynamic, from DB) | `app/api/listings/route.ts`, listings page |
| **16** | Cronjob integration (watch dir or API) | `lib/inbox-watcher.ts` or script |
| **17** | Migrate existing B09HXC3NL8 fixture as v1 | one-time script |

---

## Decision: React Components vs Raw HTML Iframe

| | Raw HTML Iframe (old) | React Components (new) |
|---|---|---|
| **Interactivity** | Dead — all JS stripped | Full — native React event handlers |
| **Image clicks** | Broken | `useState` swaps main image |
| **Variation selector** | Broken | `useState` toggles selection |
| **Diffing** | Compare raw HTML (noisy) | Compare structured JSON (clean) |
| **Version control** | Store 2MB HTML files per version | Store ~5KB JSON per version + shared images |
| **Rendering consistency** | Depends on Amazon's CSS/HTML | Deterministic — same data = same render |
| **A+ content** | Works (raw HTML preserved) | Sandboxed HTML render (same fidelity) |
| **Storage** | 18MB per snapshot (HTML + all CSS/JS) | ~200KB per snapshot (JSON + unique images) |
| **CSS drift** | Amazon CSS changes between saves | Our CSS is stable, Amazon CSS only for A+ |
| **Maintenance** | Fragile (regex processing, script stripping) | Robust (cheerio parsing, typed data) |

---

## Open Questions

1. **Amazon AUI CSS**: How much of Amazon's CSS do we need to replicate the PDP look? Options:
   - (a) Extract minimal CSS from saved stylesheets (just layout classes) — most work upfront, cleanest
   - (b) Import all Amazon CSS scoped under `.pdp-replica` — quick but bloated
   - (c) Rewrite in Tailwind to match Amazon's look — most maintainable long-term

2. **A+ content fidelity**: A+ uses Amazon's full CSS with complex layouts. Do we:
   - (a) Render raw sanitized HTML with Amazon CSS (iframe-like, high fidelity)
   - (b) Parse A+ into structured modules and render with our own components (lower fidelity now, better long-term)

3. **Cronjob delivery method**: Does the cronjob:
   - (a) Drop files to a local directory (simplest)
   - (b) POST to the API (works for remote cronjobs)
   - (c) Both (start with local, add API later)

4. **Product details table**: Extract all fields from `#productDetails_feature_div`? Or just the key ones (ASIN, manufacturer, dimensions)?
