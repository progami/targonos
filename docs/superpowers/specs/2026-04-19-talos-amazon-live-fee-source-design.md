# Talos Amazon Live Fee Source Design

## Goal

Talos should stop treating persisted Amazon FBA fee snapshots as source of truth.

For FBA fee discrepancy work:

- the reference side remains the user-entered `fbaFulfillmentFee` on the SKU
- the Amazon side must come from live Amazon SP-API fee estimation
- Talos must stop storing `amazonFbaFulfillmentFee`

This change is intentionally narrower than a full Amazon fee architecture rewrite. It removes Amazon fee snapshot truth from Talos without changing the meaning of the reference fee field.

## Current State

### Reference side

- SKU create/edit still allows users to set `fbaFulfillmentFee`
- the SKU panel also auto-fills that field from local fee tables through `calculateFbaFeeForTenant(...)`
- the discrepancies page currently hydrates the reference fee from local fee logic instead of trusting the stored user field

### Amazon side

- the discrepancies route already fetches Amazon listing price and Amazon fee live through `getListingPrice(...)` and `getProductFeesForSku(...)`
- Talos still persists `amazonFbaFulfillmentFee` during Amazon SKU import
- the SKU API still accepts and returns `amazonFbaFulfillmentFee`
- the SKU modal still displays a persisted Amazon fee field

### Resulting problem

Talos is in an inconsistent mixed mode:

- the discrepancies page is partially live
- the database still looks like canonical Amazon fee storage
- the UI and API still expose that storage
- different paths disagree on whether the stored value matters

## Decision

Adopt one source-of-truth rule:

- `fbaFulfillmentFee` is a user-owned reference value
- Amazon FBA fee is live-only
- `amazonFbaFulfillmentFee` is removed from application contracts and no longer written

The discrepancies page will compare:

- `referenceFee = sku.fbaFulfillmentFee`
- `amazonFee = live SP-API fee estimate`

## Non-Goals

- Do not remove the user-facing `fbaFulfillmentFee` field
- Do not convert the page into a pure Amazon fee viewer
- Do not remove `amazonListingPrice` in this change
- Do not redesign the FBA fee tables page in this change
- Do not rewrite the user autofill behavior for the reference fee in this change

## Design

### 1. Discrepancy comparison behavior

The discrepancy route will continue to hydrate each row with live Amazon data before comparison.

Reference-side logic changes:

- stop deriving `fbaFulfillmentFee` from `calculateFbaFeeForTenant(...)` inside the discrepancies hydrator
- use the stored SKU `fbaFulfillmentFee` directly as the reference fee

Amazon-side logic remains live:

- load listing price via `getListingPrice(...)`
- load Amazon fee via `getProductFeesForSku(...)`
- keep using the live Amazon size tier returned by fees or derived from Amazon package dimensions when needed

This preserves the page’s real job:

- compare user-entered expected fee against Amazon’s current fee
- compare user-entered package data against Amazon’s package data

### 2. Remove persisted Amazon fee writes

Talos must stop writing `amazonFbaFulfillmentFee` everywhere.

Required changes:

- remove `amazonFbaFulfillmentFee` writes from Amazon SKU import
- remove `amazonFbaFulfillmentFee` from SKU create and update request validation
- remove `amazonFbaFulfillmentFee` from SKU create and update persistence

The import job may still persist other Amazon catalog data that remains useful:

- `amazonListingPrice`
- `amazonSizeTier`
- `amazonCategory`
- `amazonReferralFeePercent`
- Amazon package dimensions and weights

But `amazonFbaFulfillmentFee` itself is no longer stored.

### 3. Remove persisted Amazon fee reads from UI/API

Talos UI and API should stop exposing the removed field.

Required changes:

- remove `amazonFbaFulfillmentFee` from Prisma-backed SKU data contracts used by the SKU API
- remove it from the SKU form state and modal display
- remove it from any test fixtures and helper types that still assume it exists on a stored SKU row

The discrepancies page may still use an in-memory `amazonFbaFulfillmentFee` field on its response row object after live hydration. That field becomes transient response data, not persisted database state.

### 4. Prisma/schema handling

Application-level storage must be removed decisively.

Implementation rule:

- remove `amazonFbaFulfillmentFee` from the `Sku` Prisma model and all generated app usage

Database cleanup rule:

- create a Prisma migration that drops `skus.amazon_fba_fulfillment_fee`

If migration generation or deployment constraints block that drop cleanly, stop and report rather than quietly keeping the column alive in app code.

### 5. Out-of-scope schema

`AmazonFbaFeeAlert` also contains an `amazonFbaFulfillmentFee` snapshot field.

That model is currently not written by the live discrepancy path. This design keeps the current implementation scoped to the SKU source-of-truth issue and does not change `AmazonFbaFeeAlert` storage unless implementation review reveals active writes that would reintroduce the same problem.

If active writes to `AmazonFbaFeeAlert.amazonFbaFulfillmentFee` are discovered during implementation, they must be removed in the same change so Talos does not retain a second persisted Amazon fee truth path.

## File-Level Change Plan

### `apps/talos/src/lib/amazon/fba-fee-discrepancies.ts`

- remove reference-fee derivation from local fee tables inside discrepancy hydration
- keep live Amazon fee hydration
- ensure `computeComparison(...)` compares stored reference fee against live Amazon fee

### `apps/talos/src/app/api/amazon/fba-fee-discrepancies/route.ts`

- keep live listing-price and Amazon fee loading
- keep returning hydrated comparison rows
- ensure the route no longer depends on any persisted Amazon fee field on SKU

### `apps/talos/src/app/api/amazon/import-skus/route.ts`

- stop assigning `amazonFbaFulfillmentFee` into SKU update/create payloads
- keep other Amazon metadata writes that remain in scope

### `apps/talos/src/app/api/skus/route.ts`

- remove `amazonFbaFulfillmentFee` from zod schemas
- remove it from create/update persistence

### `apps/talos/src/app/config/products/skus-panel.tsx`

- remove persisted Amazon fee from form state, modal display, and submit payloads
- keep the user-owned reference `fbaFulfillmentFee`

### `apps/talos/prisma/schema.prisma`

- remove `Sku.amazonFbaFulfillmentFee`
- generate matching Prisma migration

## Testing Strategy

### Regression tests

Add or update unit coverage for:

- discrepancies use stored `fbaFulfillmentFee` as reference and live Amazon fee as Amazon side
- discrepancies do not derive reference fee from `calculateFbaFeeForTenant(...)`
- import flow does not persist `amazonFbaFulfillmentFee`
- SKU API rejects or ignores attempts to send `amazonFbaFulfillmentFee`

### Verification commands

Before PR:

- targeted Talos unit tests for discrepancies and SKU/import paths
- `pnpm --dir apps/talos type-check`
- `pnpm --dir apps/talos lint`

### Live verification

After deployment:

- confirm the discrepancy page still loads
- confirm Amazon fee values render from live hydration
- confirm the SKU modal no longer shows persisted Amazon fee

## Risks

### Increased live API dependence

The discrepancies page now fully depends on Amazon live fee estimation for the Amazon side. That is intentional, but failures will show up immediately instead of being masked by stale DB values.

### Reference fee misunderstanding

The user-owned `fbaFulfillmentFee` remains editable and may still be auto-filled from local fee logic in the SKU panel. That is acceptable for this change because the user field is explicitly the reference side, not Amazon truth.

### Migration coupling

Dropping the Prisma field and DB column touches generated types and any hidden usage. The implementation must search all Talos references before merge and fail loudly on stragglers.

## Success Criteria

- Talos no longer persists `amazonFbaFulfillmentFee` on `Sku`
- discrepancies compare stored user reference fee against live Amazon fee
- no Talos API or UI path treats stored Amazon fee snapshots as truth
- the discrepancy page and SKU flows still load correctly after deployment
