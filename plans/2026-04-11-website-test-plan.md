# 2026-04-11 Website Test Plan

## Purpose
Define the CI smoke suite for the public website so marketing and Caelum Star routes fail in CI when route chunks break or static pages stop rendering.
The website is the public-facing marketing/product surface: homepage, region selector, US/UK Caelum Star product flows, and legal pages are the main routes that need protection.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, failed JS chunk loads, and unexpected `4xx`/`5xx` for route assets.
- Include a signed-out public-user profile because auth is not part of this app.

## P0 Flows

### 1. Home
Routes: `/`

Checks:
- Homepage renders hero and CTA links.
- Main navigation and footer render.

### 2. Region Selector
Routes: `/cs`

Checks:
- Region selection page renders.
- US and UK cards navigate correctly.

### 3. US Caelum Star Flow
Routes: `/cs/us`, `/cs/us/packs`, `/cs/us/packs/[slug]`, `/cs/us/about`, `/cs/us/gallery`, `/cs/us/support`, `/cs/us/where-to-buy`

Checks:
- US landing renders.
- Packs listing loads and product cards link successfully.
- Known product detail route renders.
- About, gallery, support, and where-to-buy pages load without chunk failures.

### 4. UK Caelum Star Flow
Routes: `/cs/uk`, `/cs/uk/packs`, `/cs/uk/packs/[slug]`, `/cs/uk/about`, `/cs/uk/support`, `/cs/uk/where-to-buy`

Checks:
- UK landing renders.
- Packs listing loads and product cards link successfully.
- Known product detail route renders.
- About, support, and where-to-buy pages load without chunk failures.

### 5. Legal Pages
Routes: `/legal/privacy`, `/legal/terms`

Checks:
- Both pages render static content.

## P1 Flows

### 6. Cross-Link Integrity
Routes: all above

Checks:
- Header/footer links are valid.
- Primary CTA links to product or Amazon destinations are present.

### 7. Static Param Integrity
Routes: `/cs/us/packs/[slug]`, `/cs/uk/packs/[slug]`

Checks:
- Every statically generated product slug resolves successfully.
- Unknown slug returns not-found state.

## Fixtures and Data
- No auth fixture required.
- One known US product slug and one known UK product slug from content fixtures.

## Known Issues From 2026-04-11
- Clicking `Packs` from the live homepage caused `Application error: a client-side exception has occurred`.
- Browser console reported `ChunkLoadError`, and several route chunk requests returned `400`.
- Public-site CI needs explicit asset/chunk failure assertions because build-only checks are currently not catching this class of regression.
