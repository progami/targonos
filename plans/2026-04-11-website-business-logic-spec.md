# 2026-04-11 Website Business Logic Spec

## Goal
Document the website’s business-logic defects in product/catalog routing, region-specific purchase links, and CTA behavior so the public product flows send users to the correct pack and marketplace instead of the wrong SKU or wrong country store.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-website-test-plan.md`
- `apps/website/src/content/site.ts`
- `apps/website/src/content/products.ts`
- `apps/website/src/app/sitemap.ts`
- `apps/website/src/app/cs/CaelumStarContent.tsx`
- `apps/website/src/app/cs/components/Header.tsx`
- `apps/website/src/app/cs/us/packs/page.tsx`
- `apps/website/src/app/cs/us/packs/[slug]/page.tsx`
- `apps/website/src/app/cs/us/where-to-buy/page.tsx`
- `apps/website/src/app/cs/uk/packs/page.tsx`
- `apps/website/src/app/cs/uk/packs/[slug]/page.tsx`
- `apps/website/src/app/cs/uk/where-to-buy/page.tsx`
- `apps/website/src/components/ProductCard.tsx`

## Repro Routes
- `/cs/us/packs`, `/cs/us/packs/[slug]`, `/cs/us/where-to-buy`
- `/cs/uk/packs`, `/cs/uk/packs/[slug]`, `/cs/uk/where-to-buy`
- Any Caelum Star route using the shared regional header from `apps/website/src/app/cs/components/Header.tsx`

## Confirmed Issues
- The UK “where to buy” flow still points users at the US store URL. `apps/website/src/content/site.ts` defines `site.amazonStoreUrl` as the US Amazon listing. `apps/website/src/app/cs/uk/where-to-buy/page.tsx` uses that same `site.amazonStoreUrl` in its primary hero CTA and again in the main Amazon retailer card. A UK user on the UK purchase route is therefore sent to the US listing instead of the UK marketplace flow.
- Several UK pack variants map to the wrong Amazon SKU. In `apps/website/src/content/products.ts`, `6pk-strong` uses `AMAZON_UK_6PK`, `3pk-light` uses `AMAZON_UK_3PK`, and `10pk-light` uses `AMAZON_UK_12PK`. Those are distinct product entries with different pack/durability claims, but their purchase URLs collapse onto other pack variants.
- The regional header Buy Now CTA is product-agnostic and always points to the 6-pack listing. `apps/website/src/app/cs/components/Header.tsx` hardcodes the UK button to `https://www.amazon.co.uk/dp/B09HXC3NL8` and the non-UK button to `site.amazonStoreUrl`, which is also the 6-pack. On any product detail route, the persistent header CTA can therefore send the user away from the SKU currently being viewed.

## Likely Root Causes
- The website has one global “primary retail link” in `apps/website/src/content/site.ts`, and multiple route-level CTAs reuse it even on region-specific purchase pages where the country context should be explicit.
- Product catalog entries are being used as both merchandising content and purchase-source truth, but several UK entries were populated by copying neighboring variants and not correcting the destination ASIN.
- The regional header was implemented as a brand-level CTA, not a route-aware product CTA, so it does not honor the active product context on detail pages.

## Recommended Fixes
- Remove the US-store fallback from UK purchase surfaces. `/cs/uk/where-to-buy` should use UK-specific URLs only.
- Audit every `productsUK` purchase link and align each variant to the correct marketplace SKU before treating the catalog as canonical.
- Make the regional header CTA context-aware on product detail pages, or suppress it there and rely on the product-specific CTA inside the page content.
- Keep `site.amazonStoreUrl` for brand-level US marketing only; do not reuse it as a generic purchase destination across region-specific sales flows.

## Verification Plan
- Open `/cs/uk/where-to-buy` and confirm every visible “Buy” CTA stays on `amazon.co.uk`.
- Open each UK product detail route from `productsUK` and verify its CTA resolves to the correct matching pack and durability variant.
- Open a US and UK product detail page and confirm the persistent header CTA does not override the selected product with the 6-pack link unless that behavior is explicitly intended.
- Add route-level assertions that compare the selected product slug with the outbound purchase destination for every statically generated product page.

## Open Questions
- Are some UK variants intentionally sharing the same marketplace listing, or are these copied placeholder URLs that were never reconciled?
- Should the persistent header CTA remain a brand-level “main product” action, or should all product detail pages be strictly SKU-specific?
- Does the public site want a single canonical UK storefront URL in `site.ts`, or should all UK purchase flows be driven from `productsUK` only?
