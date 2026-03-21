# Website CS Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Caelum Star routes from `/caelum-star/*` to `/cs/us/*` and `/cs/uk/*`, fix homepage issues, and add a gallery page.

**Architecture:** Move from query-param-based region switching to true URL-based region separation. A shared layout per region handles the CS chrome (header/footer + main chrome hiding). Each page hardcodes its region. The `/cs` root remains a region selector landing page.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, TypeScript

---

### Task 1: Create shared CS region layout component

**Files:**
- Create: `apps/website/src/app/cs/components/CsRegionLayout.tsx`

This component wraps all `/cs/us/*` and `/cs/uk/*` pages. It renders the CS header and footer, hides the main site chrome, and passes region context.

- [ ] **Step 1: Create the CsRegionLayout component**

```tsx
// apps/website/src/app/cs/components/CsRegionLayout.tsx
import type { ReactNode } from 'react';
import { CaelumStarHeader } from './Header';
import { CaelumStarFooter } from './Footer';

export function CsRegionLayout({
  region,
  children
}: {
  region: 'us' | 'uk';
  children: ReactNode;
}) {
  return (
    <div className="cs-scroll-wrap">
      <CaelumStarHeader region={region} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            body > header,
            main#main-content + footer,
            a[href="#main-content"] {
              display: none;
            }
          `
        }}
      />
      {children}
      <div className="cs-snap-section relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B273F] to-[#001220]" />
        <div className="relative z-10 [&>footer]:mt-0">
          <CaelumStarFooter region={region} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/app/cs/components/CsRegionLayout.tsx
git commit -m "feat(website): add shared CsRegionLayout component"
```

---

### Task 2: Move CS components to `/cs/components/`

**Files:**
- Move: `apps/website/src/app/caelum-star/components/Header.tsx` → `apps/website/src/app/cs/components/Header.tsx`
- Move: `apps/website/src/app/caelum-star/components/Footer.tsx` → `apps/website/src/app/cs/components/Footer.tsx`
- Move: `apps/website/src/app/caelum-star/components/Hero.tsx` → `apps/website/src/app/cs/components/Hero.tsx`
- Move: `apps/website/src/app/caelum-star/components/RegionCard.tsx` → `apps/website/src/app/cs/components/RegionCard.tsx`
- Move: `apps/website/src/app/caelum-star/caelumStarLanding.module.css` → `apps/website/src/app/cs/caelumStarLanding.module.css`
- Move: `apps/website/src/app/caelum-star/CaelumStarContent.tsx` → `apps/website/src/app/cs/CaelumStarContent.tsx`

- [ ] **Step 1: Create `cs/` directory and move all component files**

Move the files, updating their relative import paths for the CSS module (change `../caelumStarLanding.module.css` to `../caelumStarLanding.module.css` which stays the same relative path, or adjust as needed).

- [ ] **Step 2: Update Header.tsx nav links to use new `/cs/` paths**

Update the `navLinks` array:
```tsx
const navLinks = [
  { label: 'Packs', href: '/packs' },        // region prefix added dynamically
  { label: 'Where to buy', href: '/where-to-buy' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Support', href: '/support' },
  { label: 'About', href: '/about' }
];
```

Update link rendering to prepend `/cs/{region}` based on the `region` prop. Update the brand link from `/caelum-star` to `/cs`.

- [ ] **Step 3: Update Footer.tsx links to use new paths**

Update footer link columns to use `/cs/us/` or `/cs/uk/` paths. Add a `region` prop to `CaelumStarFooter` so it generates region-correct links.

- [ ] **Step 4: Commit**

```bash
git add apps/website/src/app/cs/
git commit -m "feat(website): move CS components to /cs/ directory with updated paths"
```

---

### Task 3: Create region selector page at `/cs`

**Files:**
- Create: `apps/website/src/app/cs/page.tsx`

- [ ] **Step 1: Create the `/cs` page**

Adapt the current `/caelum-star/page.tsx` but update region card hrefs:
- USA card: `/cs/us/packs`
- UK card: `/cs/uk/packs`

Keep the same layout: no header bar, region selector with hero. Use the moved components from `./components/`.

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/app/cs/page.tsx
git commit -m "feat(website): add /cs region selector page"
```

---

### Task 4: Create US layout and move US pages

**Files:**
- Create: `apps/website/src/app/cs/us/layout.tsx`
- Create: `apps/website/src/app/cs/us/page.tsx` (from `caelum-star-us/page.tsx`)
- Create: `apps/website/src/app/cs/us/packs/page.tsx` (from `caelum-star/products/page.tsx`)
- Create: `apps/website/src/app/cs/us/packs/[slug]/page.tsx` (from `caelum-star/products/[slug]/page.tsx`)
- Create: `apps/website/src/app/cs/us/where-to-buy/page.tsx` (from `caelum-star/where-to-buy/page.tsx`)
- Create: `apps/website/src/app/cs/us/support/page.tsx` (from `support/page.tsx`)
- Create: `apps/website/src/app/cs/us/about/page.tsx` (from `about/page.tsx`)

- [ ] **Step 1: Create US layout**

```tsx
// apps/website/src/app/cs/us/layout.tsx
import type { ReactNode } from 'react';
import { CsRegionLayout } from '../components/CsRegionLayout';

export default function CsUsLayout({ children }: { children: ReactNode }) {
  return <CsRegionLayout region="us">{children}</CsRegionLayout>;
}
```

- [ ] **Step 2: Create US content page**

Move `caelum-star-us/page.tsx` to `cs/us/page.tsx`. Update imports to point to `../CaelumStarContent` and `@/content/products`.

- [ ] **Step 3: Create US packs page**

Adapt `caelum-star/products/page.tsx`:
- Remove `searchParams` usage — hardcode `region = 'us'`
- Remove embedded `<CaelumStarHeader>` and `<CaelumStarFooter>` (layout handles this)
- Remove the `dangerouslySetInnerHTML` style block
- Remove the wrapping `cs-scroll-wrap` div and the footer CTA wrapper at the bottom (the layout handles footer)
- Update all internal links: `/caelum-star/products` → `/cs/us/packs`, `/caelum-star/where-to-buy` → `/cs/us/where-to-buy`, `/support` → `/cs/us/support`, `/caelum-star` → `/cs`
- Import products from `@/content/products` (not productsUK)

- [ ] **Step 4: Create US packs/[slug] page**

Adapt `caelum-star/products/[slug]/page.tsx`:
- Update breadcrumb links to `/cs/us/packs`
- Update "Compare packs" link to `/cs/us/packs`
- Update "See all packs" link to `/cs/us/packs`
- Keep `generateStaticParams` using US product slugs

- [ ] **Step 5: Create US where-to-buy page**

Adapt `caelum-star/where-to-buy/page.tsx`:
- Remove `searchParams` — hardcode US
- Remove header/footer/style hack
- Update all internal links to `/cs/us/*`
- Use US catalog only

- [ ] **Step 6: Create US support page**

Adapt `support/page.tsx`:
- Remove `searchParams` — hardcode US
- Remove header/footer/style hack
- Update all internal links to `/cs/us/*`

- [ ] **Step 7: Create US about page**

Adapt `about/page.tsx`:
- Remove `searchParams` — hardcode US
- Remove header/footer/style hack
- Update all internal links to `/cs/us/*`

- [ ] **Step 8: Commit**

```bash
git add apps/website/src/app/cs/us/
git commit -m "feat(website): add all US pages under /cs/us/"
```

---

### Task 5: Create UK layout and pages

**Files:**
- Create: `apps/website/src/app/cs/uk/layout.tsx`
- Create: `apps/website/src/app/cs/uk/page.tsx`
- Create: `apps/website/src/app/cs/uk/packs/page.tsx`
- Create: `apps/website/src/app/cs/uk/packs/[slug]/page.tsx`
- Create: `apps/website/src/app/cs/uk/where-to-buy/page.tsx`
- Create: `apps/website/src/app/cs/uk/support/page.tsx`
- Create: `apps/website/src/app/cs/uk/about/page.tsx`

- [ ] **Step 1: Create UK layout**

Same as US layout but with `region="uk"`.

- [ ] **Step 2: Create all UK pages**

Mirror the US pages but:
- Use `productsUK` instead of `products`
- Use UK terminology ("dust sheets" not "drop cloths")
- Use UK Amazon links
- All internal links use `/cs/uk/*` prefix
- UK content page uses `ukImages` from the old `caelum-star-uk/page.tsx`

- [ ] **Step 3: Create UK packs/[slug] with UK product slugs**

`generateStaticParams` should use `getProductSlugsUK()` (or equivalent). May need to add a UK slug getter to `products.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/website/src/app/cs/uk/
git commit -m "feat(website): add all UK pages under /cs/uk/"
```

---

### Task 6: Copy gallery images and create US gallery page

**Files:**
- Copy images: Google Drive folder → `apps/website/public/images/gallery/us/`
- Create: `apps/website/src/app/cs/us/gallery/page.tsx`

- [ ] **Step 1: Copy images from Google Drive to public folder**

```bash
mkdir -p apps/website/public/images/gallery/us
cp "/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Listing/Freelance Designs/Arqam/Test 5 White/CS/"* apps/website/public/images/gallery/us/
```

- [ ] **Step 2: Create the gallery page**

Build `/cs/us/gallery/page.tsx`:
- Clean editorial grid layout (not generic card grid)
- Show each image large with a friendly date below (e.g., "March 2026")
- Page title: "Gallery" with overline "Product Imagery"
- Use the CS design language (Prussian blue sections, same typography)
- No header/footer needed (layout handles it)
- Images shown in a responsive masonry-like grid using CSS columns
- Each image uses Next.js `<Image>` with proper sizing

Key design notes from frontend-design skill:
- Left-aligned heading, not centered
- Clean typography hierarchy with the CS overline pattern
- No cards wrapping images — let images breathe
- Subtle timestamp, not prominent

- [ ] **Step 3: Commit**

```bash
git add apps/website/public/images/gallery/us/ apps/website/src/app/cs/us/gallery/
git commit -m "feat(website): add US gallery page with product imagery"
```

---

### Task 7: Update main site Header

**Files:**
- Modify: `apps/website/src/components/Header.tsx`

- [ ] **Step 1: Update Header**

Changes:
1. Remove `{ label: 'Caelum Star', href: '/caelum-star' }` from `navLinks`
2. Update remaining nav links to use `/cs/us/` paths (since the main site header defaults to US):
   - `Packs` → `/cs/us/packs`
   - `Where to buy` → `/cs/us/where-to-buy`
   - `Support` → `/cs/us/support`
   - `About` → `/cs/us/about`
3. Change the "Buy Now" button: text → "Caelum Star", href → `/cs` (instead of Amazon URL), remove `target="_blank"` and `rel="noreferrer"`, make it a `<Link>` instead of `<a>`

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/components/Header.tsx
git commit -m "feat(website): update header - Caelum Star button, remove nav link, new paths"
```

---

### Task 8: Update main site Footer

**Files:**
- Modify: `apps/website/src/components/Footer.tsx`

- [ ] **Step 1: Update Footer links to new paths**

Update `footerLinks`:
```tsx
const footerLinks = {
  Explore: [
    { label: 'Home', href: '/' },
    { label: 'Caelum Star', href: '/cs' },
    { label: 'Packs', href: '/cs/us/packs' },
    { label: 'Where to buy', href: '/cs/us/where-to-buy' }
  ],
  Company: [
    { label: 'About', href: '/cs/us/about' },
    { label: 'Support', href: '/cs/us/support' }
  ],
  Legal: [
    { label: 'Privacy', href: '/legal/privacy' },
    { label: 'Terms', href: '/legal/terms' }
  ]
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/components/Footer.tsx
git commit -m "feat(website): update footer links to new /cs/ paths"
```

---

### Task 9: Fix homepage bottom black space

**Files:**
- Modify: `apps/website/src/app/page.tsx`
- Modify: `apps/website/src/components/Footer.tsx`

- [ ] **Step 1: Remove tg-snap from products section**

In `page.tsx`, change the products section (line 281):
```tsx
// Before:
<section className="tg-snap bg-black" id="products">
// After:
<section className="bg-black" id="products">
```

Also update the Container to remove `min-h-[100svh]` so the section sizes to content:
```tsx
// Before:
<Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6">
// After:
<Container className="relative z-10 flex flex-col items-center justify-center px-6 py-20 md:py-28">
```

- [ ] **Step 2: Remove footer mt-16**

In `Footer.tsx`, change:
```tsx
// Before:
<footer className="mt-16 border-t border-white/10 bg-black text-white">
// After:
<footer className="border-t border-white/10 bg-black text-white">
```

- [ ] **Step 3: Commit**

```bash
git add apps/website/src/app/page.tsx apps/website/src/components/Footer.tsx
git commit -m "fix(website): remove bottom black space on homepage"
```

---

### Task 10: Update homepage links to new paths

**Files:**
- Modify: `apps/website/src/app/page.tsx`

- [ ] **Step 1: Update all homepage links**

- Hero "Explore products" button: `/caelum-star` → `/cs`
- Hero "About" button: `/about` → `/cs/us/about`
- Products section "View Caelum Star" button: `/caelum-star` → `/cs`

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/app/page.tsx
git commit -m "feat(website): update homepage links to new /cs/ routes"
```

---

### Task 11: Update CaelumStarContent internal links

**Files:**
- Modify: `apps/website/src/app/cs/CaelumStarContent.tsx`

- [ ] **Step 1: Update all internal links in CaelumStarContent**

This component is used by both US and UK content pages. It needs a `region` prop to generate correct links.

Add `region: 'us' | 'uk'` to the component props. Update:
- `/caelum-star/products/${product.slug}` → `/cs/${region}/packs/${product.slug}`
- `/caelum-star/products` → `/cs/${region}/packs`
- `/caelum-star/where-to-buy` → `/cs/${region}/where-to-buy`

Update the US and UK page files to pass `region` prop.

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/app/cs/CaelumStarContent.tsx apps/website/src/app/cs/us/page.tsx apps/website/src/app/cs/uk/page.tsx
git commit -m "feat(website): add region prop to CaelumStarContent for correct links"
```

---

### Task 12: Delete old routes

**Files:**
- Delete: `apps/website/src/app/caelum-star/` (entire directory)
- Delete: `apps/website/src/app/caelum-star-us/` (entire directory)
- Delete: `apps/website/src/app/caelum-star-uk/` (entire directory)
- Delete: `apps/website/src/app/support/page.tsx`
- Delete: `apps/website/src/app/about/page.tsx`

- [ ] **Step 1: Remove old route directories**

```bash
rm -rf apps/website/src/app/caelum-star
rm -rf apps/website/src/app/caelum-star-us
rm -rf apps/website/src/app/caelum-star-uk
rm apps/website/src/app/support/page.tsx
rm apps/website/src/app/about/page.tsx
```

- [ ] **Step 2: Check for any remaining references to old paths**

Search for `/caelum-star` in the codebase and fix any remaining references.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(website): remove old caelum-star routes"
```

---

### Task 13: Update sitemap and metadata

**Files:**
- Modify: `apps/website/src/app/sitemap.ts` (if exists)
- Modify: `apps/website/src/app/robots.ts` (if exists)

- [ ] **Step 1: Update sitemap with new URLs**

Replace all `/caelum-star/*` URLs with `/cs/*` equivalents. Add gallery page.

- [ ] **Step 2: Commit**

```bash
git add apps/website/src/app/sitemap.ts
git commit -m "feat(website): update sitemap with new /cs/ routes"
```

---

### Task 14: Build verification

- [ ] **Step 1: Run build**

```bash
pnpm turbo build --filter=@targon/website
```

Expected: Build passes with no errors.

- [ ] **Step 2: Fix any build errors**

If any import paths or references are broken, fix them.

- [ ] **Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix(website): resolve build errors from route restructure"
```
