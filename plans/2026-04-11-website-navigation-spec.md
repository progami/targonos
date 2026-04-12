# 2026-04-11 Website Navigation Spec
## Goal
Document the public website navigation contract across `/`, `/cs`, and the US/UK Caelum Star route families, with emphasis on canonical entry routes, region switching, header/footer links, error/not-found recovery, and the chunk-loading regression already observed in smoke.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-website-test-plan.md`
- `apps/website/next.config.mjs`
- `apps/website/src/app/page.tsx`
- `apps/website/src/app/cs/page.tsx`
- `apps/website/src/app/cs/components/CsRegionLayout.tsx`
- `apps/website/src/app/cs/components/Header.tsx`
- `apps/website/src/app/cs/components/Footer.tsx`
- `apps/website/src/app/cs/us/layout.tsx`
- `apps/website/src/app/cs/uk/layout.tsx`
- `apps/website/src/app/cs/us/page.tsx`
- `apps/website/src/app/cs/uk/page.tsx`
- `apps/website/src/app/cs/us/about/page.tsx`
- `apps/website/src/app/cs/uk/about/page.tsx`
- `apps/website/src/app/cs/us/packs/page.tsx`
- `apps/website/src/app/cs/uk/packs/page.tsx`
- `apps/website/src/app/not-found.tsx`
- `apps/website/src/app/error.tsx`
- `apps/website/src/components/Breadcrumb.tsx`

## Repro Routes
- `/`
- `/cs`
- `/cs/us`
- `/cs/us/packs`
- `/cs/us/packs/[slug]`
- `/cs/us/about`
- `/cs/us/gallery`
- `/cs/us/support`
- `/cs/us/where-to-buy`
- `/cs/uk`
- `/cs/uk/packs`
- `/cs/uk/packs/[slug]`
- `/cs/uk/about`
- `/cs/uk/support`
- `/cs/uk/where-to-buy`
- `/legal/privacy`
- `/legal/terms`
- unknown route -> not-found

## Confirmed Issues
- The known homepage-to-packs navigation path is broken by client chunk failures. `plans/2026-04-11-cross-app-ci-smoke-spec.md` and `plans/2026-04-11-website-test-plan.md` both record that clicking `Packs` from the live homepage produced `ChunkLoadError`, while route chunk requests for `/cs/us/packs`, `/cs/us/where-to-buy`, and `/cs/us/about` returned `400`.
- The region selector bypasses the region landing pages. `apps/website/src/app/cs/page.tsx` sends the US and UK cards directly to `/cs/us/packs` and `/cs/uk/packs`, while the route inventory and test plan treat `/cs/us` and `/cs/uk` as first-class landing routes. Current navigation skips those canonical region homepages entirely.
- The region-specific header has no in-flow link back to the current region landing page. `apps/website/src/app/cs/components/Header.tsx` links the Targon logo to `/` and the Caelum Star mark to `/cs`, but it does not provide a direct route back to `/cs/us` or `/cs/uk`. Region pages therefore lack a canonical “home for this region” destination in the persistent header.
- The not-found secondary recovery CTA is mislabeled. `apps/website/src/app/not-found.tsx` labels the second button `View packs` but links to `/cs`, which is the region selector, not an actual packs listing route.

## Likely Root Causes
- The website’s route contract is split between the general home page, the region selector, and the region layouts, and the region selector evolved toward product-list entry while the test plan still treats region landing pages as first-class navigation surfaces.
- The chunk-loading failure is not being caught by build checks because navigation relies on client-side route chunks and the current smoke coverage was too thin before the 2026-04-11 incident.
- Header/footer navigation is hand-authored and not driven by one route map, so labels and destinations have drifted apart.

## Recommended Fixes
- Fix the chunk-loading regression first and keep explicit browser assertions for route-chunk `4xx/5xx` failures in CI.
- Decide the canonical region-entry contract. If `/cs/us` and `/cs/uk` are real landing pages, change `/cs` region cards to point there. If packs should be the canonical first destination, update the website test plan to stop treating `/cs/us` and `/cs/uk` as the primary landing routes.
- Add an explicit header route back to the current region homepage (`/cs/us` or `/cs/uk`) so users can recover region context without leaving the flow.
- Align not-found recovery labels with actual destinations. If the button says `View packs`, it should land on a real packs route, not `/cs`.

## Verification Plan
- Assert `/` renders, and clicking `Packs` does not produce `ChunkLoadError` or route-chunk `400` requests.
- Assert `/cs` renders, and both region cards follow the chosen canonical contract consistently.
- Assert region header/footer links for US and UK all resolve successfully and stay within the expected route family.
- Assert `/cs/us/about`, `/cs/us/gallery`, `/cs/us/support`, `/cs/us/where-to-buy`, `/cs/uk/about`, `/cs/uk/support`, and `/cs/uk/where-to-buy` load with no chunk failures.
- Assert a 404 route renders `not-found`, and both recovery CTAs lead where their labels imply.

## Cross-App Notes
- `app-manifest.json` marks `website` as `active`.
- The cross-app smoke already isolated the website’s primary navigation failure mode: route chunks returning `400`, not auth or middleware issues.
- Unlike the internal apps, the website’s navigation contract is entirely public, so CI should fail on any chunk-load regression immediately.

## Open Questions
- Should `/cs/us` and `/cs/uk` remain first-class landing pages, or are `/cs/us/packs` and `/cs/uk/packs` the intended canonical entries?
- What caused the route-chunk `400` responses seen on 2026-04-11, and is it specific to the US route family or to all Caelum Star subroutes?
- Should the Caelum Star header brand link go to `/cs` or to the current region home?
