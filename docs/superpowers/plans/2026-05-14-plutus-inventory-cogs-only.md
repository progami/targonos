# Plutus Inventory COGS Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Plutus brand/SKU P&L reclassing while keeping category-level Amazon settlement posting and SKU/PO inventory asset-to-COGS release.

**Architecture:** QBO settlement JEs remain detailed by Amazon category and post to simple accounting accounts. Plutus uses SKU/PO detail only for inventory costing: QBO inventory asset inputs, settlement units sold/refunded, COGS release JEs, and Sellerboard COGS output. Existing P&L reclass storage remains as a NOOP compatibility field until the schema is intentionally simplified.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, TypeScript, QBO API client, custom Plutus test runner in `apps/plutus/tests/run.ts`.

---

## Scope

Included:
- Stop building P&L reclass lines from `computePnlAllocation`.
- Stop blocking settlement processing on SKU-less FBA/AWD/ad/storage fee allocation.
- Remove legacy brand-subaccount P&L allocation modules and tests.
- Update settlement audit so the expected P&L reclass is always NOOP.
- Add a live-safe repair script that deletes existing legacy P&L reclass JEs and sets stored IDs to NOOP after approval.
- Keep COGS inventory release unchanged except for removing any dependency on P&L allocation.

Excluded:
- Changing the Amazon settlement source JE generation.
- Changing COGS inventory release math.
- Changing QBO bills/purchases mapping.
- Creating QBO items/classes/departments.
- Posting SKU-level sales/fee data to QBO.

## File Structure

Modify:
- `apps/plutus/lib/plutus/settlement-processing.ts` - remove P&L allocation compute path and always preview/post a NOOP P&L reclass.
- `apps/plutus/lib/plutus/journal-builder.ts` - delete `buildPnlJournalLines`; keep `buildCogsJournalLines`.
- `apps/plutus/lib/plutus/settlement-types.ts` - remove P&L allocation block codes from processing blocks.
- `apps/plutus/scripts/settlement-processing-audit.ts` - stop expecting P&L reclass lines and treat non-NOOP P&L JEs as legacy cleanup mismatches.
- `apps/plutus/scripts/repair-missing-processing-jes.ts` - ensure repair does not recreate P&L reclass JEs.
- `apps/plutus/scripts/us-settlement-rematch.ts` - stop requiring non-empty P&L lines.
- `apps/plutus/scripts/uk-settlement-rematch.ts` - stop requiring non-empty P&L lines.
- `apps/plutus/scripts/settlement-reclass-repair.ts` - remove P&L reclass repair behavior or make it report legacy-only.
- `apps/plutus/tests/run.ts` - remove old P&L allocation tests and add inventory-COGS-only contract tests.

Delete:
- `apps/plutus/lib/pnl-allocation.ts`
- `apps/plutus/lib/plutus/fee-allocation.ts`
- `apps/plutus/lib/plutus/shipment-fee-allocation.ts`
- `apps/plutus/scripts/us-settlement-allocation-check.ts`

Create:
- `apps/plutus/scripts/retire-legacy-pnl-reclass.ts` - dry-run/apply cleanup for already-posted legacy P&L reclass JEs.

## Task 1: Lock The New Settlement Scope With Failing Tests

**Files:**
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Replace P&L allocation imports**

Remove these imports:

```ts
import { computePnlAllocation } from '../lib/pnl-allocation';
import {
  buildDeterministicSkuAllocations,
  deterministicSourceGuidanceForBucket,
} from '../lib/plutus/fee-allocation';
import {
  allocateShipmentFeeChargesBySkuQuantity,
  extractInboundTransportationServiceFeeCharges,
  isInboundTransportationMemoDescription,
  loadInboundShipmentItemsFromAwdInboundShipmentReports,
} from '../lib/plutus/shipment-fee-allocation';
```

Change the journal-builder import from:

```ts
import { buildCogsJournalLines, buildPnlJournalLines } from '../lib/plutus/journal-builder';
```

to:

```ts
import { buildCogsJournalLines } from '../lib/plutus/journal-builder';
```

- [ ] **Step 2: Delete obsolete tests**

Remove the tests whose names start with:

```text
computePnlAllocation leaves SKU-less fees unallocated without deterministic source
computePnlAllocation keeps positive inbound transportation reversals parent-level
computePnlAllocation allocates amazon seller fees when SKU is present
buildDeterministicSkuAllocations keeps inbound transportation reversals parent-level
extractInboundTransportationServiceFeeCharges parses transaction and context entries
allocateShipmentFeeChargesBySkuQuantity allocates by shipped quantity
loadInboundShipmentItemsFromAwdInboundShipmentReports reads Seller Central shipment quantities
computePnlAllocation routes AWD rows using deterministic SKU map
buildPnlJournalLines uses prefixed leaf accounts under AWD parent
computePnlAllocation tracks SKU breakdown for deterministic SKU-less fee rows
buildPnlJournalLines includes SKU breakdown in descriptions
```

- [ ] **Step 3: Add source contract tests**

Add these tests near the existing settlement-processing source tests:

```ts
test('settlement processing no longer builds brand or SKU P&L reclass lines', () => {
  const source = readFileSync('lib/plutus/settlement-processing.ts', 'utf8');

  for (const forbidden of [
    'computePnlAllocation',
    'buildDeterministicSkuAllocations',
    'deterministicSourceGuidanceForBucket',
    'buildPnlJournalLines',
    'PNL_ALLOCATION_SOURCE_GAP',
    'PNL_ALLOCATION_ERROR',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }

  assert.equal(source.includes("docNumber: buildProcessingDocNumber('P', invoiceId)"), true);
  assert.equal(source.includes('privateNote: `Plutus P&L Reclass | Invoice: ${invoiceId} | Hash: ${hashPrefix}`'), true);
  assert.equal(source.includes('lines: [],'), true);
});

test('journal builder exposes only inventory COGS lines, not P&L brand reclass lines', () => {
  const source = readFileSync('lib/plutus/journal-builder.ts', 'utf8');

  assert.equal(source.includes('export function buildCogsJournalLines'), true);
  assert.equal(source.includes('export function buildPnlJournalLines'), false);
  assert.equal(source.includes('MISSING_BRAND_SUBACCOUNT'), true);
  assert.equal(source.includes('Amazon Seller Fees - ${brand}'), false);
  assert.equal(source.includes('Amazon FBA Fees - ${brand}'), false);
});

test('settlement audit expects P&L reclass to be NOOP', () => {
  const source = readFileSync('scripts/settlement-processing-audit.ts', 'utf8');

  assert.equal(source.includes('const pnlExpectedLines: LineSummary[] = [];'), true);
  assert.equal(source.includes('computePnlAllocation'), false);
  assert.equal(source.includes('buildPnlJournalLines'), false);
  assert.equal(source.includes('buildDeterministicSkuAllocations'), false);
});
```

- [ ] **Step 4: Update blocking-code test**

Replace:

```ts
test('isBlockingProcessingCode blocks deterministic PNL allocation source gaps', () => {
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_ERROR'), true);
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_SOURCE_GAP'), true);
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_WARNING'), true);
  assert.equal(isBlockingProcessingCode('LATE_COST_ON_HAND_ZERO'), false);
});
```

with:

```ts
test('isBlockingProcessingCode only treats inventory and setup issues as processing blockers', () => {
  assert.equal(isBlockingProcessingCode('MISSING_SKU_MAPPING'), true);
  assert.equal(isBlockingProcessingCode('BILLS_PARSE_ERROR'), true);
  assert.equal(isBlockingProcessingCode('LATE_COST_ON_HAND_ZERO'), false);
  assert.equal(isBlockingProcessingCode('REFUND_ADJUSTMENT'), false);
});
```

- [ ] **Step 5: Run the targeted tests and verify failure**

Run:

```bash
pnpm -C apps/plutus test
```

Expected before implementation:

```text
FAIL settlement processing no longer builds brand or SKU P&L reclass lines
FAIL journal builder exposes only inventory COGS lines, not P&L brand reclass lines
FAIL settlement audit expects P&L reclass to be NOOP
```

## Task 2: Remove P&L Allocation From Settlement Processing

**Files:**
- Modify: `apps/plutus/lib/plutus/settlement-processing.ts`
- Modify: `apps/plutus/lib/plutus/settlement-types.ts`

- [ ] **Step 1: Remove imports**

In `apps/plutus/lib/plutus/settlement-processing.ts`, remove:

```ts
import { computePnlAllocation, type PnlAllocation, type PnlBucketKey } from '@/lib/pnl-allocation';
import {
  buildDeterministicSkuAllocations,
  deterministicSourceGuidanceForBucket,
} from '@/lib/plutus/fee-allocation';
import { buildCogsJournalLines, buildPnlJournalLines } from './journal-builder';
```

Replace the journal-builder import with:

```ts
import { buildCogsJournalLines } from './journal-builder';
```

- [ ] **Step 2: Delete empty P&L bucket helpers**

Delete these constants/functions from `settlement-processing.ts`:

```ts
const PNL_BUCKET_KEYS: PnlBucketKey[] = [
  'amazonSellerFees',
  'amazonFbaFees',
  'amazonStorageFees',
  'amazonAdvertisingCosts',
  'amazonPromotions',
  'amazonFbaInventoryReimbursement',
  'warehousingAwd',
];

function buildEmptyBucketAmounts(): Record<PnlBucketKey, Record<string, number>> {
  return Object.fromEntries(PNL_BUCKET_KEYS.map((bucket) => [bucket, {}])) as Record<PnlBucketKey, Record<string, number>>;
}

function buildEmptyBucketSkuBreakdown(): Record<PnlBucketKey, Record<string, Record<string, number>>> {
  return Object.fromEntries(PNL_BUCKET_KEYS.map((bucket) => [bucket, {}])) as Record<PnlBucketKey, Record<string, Record<string, number>>>;
}
```

- [ ] **Step 3: Replace the P&L allocation block**

Delete the block that starts with:

```ts
let pnlAllocation: PnlAllocation;
try {
  if (hasAuditRows) {
```

and ends immediately before:

```ts
// Match refunds to historical sales only when COGS is active.
```

Insert:

```ts
  // Settlement operating P&L is already posted on the settlement JE by category.
  // Plutus no longer builds brand/SKU fee reclass lines. SKU detail is used only for inventory COGS.
  const pnlLines: JournalEntryLinePreview[] = [];
```

If `JournalEntryLinePreview` is not imported as a value type in this file, add it to the local type import:

```ts
import type {
  ProcessingBlock,
  ProcessingReturn,
  ProcessingSale,
  KnownLedgerEvent,
  JournalEntryLinePreview,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';
```

- [ ] **Step 4: Remove P&L line building later in the file**

Delete:

```ts
  const pnlLines = buildPnlJournalLines(
    pnlAllocation.allocationsByBucket,
    mapping,
    accountsResult.accounts,
    invoiceId,
    blocks,
    pnlAllocation.skuBreakdownByBucketBrand,
  );
```

Keep the existing `pnlPreview` object, but make sure it uses the `pnlLines` constant from Step 3:

```ts
  const pnlPreview: JournalEntryPreview = {
    txnDate: settlement.TxnDate,
    docNumber: buildProcessingDocNumber('P', invoiceId),
    privateNote: `Plutus P&L Reclass | Invoice: ${invoiceId} | Hash: ${hashPrefix}`,
    lines: pnlLines,
  };
```

- [ ] **Step 5: Empty the preview P&L allocation field**

Replace:

```ts
pnlByBucketBrandCents: pnlAllocation.allocationsByBucket,
```

with:

```ts
pnlByBucketBrandCents: {},
```

- [ ] **Step 6: Remove P&L allocation block codes**

In `apps/plutus/lib/plutus/settlement-types.ts`, remove these union members:

```ts
| 'PNL_ALLOCATION_ERROR'
| 'PNL_ALLOCATION_SOURCE_GAP'
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected:

```text
settlement processing no longer builds brand or SKU P&L reclass lines ... PASS
```

Other failures are expected until the legacy modules and audit script are updated.

## Task 3: Delete P&L Brand Reclass Builder

**Files:**
- Modify: `apps/plutus/lib/plutus/journal-builder.ts`

- [ ] **Step 1: Delete `buildPnlJournalLines`**

Remove the entire exported function:

```ts
export function buildPnlJournalLines(
  pnlAllocationsByBucket: Record<string, Record<string, number>>,
  mapping: Record<string, string | undefined>,
  accounts: QboAccount[],
  _invoiceId: string,
  blocks: ProcessingBlock[],
  skuBreakdownByBucketBrand?: Record<string, Record<string, Record<string, number>>>,
): JournalEntryLinePreview[] {
  ...
}
```

Keep `buildCogsJournalLines` and `buildSkuBreakdownSuffix`.

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected:

```text
journal builder exposes only inventory COGS lines, not P&L brand reclass lines ... PASS
```

## Task 4: Remove Legacy P&L Allocation Modules And Script

**Files:**
- Delete: `apps/plutus/lib/pnl-allocation.ts`
- Delete: `apps/plutus/lib/plutus/fee-allocation.ts`
- Delete: `apps/plutus/lib/plutus/shipment-fee-allocation.ts`
- Delete: `apps/plutus/scripts/us-settlement-allocation-check.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Delete files**

Run:

```bash
rm apps/plutus/lib/pnl-allocation.ts
rm apps/plutus/lib/plutus/fee-allocation.ts
rm apps/plutus/lib/plutus/shipment-fee-allocation.ts
rm apps/plutus/scripts/us-settlement-allocation-check.ts
```

- [ ] **Step 2: Add source cleanup test**

Add this test to `apps/plutus/tests/run.ts`:

```ts
test('legacy settlement fee allocation files are removed', () => {
  for (const removed of [
    'lib/pnl-allocation.ts',
    'lib/plutus/fee-allocation.ts',
    'lib/plutus/shipment-fee-allocation.ts',
    'scripts/us-settlement-allocation-check.ts',
  ]) {
    assert.equal(existsSync(removed), false, removed);
  }
});
```

If `existsSync` is not imported, update the filesystem import near the top:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
```

- [ ] **Step 3: Verify no stale references remain**

Run:

```bash
rg -n "pnl-allocation|fee-allocation|shipment-fee-allocation|buildPnlJournalLines|computePnlAllocation|buildDeterministicSkuAllocations" apps/plutus
```

Expected:

```text
apps/plutus/tests/run.ts:<line>: legacy settlement fee allocation files are removed
```

No production code references should remain.

## Task 5: Update Settlement Processing Audit For NOOP P&L

**Files:**
- Modify: `apps/plutus/scripts/settlement-processing-audit.ts`

- [ ] **Step 1: Remove imports and injected dependency**

Remove:

```ts
import { classifyPnlBucket, computePnlAllocation, type PnlBucketKey } from '@/lib/pnl-allocation';
import { buildCogsJournalLines, buildPnlJournalLines } from '@/lib/plutus/journal-builder';
type BuildDeterministicSkuAllocations = typeof import('@/lib/plutus/fee-allocation').buildDeterministicSkuAllocations;
```

Replace the journal-builder import with:

```ts
import { buildCogsJournalLines } from '@/lib/plutus/journal-builder';
```

Remove `buildDeterministicSkuAllocations` from any function input type.

- [ ] **Step 2: Replace P&L expected-line calculation**

Delete the block that builds `pnlExpectedLines` from `classifyPnlBucket`, deterministic allocations, `computePnlAllocation`, and `buildPnlJournalLines`.

Insert:

```ts
  const pnlExpectedLines: LineSummary[] = [];
  deterministicPnlOk = true;
```

- [ ] **Step 3: Update P&L compare message**

In the branch handling a live QBO P&L JE, add this warning before comparing lines:

```ts
    if (pnlExpectedLines.length === 0 && actualLines.length > 0) {
      warnings.push('Legacy P&L reclass JE exists but target architecture expects NOOP P&L');
    }
```

Keep the existing `compareJeLines` so old P&L JEs produce a mismatch until retired.

- [ ] **Step 4: Remove dynamic import**

Delete:

```ts
const { buildDeterministicSkuAllocations } = await import('@/lib/plutus/fee-allocation');
```

and remove the property from the audit input object:

```ts
buildDeterministicSkuAllocations,
```

- [ ] **Step 5: Run the audit source test**

Run:

```bash
pnpm -C apps/plutus test
```

Expected:

```text
settlement audit expects P&L reclass to be NOOP ... PASS
```

## Task 6: Update Repair And Rematch Scripts For P&L NOOP

**Files:**
- Modify: `apps/plutus/scripts/repair-missing-processing-jes.ts`
- Modify: `apps/plutus/scripts/us-settlement-rematch.ts`
- Modify: `apps/plutus/scripts/uk-settlement-rematch.ts`
- Modify: `apps/plutus/scripts/settlement-reclass-repair.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Add script source tests**

Add:

```ts
test('repair and rematch scripts do not require P&L reclass lines', () => {
  const repairSource = readFileSync('scripts/repair-missing-processing-jes.ts', 'utf8');
  const usRematchSource = readFileSync('scripts/us-settlement-rematch.ts', 'utf8');
  const ukRematchSource = readFileSync('scripts/uk-settlement-rematch.ts', 'utf8');
  const reclassRepairSource = readFileSync('scripts/settlement-reclass-repair.ts', 'utf8');

  assert.equal(repairSource.includes('createJournalEntry(postingConnection'), true);
  assert.equal(repairSource.includes('computed.preview.pnlJournalEntry.lines.length === 0'), true);
  assert.equal(usRematchSource.includes('previewResult.preview.pnlJournalEntry.lines.length === 0 ||'), false);
  assert.equal(ukRematchSource.includes('previewResult.preview.pnlJournalEntry.lines.length === 0'), false);
  assert.equal(reclassRepairSource.includes('assertNoBankLines({ invoiceId, accountsById, journal: previewResult.preview.pnlJournalEntry })'), false);
});
```

- [ ] **Step 2: Update `repair-missing-processing-jes.ts`**

Ensure it takes this path when P&L lines are empty:

```ts
    if (computed.preview.pnlJournalEntry.lines.length === 0) {
      if (processing.qboPnlReclassJournalEntryId !== desiredPnlNoopId) {
        await db.settlementProcessing.update({
          where: { id: processing.id },
          data: { qboPnlReclassJournalEntryId: desiredPnlNoopId },
        });
      }
      return;
    }
```

Do not create a P&L JE when `computed.preview.pnlJournalEntry.lines.length === 0`.

- [ ] **Step 3: Update rematch scripts**

In `apps/plutus/scripts/us-settlement-rematch.ts`, replace:

```ts
const hasEmptyJournals =
  previewResult.preview.cogsJournalEntry.lines.length === 0 || previewResult.preview.pnlJournalEntry.lines.length === 0;
```

with:

```ts
const hasEmptyJournals = previewResult.preview.cogsJournalEntry.lines.length === 0;
```

In `apps/plutus/scripts/uk-settlement-rematch.ts`, replace:

```ts
const hasEmptyJournals = previewResult.preview.pnlJournalEntry.lines.length === 0;
```

with:

```ts
const hasEmptyJournals = false;
```

The UK path has COGS disabled, so a NOOP P&L preview is not a blocker.

- [ ] **Step 4: Update `settlement-reclass-repair.ts`**

Remove:

```ts
assertNoBankLines({ invoiceId, accountsById, journal: previewResult.preview.pnlJournalEntry });
```

Add a guard:

```ts
if (previewResult.preview.pnlJournalEntry.lines.length !== 0) {
  throw new Error(`Unexpected P&L reclass lines for inventory-COGS-only architecture: ${invoiceId}`);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected:

```text
repair and rematch scripts do not require P&L reclass lines ... PASS
```

## Task 7: Add Legacy P&L Reclass Retirement Script

**Files:**
- Create: `apps/plutus/scripts/retire-legacy-pnl-reclass.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Add script source test**

Add:

```ts
test('legacy P&L retirement script is dry-run by default and requires apply', () => {
  const source = readFileSync('scripts/retire-legacy-pnl-reclass.ts', 'utf8');

  assert.equal(source.includes("const apply = args.includes('--apply');"), true);
  assert.equal(source.includes("deleteJournalEntry(activeConnection, row.qboPnlReclassJournalEntryId)"), true);
  assert.equal(source.includes("buildNoopJournalEntryId('PNL', row.invoiceId)"), true);
  assert.equal(source.includes('if (!apply)'), true);
});
```

- [ ] **Step 2: Create the script**

Create `apps/plutus/scripts/retire-legacy-pnl-reclass.ts`:

```ts
import { db } from '@/lib/db';
import { getActiveQboConnection } from '@/lib/qbo/connection-store';
import { deleteJournalEntry } from '@/lib/qbo/api';
import { buildNoopJournalEntryId, isNoopJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { loadPlutusEnv } from './shared-env';

async function main() {
  await loadPlutusEnv();

  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const marketplaceArg = args.find((arg) => arg.startsWith('--marketplace='));
  const marketplace = marketplaceArg ? marketplaceArg.slice('--marketplace='.length) : undefined;

  let activeConnection = await getActiveQboConnection();

  const rows = await db.settlementProcessing.findMany({
    where: {
      ...(marketplace ? { marketplace } : {}),
    },
    orderBy: [{ settlementPostedDate: 'asc' }, { invoiceId: 'asc' }],
  });

  const candidates = rows.filter((row) => !isNoopJournalEntryId(row.qboPnlReclassJournalEntryId));

  console.log(
    JSON.stringify(
      {
        apply,
        marketplace: marketplace ?? 'ALL',
        scanned: rows.length,
        candidates: candidates.map((row) => ({
          id: row.id,
          marketplace: row.marketplace,
          invoiceId: row.invoiceId,
          qboPnlReclassJournalEntryId: row.qboPnlReclassJournalEntryId,
          targetNoopId: buildNoopJournalEntryId('PNL', row.invoiceId),
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    return;
  }

  for (const row of candidates) {
    const deleted = await deleteJournalEntry(activeConnection, row.qboPnlReclassJournalEntryId);
    if (deleted.updatedConnection) {
      activeConnection = deleted.updatedConnection;
    }

    await db.settlementProcessing.update({
      where: { id: row.id },
      data: {
        qboPnlReclassJournalEntryId: buildNoopJournalEntryId('PNL', row.invoiceId),
      },
    });

    console.log(
      JSON.stringify({
        retired: true,
        invoiceId: row.invoiceId,
        deletedQboJournalEntryId: row.qboPnlReclassJournalEntryId,
        qboPnlReclassJournalEntryId: buildNoopJournalEntryId('PNL', row.invoiceId),
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected:

```text
legacy P&L retirement script is dry-run by default and requires apply ... PASS
```

## Task 8: Verify Code And Live Audit Shape

**Files:**
- No code changes.

- [ ] **Step 1: Run static checks**

Run:

```bash
pnpm -C apps/plutus test
pnpm -C apps/plutus type-check
pnpm -C apps/plutus lint
git diff --check
```

Expected:

```text
All tests passed
type-check exits 0
lint exits 0
git diff --check exits 0
```

- [ ] **Step 2: Run dry-run legacy P&L retirement scan**

Run:

```bash
set -a; source apps/plutus/.env.local; set +a; pnpm -C apps/plutus exec tsx scripts/retire-legacy-pnl-reclass.ts --marketplace=amazon.com
```

Expected:

```json
{
  "apply": false,
  "marketplace": "amazon.com",
  "scanned": 20,
  "candidates": [
    {
      "invoiceId": "US-...",
      "qboPnlReclassJournalEntryId": "...",
      "targetNoopId": "NOOP-PNL-US-..."
    }
  ]
}
```

The exact `scanned` and `candidates` counts must be reported from the live output, not assumed.

- [ ] **Step 3: Apply retirement only after explicit approval**

Run only after explicit current-run finance approval:

```bash
set -a; source apps/plutus/.env.local; set +a; pnpm -C apps/plutus exec tsx scripts/retire-legacy-pnl-reclass.ts --marketplace=amazon.com --apply
```

Expected:

```text
one JSON line per retired P&L JE
exit 0
```

- [ ] **Step 4: Re-run full settlement audit**

Run:

```bash
set -a; source apps/plutus/.env.local; set +a; pnpm -C apps/plutus exec tsx scripts/settlement-processing-audit.ts --json | awk 'f || /^\\{/{f=1; print}' | jq '{totals, notOkCount: ([.results[] | select(.settlementJe.status != "ok" or .cogsJe.status != "ok" or .pnlJe.status != "ok" or (.deterministicPnlOk|not))] | length)}'
```

Expected:

```json
{
  "totals": {
    "notOk": 0,
    "deterministicNotOk": 0
  },
  "notOkCount": 0
}
```

- [ ] **Step 5: Re-run inventory audit**

Run:

```bash
set -a; source apps/plutus/.env.local; set +a; pnpm -C apps/plutus exec tsx scripts/inventory-audit.ts --marketplace amazon.com --since 2025-01-01 --json | awk 'f || /^\\{/{f=1; print}' | jq '{ok, count, cogsStatus: (.results | group_by(.cogsJe.status) | map({status: .[0].cogsJe.status, count: length})), mismatches: [.results[] | select(.cogsJe.status != "ok" and .cogsJe.status != "noop") | .invoiceId]}'
```

Expected:

```json
{
  "ok": true,
  "mismatches": []
}
```

## Task 9: Update Preview Artifact To Match Final Code

**Files:**
- Modify: `docs/superpowers/specs/2026-05-14-plutus-sku-first-sample-settlement.html`

- [ ] **Step 1: Rename file or title if desired**

Keep the existing file path for continuity, but ensure the visible title remains:

```html
<h1>Inventory COGS accounting packet</h1>
```

- [ ] **Step 2: Verify no SKU/brand P&L allocation language remains**

Run:

```bash
rg -n "SKU profitability adjustment|SKU fee line|brand-level P&L|Campaign map allocates|buildPnlJournalLines|computePnlAllocation" docs/superpowers/specs/2026-05-14-plutus-sku-first-sample-settlement.html docs/superpowers/specs/2026-05-13-plutus-subledger-redesign.md
```

Expected:

```text
no matches
```

- [ ] **Step 3: Refresh preview**

With the local static server running:

```bash
python3 -m http.server 45714 --directory docs/superpowers/specs
```

Open:

```text
http://127.0.0.1:45714/2026-05-14-plutus-sku-first-sample-settlement.html
```

Verify visible text:

```text
Inventory COGS accounting packet
No brand-level QBO accounts
Category-level fee posting only
Sellerboard COGS Batch
Exception Queue
```

## Task 10: Final Verification And Handoff

**Files:**
- No code changes.

- [ ] **Step 1: Confirm no legacy P&L allocation code remains**

Run:

```bash
rg -n "pnl-allocation|fee-allocation|shipment-fee-allocation|buildPnlJournalLines|computePnlAllocation|buildDeterministicSkuAllocations|PNL_ALLOCATION_SOURCE_GAP" apps/plutus
```

Expected:

```text
apps/plutus/tests/run.ts:<line>: legacy settlement fee allocation files are removed
```

No production references.

- [ ] **Step 2: Confirm P&L reclass is NOOP in live audit**

Run:

```bash
set -a; source apps/plutus/.env.local; set +a; pnpm -C apps/plutus exec tsx scripts/settlement-processing-audit.ts --json | awk 'f || /^\\{/{f=1; print}' | jq '{pnlStatus: (.results | group_by(.pnlJe.status) | map({status: .[0].pnlJe.status, count: length})), deterministicNotOk: .totals.deterministicNotOk, notOk: .totals.notOk}'
```

Expected:

```json
{
  "pnlStatus": [
    {
      "status": "ok",
      "count": 38
    }
  ],
  "deterministicNotOk": 0,
  "notOk": 0
}
```

Use the actual live count from the command output in the final report.

- [ ] **Step 3: Report exact outcome**

Final response must include:

```text
- Settlement operating categories now stay in simple QBO accounts.
- Plutus no longer builds brand/SKU P&L reclass JEs.
- P&L reclass IDs are NOOP after cleanup.
- Inventory COGS release still uses SKU/PO cost layers.
- Sellerboard COGS output remains SKU/product cost focused.
- Tests/audits run and exact pass/fail counts.
```
