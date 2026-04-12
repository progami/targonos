# 2026-04-11 Website UI Visibility Spec

## Goal
Document the website UI visibility failures across the public homepage and Caelum Star region flows, with emphasis on route renderability, visible navigation reachability, and promoted product surfaces that are either crashing or not visibly reachable from the UI.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-website-test-plan.md`
- `apps/website/next.config.mjs`
- `apps/website/src/app/layout.tsx`
- `apps/website/src/app/page.tsx`
- `apps/website/src/app/cs/page.tsx`
- `apps/website/src/app/cs/CaelumStarContent.tsx`
- `apps/website/src/app/cs/components/CsRegionLayout.tsx`
- `apps/website/src/app/cs/components/Header.tsx`
- `apps/website/src/app/cs/components/Footer.tsx`
- `apps/website/src/app/cs/us/layout.tsx`
- `apps/website/src/app/cs/uk/layout.tsx`
- `apps/website/src/app/cs/us/page.tsx`
- `apps/website/src/app/cs/us/packs/page.tsx`
- `apps/website/src/app/cs/us/packs/[slug]/page.tsx`
- `apps/website/src/app/cs/us/about/page.tsx`
- `apps/website/src/app/cs/us/gallery/page.tsx`
- `apps/website/src/app/cs/us/support/page.tsx`
- `apps/website/src/app/cs/us/where-to-buy/page.tsx`
- `apps/website/src/app/cs/uk/page.tsx`
- `apps/website/src/app/cs/uk/packs/page.tsx`
- `apps/website/src/app/cs/uk/packs/[slug]/page.tsx`
- `apps/website/src/app/cs/uk/about/page.tsx`
- `apps/website/src/app/cs/uk/support/page.tsx`
- `apps/website/src/app/cs/uk/where-to-buy/page.tsx`
- `apps/website/src/app/not-found.tsx`
- `apps/website/src/app/error.tsx`
- `apps/website/src/components/Header.tsx`
- `apps/website/src/components/Footer.tsx`
- `apps/website/src/components/ProductCard.tsx`
- `apps/website/src/components/HomeRuntime.tsx`
- `apps/website/src/content/products.ts`

## Repro Routes
- `/`: homepage with promoted links to `/cs`, `/cs/us/about`, and the Caelum Star route family from `apps/website/src/app/page.tsx`.
- `/cs`: region selector from `apps/website/src/app/cs/page.tsx`.
- `/cs/us` and `/cs/uk`: region landing pages from `apps/website/src/app/cs/us/page.tsx` and `apps/website/src/app/cs/uk/page.tsx`.
- `/cs/us/packs`, `/cs/us/about`, `/cs/us/gallery`, `/cs/us/support`, `/cs/us/where-to-buy`.
- `/cs/uk/packs`, `/cs/uk/about`, `/cs/uk/support`, `/cs/uk/where-to-buy`.
- `/cs/us/packs/[slug]` and `/cs/uk/packs/[slug]`: product detail routes expected by the test plan.
- `/404` or any unknown route to reach `apps/website/src/app/not-found.tsx`.

## Confirmed Issues
- The homepage visibly promotes routes that are currently failing to render. `plans/2026-04-11-cross-app-ci-smoke-spec.md` records `400` responses for route chunks under `/cs/us/packs`, `/cs/us/about`, and `/cs/us/where-to-buy`, and clicking `Packs` on `/` produced `Application error: a client-side exception has occurred` with `ChunkLoadError: Loading chunk 798 failed.` Those are all routes the homepage or Caelum Star shell actively promotes.
- The shared site shell makes the UK Caelum Star flow effectively invisible. The global website header in `apps/website/src/components/Header.tsx` hardcodes `Packs`, `Where to buy`, `Support`, and `About` to `/cs/us/*`. The global footer in `apps/website/src/components/Footer.tsx` also hardcodes the same US routes. The only visible path into the UK flow is the `/cs` region selector or a direct URL.
- The region selector and regional shell explicitly hide the global header, footer, and skip link. `apps/website/src/app/cs/page.tsx` injects CSS that sets `body > header`, `main#main-content + footer`, and `a[href="#main-content"]` to `display: none`. `apps/website/src/app/cs/components/CsRegionLayout.tsx` injects the same suppression for all `/cs/us/*` and `/cs/uk/*` routes. That removes the shared navigation and the accessibility skip link from the entire Caelum Star route family.
- Product detail pages are not visibly reachable from the main pack listings. `apps/website/src/components/ProductCard.tsx` only renders an outbound Amazon CTA. It does not render any internal link to `/cs/us/packs/[slug]` or `/cs/uk/packs/[slug]`. The test plan explicitly expects pack listings and known product detail routes to be navigable, but the list cards themselves do not expose that path.
- The 404 recovery CTA is mislabeled relative to its destination. In `apps/website/src/app/not-found.tsx`, the secondary button text is `View packs`, but it links to `/cs`, not to a packs route. That is a visible mismatch when the user lands on not-found and expects to recover into a product list.

## Likely Root Causes
- The public website is routing users into statically split Caelum Star segments that are not being proved in browser smoke. The chunk failures in `plans/2026-04-11-cross-app-ci-smoke-spec.md` show that promoted routes can ship in a broken state even when build checks pass.
- The site has two separate navigation systems: the shared website shell and the Caelum Star regional shell. The shared shell is US-only, while the region shell hides the shared shell entirely. That split makes route visibility inconsistent and hides the UK flow from the primary site chrome.
- The Caelum Star listing card component was optimized for external marketplace checkout, not for on-site route discoverability. That is why the product detail routes exist but are not clearly reachable from `apps/website/src/app/cs/us/packs/page.tsx` or `apps/website/src/app/cs/uk/packs/page.tsx`.
- The route-family CSS suppression in `apps/website/src/app/cs/page.tsx` and `apps/website/src/app/cs/components/CsRegionLayout.tsx` removes fallback navigation and skip-link accessibility instead of replacing them with an equivalent site-level alternative.

## Recommended Fixes
- Treat any chunk-load failure on promoted `/cs/*` routes as a release blocker and add browser assertions for the exact routes already failing in smoke.
- Stop hardcoding the shared website shell to US-only Caelum Star destinations. Either surface both regions in the global shell or route the shared shell through the region selector instead of silently biasing all links to `/cs/us/*`.
- Restore an equivalent accessibility and recovery path on the Caelum Star routes if the shared shell remains hidden. At minimum, do not hide the skip link without replacing it.
- Add an internal detail CTA or card-level link in `apps/website/src/components/ProductCard.tsx` so the product detail pages are visibly reachable from the pack listings that are supposed to lead users through the catalog.
- Align the 404 recovery copy with its actual destination. If the button says `View packs`, it should go to a packs route, not the region selector.

## Verification Plan
- Visit `/` and click `Packs`, `About`, and `Where to buy`; fail the smoke suite on any chunk `4xx`, `ChunkLoadError`, or client-side exception.
- Visit `/cs` and verify both region cards render and navigate, while ensuring there is still a visible recovery path back to the wider site.
- Verify `/cs/us/packs` and `/cs/uk/packs` each expose a visible internal route into at least one product detail page, not just outbound Amazon links.
- Verify `/cs/us/packs/[slug]` and `/cs/uk/packs/[slug]` are reachable through visible UI paths and render without asset failures.
- Verify the shared header/footer no longer hide the UK flow from the public site shell unless that is an explicit product decision.
- Verify the Caelum Star route family preserves an accessible skip-link or equivalent keyboard-first path after any shell changes.
- Verify the not-found recovery button labels match their actual destinations.

## Cross-App Notes
- `app-manifest.json` marks `website` as active.
- `plans/2026-04-11-cross-app-ci-smoke-spec.md` already identifies `website` as the clearest hard runtime failure in the current suite because the app loads initially but breaks as soon as promoted route chunks are fetched.
- `plans/2026-04-11-website-test-plan.md` already expects `/`, `/cs`, US and UK Caelum Star flows, and legal pages to be covered by browser smoke. The current route-visibility failures fit directly into that missing coverage.

## Open Questions
- Is the global website shell intentionally supposed to privilege the US Caelum Star flow, or is that just drift from the original content rollout?
- Should the Caelum Star route family keep hiding the main site shell, or should it inherit the shared header/footer and only add region-specific navigation on top?
- Are product detail pages meant to be a real public funnel step, or are they intentionally URL-only support pages behind the pack landing content?
- The chunk-load failures are confirmed from smoke, but the exact build/runtime cause is still not isolated from code inspection alone.
