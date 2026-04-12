# 2026-04-11 Website Auth Spec
## Goal
Confirm whether `apps/website` is truly public at `/`, `/cs`, and `/legal/*`, and identify any website-side auth coupling, cross-app redirect dependency, or origin/topology assumption that can still break signed-out public entry.

## Files Reviewed
- Repo/runtime context: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-website-test-plan.md`, `README.md`.
- Website config/content: `apps/website/package.json`, `apps/website/README.md`, `apps/website/next.config.mjs`, `apps/website/src/content/site.ts`, `apps/website/src/content/products.ts`.
- Website root/public shell: `apps/website/src/app/layout.tsx`, `apps/website/src/app/template.tsx`, `apps/website/src/app/error.tsx`, `apps/website/src/app/loading.tsx`, `apps/website/src/app/not-found.tsx`, `apps/website/src/app/page.tsx`, `apps/website/src/app/sitemap.ts`, `apps/website/src/app/robots.ts`, `apps/website/src/components/Header.tsx`, `apps/website/src/components/Footer.tsx`, `apps/website/src/components/SkipLink.tsx`, `apps/website/src/components/HomeRuntime.tsx`, `apps/website/src/components/ProductCard.tsx`, `apps/website/src/components/ProductFeatureCard.tsx`, `apps/website/src/components/Breadcrumb.tsx`.
- Caelum Star route group and nav: `apps/website/src/app/cs/page.tsx`, `apps/website/src/app/cs/CaelumStarContent.tsx`, `apps/website/src/app/cs/components/Header.tsx`, `apps/website/src/app/cs/components/Footer.tsx`, `apps/website/src/app/cs/components/CsRegionLayout.tsx`, `apps/website/src/app/cs/components/RegionCard.tsx`, `apps/website/src/app/cs/components/Hero.tsx`, `apps/website/src/app/cs/us/layout.tsx`, `apps/website/src/app/cs/us/page.tsx`, `apps/website/src/app/cs/us/about/page.tsx`, `apps/website/src/app/cs/us/support/page.tsx`, `apps/website/src/app/cs/us/gallery/page.tsx`, `apps/website/src/app/cs/us/where-to-buy/page.tsx`, `apps/website/src/app/cs/us/packs/page.tsx`, `apps/website/src/app/cs/us/packs/[slug]/page.tsx`, `apps/website/src/app/cs/uk/layout.tsx`, `apps/website/src/app/cs/uk/page.tsx`, `apps/website/src/app/cs/uk/about/page.tsx`, `apps/website/src/app/cs/uk/support/page.tsx`, `apps/website/src/app/cs/uk/where-to-buy/page.tsx`, `apps/website/src/app/cs/uk/packs/page.tsx`, `apps/website/src/app/cs/uk/packs/[slug]/page.tsx`.
- Legal routes: `apps/website/src/app/legal/privacy/page.tsx`, `apps/website/src/app/legal/terms/page.tsx`.
- Auth/middleware scan: no `apps/website/middleware.*` file exists, and the reviewed website tree showed no direct `next-auth` or shared-auth helper imports.

## Repro Routes
- `/`
- `/cs`
- `/legal/privacy`
- `/legal/terms`
- `/cs/us/packs`
- `/cs/us/about`
- `/cs/us/where-to-buy`
- `/cs/uk/packs`
- `/cs/uk/where-to-buy`
- `/amazon/fba-fee-discrepancies`
- Smoke-evidenced path: `/` then click `Packs`, matching `plans/2026-04-11-cross-app-ci-smoke-spec.md`.

## Confirmed Issues
- `apps/website/next.config.mjs` redirects `/amazon/fba-fee-discrepancies` to the relative destination `/talos/amazon/fba-fee-discrepancies`. `README.md` documents the website on `targonglobal.com` / `dev.targonglobal.com` and the portal/Talos on `os.targonglobal.com` / `dev-os.targonglobal.com`, while `dev.local.apps.json` maps website to `3205` and Talos to `3201`. Inference: this redirect stays on the current website origin and depends on a Talos path mount the website app itself does not own.
- The global public shell bypasses the region selector and hard-codes US Caelum Star routes. `apps/website/src/components/Header.tsx`, `apps/website/src/components/Footer.tsx`, and `apps/website/src/app/page.tsx` all send signed-out users directly to `/cs/us/*`. That matches the smoke evidence in `plans/2026-04-11-cross-app-ci-smoke-spec.md`, which recorded `400` chunk requests for `/cs/us/packs`, `/cs/us/where-to-buy`, and `/cs/us/about`, then a `ChunkLoadError` when clicking `Packs` from `/`.
- Public metadata and discovery routes default to production origin. `apps/website/src/content/site.ts` defaults `site.domain` to `targonglobal.com`, and `apps/website/src/app/layout.tsx`, `apps/website/src/app/sitemap.ts`, and `apps/website/src/app/robots.ts` all emit `https://${site.domain}`. On `localhost` or `dev.targonglobal.com`, missing `NEXT_PUBLIC_SITE_DOMAIN` will emit production-origin metadata and sitemap URLs.
- UK public CTAs are inconsistent about retail origin. `apps/website/src/app/cs/components/Header.tsx` correctly switches UK header buy-now to `amazon.co.uk`, and `apps/website/src/content/products.ts` defines UK-specific `amazonUrl` values. But `apps/website/src/app/cs/uk/packs/page.tsx` and `apps/website/src/app/cs/uk/where-to-buy/page.tsx` still use `site.amazonStoreUrl`, which `apps/website/src/content/site.ts` hard-codes to a US Amazon listing.
- Local public-entry topology has no single source of truth. `apps/website/package.json` starts dev on `3105`, `apps/website/README.md` says `3205`, `dev.local.apps.json` maps website to `3205`, and the smoke discovery recorded live website traffic on `3005`.

## Likely Root Causes
- Website config is mixing three deployment models at once: separate website hostname from `README.md`, standalone local port mapping from `dev.local.apps.json`, and main/dev PM2-style port usage from `README.md` plus `apps/website/package.json`.
- The root shell treats `/cs/us/*` as the default global navigation target, so `/` and `/legal/*` inherit failures in the US product route group instead of isolating public entry behind `/cs`.
- Region handling is split between region-aware components such as `apps/website/src/app/cs/components/Header.tsx` and `apps/website/src/content/products.ts`, and a global site constant in `apps/website/src/content/site.ts`. That split leaks US retail URLs back into UK pages.
- No direct evidence yet of the exact runtime cause of the `400` chunk responses from the smoke spec. The code review only proves that the public shell eagerly links and likely prefetches those routes.

## Recommended Fixes
- Remove the website-relative Talos redirect in `apps/website/next.config.mjs`, or change it to an explicit portal/Talos origin that is actually owned by the portal host.
- Make the global website shell route through `/cs` or another region-neutral landing route, instead of hard-coding `/cs/us/*` in `apps/website/src/components/Header.tsx` and `apps/website/src/components/Footer.tsx`.
- Remove the production-domain fallback in `apps/website/src/content/site.ts` and require `NEXT_PUBLIC_SITE_DOMAIN` so `apps/website/src/app/layout.tsx`, `sitemap.ts`, and `robots.ts` emit the correct origin for the active environment.
- Replace UK-page uses of `site.amazonStoreUrl` with region-aware UK URLs sourced from `productsUK` or a dedicated region config shared across CS pages.
- Choose one canonical local website port and make `apps/website/package.json`, `apps/website/README.md`, `dev.local.apps.json`, and the smoke harness use that same value.

## Verification Plan
- Start the website on the canonical local port and verify `/`, `/cs`, `/legal/privacy`, and `/legal/terms` all render signed-out without redirecting to login, SSO, or product-app origins.
- From `/` and `/legal/privacy`, click global `Packs`, `Where to buy`, `Support`, and `About`; fail on `ChunkLoadError`, failed JS chunk requests, or unexpected `4xx`/`5xx`, consistent with `plans/2026-04-11-cross-app-ci-smoke-spec.md`.
- Verify `/cs` stays public and region selection routes cleanly to `/cs/us/packs` and `/cs/uk/packs`.
- Visit `/amazon/fba-fee-discrepancies` on the website host and confirm the final location is intentional. If it should hand off to Talos, assert that the redirect crosses to the portal/Talos origin rather than staying on website origin.
- Inspect emitted metadata, `robots.txt`, and `sitemap.xml` under the active host and confirm they use that host rather than defaulting to `targonglobal.com`.
- On UK routes, verify primary buy buttons resolve to `amazon.co.uk`, not the US `amazon.com` listing.

## Cross-App Notes
- The reviewed website route tree is public by code. `apps/website` has no `middleware.*`, and the reviewed routes/components do not import `next-auth` or the repo’s shared auth packages.
- Unlike Talos, xPlan, Kairos, Plutus, Hermes, and Argus, `apps/website/next.config.mjs` defines no `basePath` or `assetPrefix`. That matches the separate-hostname model documented in `README.md`.
- The only direct website-to-product-app coupling evidenced in reviewed website code is the `/amazon/fba-fee-discrepancies` redirect to Talos. No direct evidence yet of other website routes handing off into portal apps.

## Open Questions
- What is the intended canonical local website port for smoke and developer boot: `3005`, `3105`, or `3205`?
- Should `/amazon/fba-fee-discrepancies` be reachable from the public website hostname, or should it intentionally bounce to the portal/Talos hostname?
- What is causing the `400` chunk responses for `/cs/us/*` in the smoke pass? No direct evidence yet from the reviewed code; this needs runtime reproduction with server/network logs.
- Is `NEXT_PUBLIC_SITE_DOMAIN` guaranteed in every deploy environment, or is the production fallback in `apps/website/src/content/site.ts` currently relied on?
- Should the global website shell default to `/cs` instead of US-specific `/cs/us/*` links?
