# Website Visual Polish Improvement Plan

**Date:** January 2026  
**Focus:** Visual polish with moderate structural changes  
**Constraint:** Homepage remains mostly unchanged  
**Last Review:** January 24, 2026  
**Status:** IMPLEMENTATION COMPLETE

---

## Implementation Summary

- **Phase 1 (High Priority):** 10/10 items completed
- **Phase 2 (Medium Priority):** 15/15 items completed
- **Phase 3 (Low Priority):** 18/18 items completed

**Total: 43/43 items completed**

---

## Review Corrections

> Items verified during second-pass review of codebase.

| ID | Original Plan | Actual Status | Action |
|----|---------------|---------------|--------|
| GB2 | Add button press feedback | **ALREADY DONE** - Button.tsx has `motion-safe:active:scale-[0.98]` | Removed from plan |
| A3 | Button press scale | **ALREADY DONE** - Same as GB2 | Removed from plan |
| H3 | Add gradients + indicators | Gradients + arrows exist in HorizontalCarousel.tsx | Clarified: only **dot pagination** needed |
| CS6 | Carousel indicators | Same as H3 | Clarified: only **dot pagination** needed |
| P3 | Primary card styling | ProductFeatureCard.tsx already has `ring-1 ring-accent/40` | Clarified: only **ProductCard.tsx** needs ring |
| GF3 | Add social icons | `site.ts` has empty socials object | **BLOCKED** until Targon adds accounts |

---

## 1. Homepage (Minimal Changes)

> Keep the existing scroll-snap experience. Only minor refinements.

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| H1 | Scroll indicator | `↓` arrow is plain text, pulsing constantly | Replace with animated chevron SVG, pulse only on idle after 3s | Low |
| H2 | Hero CTA buttons | "About" has same prominence as primary CTA | Make "About" ghost style with subtle white border | Low |
| H3 | Products carousel | Fade gradients exist, but no pagination | Add scroll dot indicators for mobile users | Medium |

---

## 2. Caelum Star Page (Moderate Polish)

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| CS1 | Section spacing | 7 consecutive image-only sections feel monotonous | Add brief contextual headlines above 2-3 images | Medium |
| CS2 | Image hover | Scale effect is nice but could be elevated | Add subtle shadow lift on hover + optional parallax | Low |
| CS3 | Hero image | Static product shot | Add subtle floating animation (2-3px vertical movement) | Low |
| CS4 | Highlight chips | Chips are small and plain | Increase size slightly, consider icon prefixes | Low |
| CS5 | CTA buttons | "Learn more" and "Buy on Amazon" equal prominence | Make "Buy on Amazon" more prominent (accent + larger) | High |
| CS6 | Products carousel | Has arrows but no pagination dots | Add dot indicators below carousel | Medium |

---

## 3. Products Page (Moderate Changes)

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| P1 | Comparison table rows | No hover feedback | Add subtle row highlight on hover (`bg-surface/50`) | High |
| P2 | Table mobile scroll | Horizontal scroll works but no visual hint | Add shadow gradient on scroll edges | Medium |
| P3 | Primary ProductCard | ProductCard.tsx lacks accent ring (ProductFeatureCard has it) | Add `ring-1 ring-accent/40` to primary product in ProductCard | High |
| P4 | Card load animation | All cards appear at once | Add staggered reveal animation (already have delay, verify) | Low |
| P5 | Table header | Blends with content | Consider sticky header on scroll | Medium |

---

## 4. Product Detail Page (Visual Polish)

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| PD1 | Gallery images | Only zoom on hover, no full view | Add lightbox/modal for full-screen image viewing | High |
| PD2 | Specs table | Plain alternating rows | Add subtle zebra striping or left accent border | Medium |
| PD3 | Benefits cards | Basic monochrome icons | Add colored icon backgrounds (teal circle behind icon) | Medium |
| PD4 | Compare card image | Static | Add subtle hover parallax or overlay effect | Low |
| PD5 | Price display | Small text, easy to miss | Increase font size, add visual emphasis | High |
| PD6 | Breadcrumb | Missing | Add breadcrumb: Home > Products > [Product Name] | Medium |

---

## 5. Support, About, Where-to-Buy (Consistency)

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| S1 | Card layouts | Grid ratios vary across pages | Standardize to consistent 5/7 or 4/8 split | Medium |
| S2 | Page headers | Same style but plain | Add subtle accent line under h1 or decorative element | Low |
| S3 | FAQ component | Exists in codebase but unused | Add FAQ accordion to Support page | High |
| S4 | Contact CTA | Repeated inconsistently | Create reusable `ContactCard` component | Medium |
| S5 | About image | Static | Add subtle reveal animation or parallax | Low |
| S6 | Where-to-buy list | Plain list items | Add hover states and visual hierarchy | Medium |

---

## 6. Global Components

### Header

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| GH1 | Logo size | `h-7` is small for brand presence | Increase to `h-8` | Medium |
| GH2 | Mobile CTA | Hidden on homepage mobile | Show smaller CTA button on mobile | Medium |
| GH3 | Active link | Underline animation only | Add subtle background pill on active state | Low |
| GH4 | Menu animation | Slide-down-fade is good | Keep as-is | - |

### Footer

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| GF1 | Email redundancy | Contact email appears 3 times | Remove duplicate in bottom copyright section | High |
| GF2 | Link hover | Color + translate only | Add underline animation matching header style | Low |
| GF3 | Social links | None present, site.ts socials empty | **BLOCKED** - Add when Targon creates accounts | - |

### Buttons

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| GB1 | Hierarchy unclear | Primary vs Accent used inconsistently | Convention: Accent = Purchase, Primary = Navigation | High |
| ~~GB2~~ | ~~Active/pressed state~~ | ~~No visual feedback on click~~ | **ALREADY DONE** - Button.tsx has active:scale | - |
| GB3 | Icon spacing | Inconsistent `ml-2` usage | Audit and standardize icon margins | Low |

---

## 7. Animation & Micro-interactions

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| A1 | Page transitions | Subtle fade between route changes | Low |
| A2 | Skeleton loading | Add loading skeletons for images on slow connections | Medium |
| ~~A3~~ | ~~Button press~~ | ~~Scale to 0.97 on `:active` state~~ | **ALREADY DONE** |
| A4 | Card hover | Consistent lift + shadow across ALL card components | High |
| A5 | Focus states | Visible `:focus-visible` ring on all interactive elements | High |
| A6 | Image blur-up | Ensure next/image placeholder blur is consistent | Low |

---

## 8. Accessibility & Performance

| ID | Area | Improvement | Priority |
|----|------|-------------|----------|
| AP1 | Focus indicators | Add `focus-visible:ring-2 ring-accent` to interactive elements | High |
| AP2 | Skip link | Add "Skip to main content" for keyboard/screen reader users | Medium |
| AP3 | Image alt text | Review and enhance descriptive alt texts on product images | Medium |
| AP4 | Color contrast | Audit `text-muted` against backgrounds (may need darkening) | Medium |
| AP5 | Reduced motion | Already respects `prefers-reduced-motion` - verified | - |

---

## 9. Legal & Error Pages (NEW)

> Identified during second-pass review.

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| L1 | Privacy/Terms pages | Plain styling, no Reveal animations, inconsistent | Add Reveal animations + Card wrapper for content | Medium |
| L2 | Error boundary | No `error.tsx` exists anywhere | Add error.tsx with retry button and support link | Medium |
| L3 | Loading states | No `loading.tsx` files | Add loading.tsx with skeleton/spinner | Low |
| NF1 | Not-found page | No animation, inconsistent with other pages | Add Reveal animation for consistency | Low |

---

## 10. Layout & Meta (NEW)

> Identified during second-pass review.

| ID | Area | Issue | Proposed Fix | Priority |
|----|------|-------|--------------|----------|
| M1 | Main element | No min-height, can cause footer jump | Add `min-h-[calc(100vh-4rem)]` or similar to main | Low |
| M2 | Twitter cards | Only OpenGraph meta, no Twitter cards | Add twitter:card, twitter:title, twitter:description | Low |

---

## Implementation Order

### Phase 1: High Priority (Immediate Impact) - COMPLETED

1. [x] **P1** - Comparison table row hover states
2. [x] **P3** - Primary ProductCard visual differentiation (ring)
3. [x] **S3** - Add FAQ to Support page
4. [x] **GF1** - Remove footer email redundancy
5. [x] **GB1** - Standardize button hierarchy (Accent = Buy)
6. [x] **A4** - Consistent card hover effects
7. [x] **A5/AP1** - Focus visible states (combined)
8. [x] **PD5** - Product price display emphasis
9. [x] **CS5** - CTA button hierarchy on Caelum Star
10. [x] **PD1** - Gallery lightbox implementation

### Phase 2: Medium Priority (Polish) - COMPLETED

1. [x] **H3/CS6** - Carousel dot pagination
2. [x] **P2** - Table mobile scroll shadow hints
3. [x] **P5** - Sticky table header
4. [x] **GH1** - Increase header logo size
5. [x] **GH2** - Mobile CTA visibility
6. [x] **L1** - Legal pages styling consistency
7. [x] **L2** - Add error boundary
8. [x] **PD2** - Specs table zebra striping
9. [x] **PD3** - Benefits card icon styling
10. [x] **PD6** - Add breadcrumb navigation
11. [x] **S1** - Standardize page grid layouts
12. [x] **S4** - Create reusable ContactCard component
13. [x] **S6** - Where-to-buy list hover states
14. [x] **AP2** - Skip link for accessibility
15. [x] **A2** - Skeleton loading states

### Phase 3: Low Priority (Refinements) - COMPLETED

1. [x] **H1** - Animated scroll indicator
2. [x] **H2** - Hero button ghost variant (already ghost-like with outline + dark overlay)
3. [x] **CS1** - Add headlines to image sections
4. [x] **CS2** - Enhanced image hover effects (shadow lift + translate on hover)
5. [x] **CS3** - Floating hero animation (gentle up/down movement)
6. [x] **CS4** - Highlight chip styling (accent colors + check icons)
7. [x] **S2** - Page header accent lines (teal accent bar under headings)
8. [x] **S5** - About image parallax (zoom on hover)
9. [x] **GH3** - Active nav pill background (subtle pill highlight)
10. [x] **GF2** - Footer link underline animation (accent underline on hover)
11. [x] **L3** - Loading states (included in A2)
12. [x] **NF1** - Not-found page animation
13. [x] **M1** - Main element min-height
14. [x] **M2** - Twitter card meta
15. [x] **A1** - Page transition animations (fade-in via template.tsx)
16. [x] **A6** - Image blur-up consistency (Next.js handles automatically)
17. [x] **GB3** - Icon spacing audit (removed redundant ml-2 from button icons)
18. [x] **P4** - Card stagger animation verification (already working via Reveal delay)

---

## File Changes Summary

### New Components to Create

- `components/Lightbox.tsx` - Image gallery modal
- `components/ContactCard.tsx` - Reusable contact CTA
- `components/Breadcrumb.tsx` - Navigation breadcrumbs
- `components/CarouselDots.tsx` - Dot pagination for carousels
- `components/SkipLink.tsx` - Accessibility skip link

### New Pages to Create

- `app/error.tsx` - Error boundary

### Components to Modify

- `components/Header.tsx` - Logo size, mobile CTA
- `components/Footer.tsx` - Remove redundancy, link hover
- `components/Card.tsx` - Add hover effects
- `components/ProductCard.tsx` - Primary product ring styling
- `components/HorizontalCarousel.tsx` - Add dot pagination

### Pages to Modify

- `app/layout.tsx` - Add SkipLink, Twitter meta
- `app/products/page.tsx` - Table hover, scroll hints, sticky header
- `app/products/[slug]/page.tsx` - Lightbox, specs styling, breadcrumb, price
- `app/caelum-star/page.tsx` - CTA hierarchy, section labels
- `app/support/page.tsx` - Add FAQ section
- `app/about/page.tsx` - Layout consistency
- `app/where-to-buy/page.tsx` - List hover states
- `app/legal/privacy/page.tsx` - Add Reveal + Card
- `app/legal/terms/page.tsx` - Add Reveal + Card
- `app/not-found.tsx` - Add Reveal animation

### CSS to Add (globals.css)

- Table row hover states
- Primary card accent ring utility
- Skeleton loading animation keyframes
- Skip link styles

---

## Notes

- All changes respect existing design system (CSS variables, Tailwind config)
- Motion animations respect `prefers-reduced-motion`
- No breaking changes to existing functionality
- Homepage changes are minimal as requested
- Button active states already implemented - no changes needed
- Social links blocked until Targon creates social accounts

---

## Implementation Log

### New Files Created
- `components/Lightbox.tsx` - Full-screen image gallery modal with keyboard navigation
- `components/ProductGallery.tsx` - Gallery wrapper with lightbox integration
- `components/ScrollableTable.tsx` - Table wrapper with scroll shadow indicators
- `components/Breadcrumb.tsx` - Breadcrumb navigation component
- `components/ContactCard.tsx` - Reusable contact CTA card
- `components/SkipLink.tsx` - Accessibility skip-to-content link
- `app/error.tsx` - Error boundary with retry functionality
- `app/loading.tsx` - Loading skeleton state
- `app/template.tsx` - Page transition fade animation

### Files Modified
- `components/Header.tsx` - Larger logo, mobile CTA visibility
- `components/Footer.tsx` - Removed email redundancy
- `components/Card.tsx` - Added hover shadow transition
- `components/ProductCard.tsx` - Added primary product accent ring
- `components/HorizontalCarousel.tsx` - Added dot pagination for mobile
- `app/layout.tsx` - Added SkipLink, main min-height, Twitter meta
- `app/page.tsx` - Animated scroll indicator
- `app/products/page.tsx` - Table hover states, scroll hints, sticky header
- `app/products/[slug]/page.tsx` - Lightbox, breadcrumb, price emphasis, specs styling, benefit icons
- `app/caelum-star/page.tsx` - CTA button hierarchy, sustainability headlines
- `app/support/page.tsx` - Added FAQ section
- `app/about/page.tsx` - Added bottom padding
- `app/where-to-buy/page.tsx` - List item hover states
- `app/legal/privacy/page.tsx` - Reveal animations, Card wrapper
- `app/legal/terms/page.tsx` - Reveal animations, Card wrapper
- `app/not-found.tsx` - Reveal animations
- `globals.css` - Global focus-visible styles

### Build Verification
- TypeScript: PASS
- ESLint: PASS (no warnings or errors)
