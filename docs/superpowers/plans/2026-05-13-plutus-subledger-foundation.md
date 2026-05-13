# Plutus Subledger Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Plutus subledger foundation: structured products, SKU aliases, PO cost layers, inventory movements, QBO posting trace records, and drift primitives.

**Architecture:** Keep QBO as the formal ledger and Plutus as the deterministic subledger. Add structured Prisma models and pure TypeScript domain modules first, then add a backfill path from existing Brand/Sku/BillMapping data and read-only UI/API surfaces. Do not change live QBO posting behavior in this phase.

**Tech Stack:** Next.js App Router, React client components, MUI, Prisma/PostgreSQL, TypeScript, custom Node test runner in `apps/plutus/tests/run.ts`.

---

## Scope

This plan implements the first executable slice of `docs/superpowers/specs/2026-05-13-plutus-subledger-redesign.md`.

Included:
- New structured subledger tables.
- Deterministic trace memo and line-description builders.
- SKU alias resolution.
- PO cost layer and FIFO inventory movement primitives.
- QBO posting intent and live-posting fingerprint comparison.
- Legacy backfill from current Brand/Sku/BillMapping/BillLineMapping data.
- Read-only Products, Purchase Orders, Inventory Ledger, and QBO Audit pages.

Excluded:
- Changing current Amazon settlement QBO posting behavior.
- Replacing existing COGS journal-entry posting.
- Enabling QBO inventory items, classes, or departments.
- Removing current Brand/Sku/BillMapping tables.
- Mutating live QBO records.

## File Structure

Create:
- `apps/plutus/lib/plutus/subledger/types.ts` — shared enums, zod schemas, and small helpers.
- `apps/plutus/lib/plutus/subledger/qbo-trace.ts` — memo/line builders and posting fingerprint diffing.
- `apps/plutus/lib/plutus/subledger/sku-alias.ts` — canonical product alias resolution.
- `apps/plutus/lib/plutus/subledger/cost-flow.ts` — FIFO cost-layer consumption and inventory valuation primitives.
- `apps/plutus/lib/plutus/subledger/backfill.ts` — pure planner for converting legacy rows into subledger records.
- `apps/plutus/scripts/backfill-subledger-foundation.ts` — dry-run/apply script for production data migration after review.
- `apps/plutus/app/api/plutus/products/route.ts` — read-only canonical product endpoint.
- `apps/plutus/app/api/plutus/purchase-orders/route.ts` — read-only PO/cost-layer endpoint.
- `apps/plutus/app/api/plutus/inventory-ledger/route.ts` — read-only inventory summary endpoint.
- `apps/plutus/app/api/plutus/qbo-audit/route.ts` — read-only QBO posting audit endpoint.
- `apps/plutus/components/subledger/products-page.tsx` — product/alias table.
- `apps/plutus/components/subledger/purchase-orders-page.tsx` — PO/cost layer table.
- `apps/plutus/components/subledger/inventory-ledger-page.tsx` — inventory movement/valuation table.
- `apps/plutus/components/subledger/qbo-audit-page.tsx` — posting drift table.
- `apps/plutus/app/products/page.tsx`
- `apps/plutus/app/purchase-orders/page.tsx`
- `apps/plutus/app/inventory-ledger/page.tsx`
- `apps/plutus/app/qbo-audit/page.tsx`

Modify:
- `apps/plutus/prisma/schema.prisma` — add subledger models and relations.
- `apps/plutus/tests/run.ts` — add tests for schema, pure modules, backfill planner, and nav.
- `apps/plutus/components/app-header.tsx` — add new top-level navigation items.

Generated:
- `apps/plutus/prisma/migrations/<timestamp>_add_subledger_foundation/migration.sql`

---

### Task 1: Lock the Foundation Contract With Failing Tests

**Files:**
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Add imports for planned modules**

Add these imports near the other Plutus imports:

```ts
import {
  buildPlutusLineDescription,
  buildPlutusTraceMemo,
  comparePostingFingerprints,
  fingerprintPostingLines,
} from '../lib/plutus/subledger/qbo-trace';
import {
  resolveCanonicalProductAlias,
} from '../lib/plutus/subledger/sku-alias';
import {
  consumeInventoryMovementsFifo,
} from '../lib/plutus/subledger/cost-flow';
import {
  mapLegacyBrandNameToProductGroupCode,
  normalizeAliasValue,
  planLegacySubledgerBackfill,
} from '../lib/plutus/subledger/backfill';
```

- [ ] **Step 2: Add failing schema and nav tests**

Add these tests after the existing settlement UI/source tests:

```ts
test('subledger schema defines the structured Plutus-owned tables', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

  for (const expected of [
    'model ProductGroup',
    'model CanonicalProduct',
    'model SkuAlias',
    'model PurchaseOrder',
    'model PoCostLayer',
    'model InventoryMovement',
    'model PostingIntent',
    'model PostingIntentLine',
    'model QboPosting',
    'model QboPostingLineFingerprint',
  ]) {
    assert.equal(schema.includes(expected), true, expected);
  }

  assert.equal(schema.includes('@@unique([marketplace, aliasType, value])'), true);
  assert.equal(schema.includes('@@unique([sourceType, sourceId])'), true);
  assert.equal(schema.includes('@@unique([qboTxnType, qboTxnId])'), true);
});

test('subledger navigation exposes LMB-style Plutus control surfaces', () => {
  const source = readFileSync(new URL('../components/app-header.tsx', import.meta.url), 'utf8');

  for (const expected of [
    "label: 'Settlements'",
    "label: 'Products'",
    "label: 'Purchase Orders'",
    "label: 'Inventory Ledger'",
    "label: 'Mappings'",
    "label: 'QBO Audit'",
    "label: 'Settings'",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
});
```

- [ ] **Step 3: Add failing pure-domain tests**

Add these tests near the other pure function tests:

```ts
test('Plutus QBO trace fields are deterministic and minimal', () => {
  assert.equal(
    buildPlutusTraceMemo({
      plutusRef: 'posting_123',
      source: 'AMZ_SETTLEMENT',
      market: 'US',
      period: '2026-05',
    }),
    'PLUTUS_REF=posting_123; SOURCE=AMZ_SETTLEMENT; MARKET=US; PERIOD=2026-05',
  );

  assert.equal(
    buildPlutusLineDescription({
      category: 'Amazon Sales - Principal',
      plutusLineId: 'line_abc',
    }),
    'Amazon Sales - Principal; PLUTUS_LINE=line_abc',
  );

  assert.throws(
    () => buildPlutusTraceMemo({ plutusRef: '', source: 'AMZ_SETTLEMENT', market: 'US', period: '2026-05' }),
    /plutusRef is required/,
  );
});

test('posting fingerprint comparison detects QBO line drift', () => {
  const expected = fingerprintPostingLines([
    { lineId: 'line_1', accountId: '187', amountCents: 1200, description: 'Amazon Sales; PLUTUS_LINE=line_1' },
    { lineId: 'line_2', accountId: '193', amountCents: -300, description: 'Amazon Seller Fees; PLUTUS_LINE=line_2' },
  ]);

  const live = fingerprintPostingLines([
    { lineId: 'line_1', accountId: '187', amountCents: 1200, description: 'Amazon Sales; PLUTUS_LINE=line_1' },
    { lineId: 'line_2', accountId: '194', amountCents: -300, description: 'Amazon Seller Fees; PLUTUS_LINE=line_2' },
  ]);

  assert.deepEqual(comparePostingFingerprints(expected, live), {
    status: 'drifted',
    missingLineIds: [],
    extraLineIds: [],
    changedLineIds: ['line_2'],
  });
});

test('SKU alias resolver maps market aliases to canonical products', () => {
  const aliases = [
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.com', aliasType: 'SKU', value: 'CS-007' },
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.co.uk', aliasType: 'SKU', value: 'CS 007' },
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.com', aliasType: 'ASIN', value: 'B09HXC3NL8' },
  ];

  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.com', 'sku', 'cs-007'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.co.uk', 'SKU', 'CS 007'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.com', 'ASIN', 'b09hxc3nl8'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.co.uk', 'ASIN', 'B09HXC3NL8'), null);
});

test('FIFO inventory movement consumes PO cost layers deterministically', () => {
  const result = consumeInventoryMovementsFifo({
    layers: [
      {
        id: 'layer_old',
        canonicalProductId: 'prod_pds_7',
        receivedDate: '2026-01-01',
        quantity: 5,
        componentCostsCents: { manufacturing: 500, freight: 100, duty: 0, mfgAccessories: 50 },
      },
      {
        id: 'layer_new',
        canonicalProductId: 'prod_pds_7',
        receivedDate: '2026-02-01',
        quantity: 10,
        componentCostsCents: { manufacturing: 2000, freight: 300, duty: 100, mfgAccessories: 0 },
      },
    ],
    movements: [
      {
        id: 'sale_1',
        canonicalProductId: 'prod_pds_7',
        movementDate: '2026-03-01',
        movementType: 'SALE',
        quantity: -7,
      },
    ],
  });

  assert.equal(result.blocks.length, 0);
  assert.deepEqual(result.movementCosts[0], {
    movementId: 'sale_1',
    quantity: 7,
    manufacturingCents: 900,
    freightCents: 160,
    dutyCents: 20,
    mfgAccessoriesCents: 50,
  });
  assert.deepEqual(result.endingLayers.map((layer) => ({ id: layer.id, remainingQuantity: layer.remainingQuantity })), [
    { id: 'layer_old', remainingQuantity: 0 },
    { id: 'layer_new', remainingQuantity: 8 },
  ]);
});

test('legacy subledger backfill groups current Brand and Sku rows without false PO merges', () => {
  assert.equal(mapLegacyBrandNameToProductGroupCode('US-PDS'), 'PDS');
  assert.equal(mapLegacyBrandNameToProductGroupCode('UK-CDS'), 'CDS');
  assert.equal(normalizeAliasValue(' cs-007 '), 'CS-007');

  const plan = planLegacySubledgerBackfill({
    brands: [
      { id: 'brand_us_pds', name: 'US-PDS', marketplace: 'amazon.com', currency: 'USD' },
      { id: 'brand_uk_pds', name: 'UK-PDS', marketplace: 'amazon.co.uk', currency: 'GBP' },
    ],
    skus: [
      { id: 'sku_us', sku: 'CS-007', asin: 'B09HXC3NL8', productName: 'PDS 7', brandId: 'brand_us_pds' },
      { id: 'sku_uk', sku: 'CS 007', asin: 'B09HXC3NL8', productName: 'PDS 7', brandId: 'brand_uk_pds' },
    ],
    billMappings: [],
    billLineMappings: [],
  });

  assert.deepEqual(plan.productGroups.map((group) => group.code), ['PDS']);
  assert.equal(plan.canonicalProducts.length, 1);
  assert.deepEqual(
    plan.skuAliases.map((alias) => [alias.marketplace, alias.aliasType, alias.value]).sort(),
    [
      ['amazon.co.uk', 'ASIN', 'B09HXC3NL8'],
      ['amazon.co.uk', 'SKU', 'CS 007'],
      ['amazon.com', 'ASIN', 'B09HXC3NL8'],
      ['amazon.com', 'SKU', 'CS-007'],
    ],
  );
});
```

- [ ] **Step 4: Run tests to confirm failure**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: FAIL because the subledger modules and schema models do not exist.

---

### Task 2: Add Subledger Prisma Models

**Files:**
- Modify: `apps/plutus/prisma/schema.prisma`
- Create: `apps/plutus/prisma/migrations/<timestamp>_add_subledger_foundation/migration.sql`

- [ ] **Step 1: Add schema models**

Append these models after `BillLineMapping` and before `AwdDataUpload`:

```prisma
model ProductGroup {
  id        String   @id @default(cuid())
  code      String   @unique
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products CanonicalProduct[]

  @@index([active])
}

model CanonicalProduct {
  id             String   @id @default(cuid())
  name           String
  productGroupId String
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  productGroup       ProductGroup        @relation(fields: [productGroupId], references: [id])
  aliases            SkuAlias[]
  costLayers         PoCostLayer[]
  inventoryMovements InventoryMovement[]

  @@index([productGroupId])
  @@index([active])
}

model SkuAlias {
  id                 String   @id @default(cuid())
  canonicalProductId String
  marketplace        String
  aliasType          String
  value              String
  normalizedAliasType String
  normalizedValue     String
  active             Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  canonicalProduct CanonicalProduct @relation(fields: [canonicalProductId], references: [id], onDelete: Cascade)

  @@unique([marketplace, aliasType, value])
  @@unique([marketplace, normalizedAliasType, normalizedValue])
  @@index([canonicalProductId])
  @@index([marketplace])
}

model PurchaseOrder {
  id           String   @id @default(cuid())
  internalRef  String
  sourceType   String
  sourceId     String
  supplierRef  String?
  marketplace  String?
  status       String   @default("OPEN")
  sourceNotes  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  costLayers PoCostLayer[]

  @@unique([sourceType, sourceId])
  @@index([internalRef])
  @@index([marketplace])
  @@index([status])
}

model PoCostLayer {
  id                 String   @id @default(cuid())
  purchaseOrderId    String
  canonicalProductId String
  component          String
  quantity           Int?
  amountCents        Int
  currency           String
  allocationMethod   String
  sourceQboTxnType   String?
  sourceQboTxnId     String?
  sourceQboLineId    String?
  sourceDocumentName String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  purchaseOrder    PurchaseOrder    @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  canonicalProduct CanonicalProduct @relation(fields: [canonicalProductId], references: [id])

  @@index([purchaseOrderId])
  @@index([canonicalProductId])
  @@index([component])
  @@index([sourceQboTxnType, sourceQboTxnId])
}

model InventoryMovement {
  id                 String   @id @default(cuid())
  canonicalProductId String
  marketplace        String
  movementType       String
  quantity           Int
  movementDate       DateTime
  sourceType         String
  sourceId           String
  sourceLineId       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  canonicalProduct CanonicalProduct @relation(fields: [canonicalProductId], references: [id])

  @@index([canonicalProductId])
  @@index([marketplace])
  @@index([movementType])
  @@index([movementDate])
  @@index([sourceType, sourceId])
}

model PostingIntent {
  id             String   @id @default(cuid())
  sourceType     String
  sourceId       String
  market         String
  periodStart    String?
  periodEnd      String?
  sourceHash     String
  mappingVersion String
  postingHash    String
  status         String   @default("draft")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines       PostingIntentLine[]
  qboPostings QboPosting[]

  @@unique([sourceType, sourceId])
  @@index([market])
  @@index([status])
}

model PostingIntentLine {
  id              String   @id @default(cuid())
  postingIntentId String
  lineRef         String
  category        String
  accountId       String?
  amountCents     Int
  currency        String
  description     String
  lineHash        String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  postingIntent PostingIntent @relation(fields: [postingIntentId], references: [id], onDelete: Cascade)

  @@unique([postingIntentId, lineRef])
  @@index([postingIntentId])
}

model QboPosting {
  id              String    @id @default(cuid())
  postingIntentId String
  qboTxnType      String
  qboTxnId        String
  qboSyncToken    String?
  qboDocNumber    String?
  qboPrivateNote  String?
  qboTxnDate      String?
  postingHash     String
  driftStatus     String    @default("unchecked")
  attachmentStatus String   @default("missing")
  lastCheckedAt   DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  postingIntent PostingIntent               @relation(fields: [postingIntentId], references: [id], onDelete: Cascade)
  lineFingerprints QboPostingLineFingerprint[]

  @@unique([qboTxnType, qboTxnId])
  @@index([postingIntentId])
  @@index([driftStatus])
}

model QboPostingLineFingerprint {
  id               String   @id @default(cuid())
  qboPostingId     String
  qboLineId        String
  expectedLineHash String
  liveLineHash     String?
  driftStatus      String   @default("unchecked")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  qboPosting QboPosting @relation(fields: [qboPostingId], references: [id], onDelete: Cascade)

  @@unique([qboPostingId, qboLineId])
  @@index([qboPostingId])
  @@index([driftStatus])
}
```

- [ ] **Step 2: Create migration**

Run:

```bash
pnpm -C apps/plutus db:migrate -- --name add_subledger_foundation
```

Expected: Prisma creates `apps/plutus/prisma/migrations/<timestamp>_add_subledger_foundation/migration.sql`.

- [ ] **Step 3: Run schema contract test**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: schema model assertions pass; module and nav tests still fail.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/plutus/prisma/schema.prisma apps/plutus/prisma/migrations
git commit -m "feat(plutus): add subledger foundation schema"
```

---

### Task 3: Add Trace, Fingerprint, and Allowed-Value Helpers

**Files:**
- Create: `apps/plutus/lib/plutus/subledger/types.ts`
- Create: `apps/plutus/lib/plutus/subledger/qbo-trace.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Create shared subledger types**

Create `apps/plutus/lib/plutus/subledger/types.ts`:

```ts
import { z } from 'zod';

export const PLUTUS_TRACE_SOURCES = ['AMZ_SETTLEMENT', 'QBO_BILL', 'QBO_PURCHASE', 'MANUAL_ADJUSTMENT'] as const;
export const PLUTUS_TRACE_MARKETS = ['US', 'UK', 'MULTI'] as const;
export const PO_COST_COMPONENTS = ['manufacturing', 'freight', 'duty', 'mfgAccessories'] as const;
export const INVENTORY_MOVEMENT_TYPES = ['RECEIPT', 'SALE', 'RETURN', 'REMOVAL', 'DISPOSAL', 'ADJUSTMENT'] as const;
export const QBO_DRIFT_STATUSES = ['unchecked', 'in_sync', 'drifted', 'missing_in_qbo', 'duplicate_qbo_posting', 'stale_mapping'] as const;

export type PlutusTraceSource = (typeof PLUTUS_TRACE_SOURCES)[number];
export type PlutusTraceMarket = (typeof PLUTUS_TRACE_MARKETS)[number];
export type PoCostComponent = (typeof PO_COST_COMPONENTS)[number];
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];
export type QboDriftStatus = (typeof QBO_DRIFT_STATUSES)[number];

export const plutusTraceInputSchema = z.object({
  plutusRef: z.string().trim().min(1, 'plutusRef is required'),
  source: z.enum(PLUTUS_TRACE_SOURCES),
  market: z.enum(PLUTUS_TRACE_MARKETS),
  period: z.string().trim().min(1, 'period is required'),
});

export type PlutusTraceInput = z.infer<typeof plutusTraceInputSchema>;

export type ComponentCostsCents = Record<PoCostComponent, number>;

export function emptyComponentCosts(): ComponentCostsCents {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}
```

- [ ] **Step 2: Create QBO trace helpers**

Create `apps/plutus/lib/plutus/subledger/qbo-trace.ts`:

```ts
import { createHash } from 'node:crypto';

import { plutusTraceInputSchema, type PlutusTraceInput } from './types';

export type PostingFingerprintLine = {
  lineId: string;
  accountId: string;
  amountCents: number;
  description: string;
};

export type PostingFingerprint = {
  postingHash: string;
  lineHashesById: Map<string, string>;
};

export type PostingFingerprintDiff = {
  status: 'in_sync' | 'drifted';
  missingLineIds: string[];
  extraLineIds: string[];
  changedLineIds: string[];
};

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildPlutusTraceMemo(input: PlutusTraceInput): string {
  const parsed = plutusTraceInputSchema.parse(input);
  return `PLUTUS_REF=${parsed.plutusRef}; SOURCE=${parsed.source}; MARKET=${parsed.market}; PERIOD=${parsed.period}`;
}

export function buildPlutusLineDescription(input: { category: string; plutusLineId: string }): string {
  const category = input.category.trim();
  const plutusLineId = input.plutusLineId.trim();
  if (category === '') throw new Error('category is required');
  if (plutusLineId === '') throw new Error('plutusLineId is required');
  return `${category}; PLUTUS_LINE=${plutusLineId}`;
}

export function fingerprintPostingLines(lines: PostingFingerprintLine[]): PostingFingerprint {
  const lineHashesById = new Map<string, string>();
  for (const line of [...lines].sort((left, right) => left.lineId.localeCompare(right.lineId))) {
    const lineId = line.lineId.trim();
    if (lineId === '') throw new Error('lineId is required');
    lineHashesById.set(
      lineId,
      hashJson({
        accountId: line.accountId,
        amountCents: line.amountCents,
        description: line.description,
      }),
    );
  }

  return {
    postingHash: hashJson(Array.from(lineHashesById.entries())),
    lineHashesById,
  };
}

export function comparePostingFingerprints(expected: PostingFingerprint, live: PostingFingerprint): PostingFingerprintDiff {
  const missingLineIds: string[] = [];
  const extraLineIds: string[] = [];
  const changedLineIds: string[] = [];

  for (const [lineId, expectedHash] of expected.lineHashesById.entries()) {
    const liveHash = live.lineHashesById.get(lineId);
    if (liveHash === undefined) {
      missingLineIds.push(lineId);
    } else if (liveHash !== expectedHash) {
      changedLineIds.push(lineId);
    }
  }

  for (const lineId of live.lineHashesById.keys()) {
    if (!expected.lineHashesById.has(lineId)) {
      extraLineIds.push(lineId);
    }
  }

  return {
    status: missingLineIds.length === 0 && extraLineIds.length === 0 && changedLineIds.length === 0 ? 'in_sync' : 'drifted',
    missingLineIds: missingLineIds.sort(),
    extraLineIds: extraLineIds.sort(),
    changedLineIds: changedLineIds.sort(),
  };
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: trace and fingerprint tests pass; alias, cost-flow, backfill, and nav tests still fail.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/plutus/lib/plutus/subledger/types.ts apps/plutus/lib/plutus/subledger/qbo-trace.ts apps/plutus/tests/run.ts
git commit -m "feat(plutus): add deterministic QBO trace helpers"
```

---

### Task 4: Add SKU Alias Resolver and Legacy Backfill Planner

**Files:**
- Create: `apps/plutus/lib/plutus/subledger/sku-alias.ts`
- Create: `apps/plutus/lib/plutus/subledger/backfill.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Create SKU alias resolver**

Create `apps/plutus/lib/plutus/subledger/sku-alias.ts`:

```ts
export type SkuAliasCandidate = {
  canonicalProductId: string;
  marketplace: string;
  aliasType: string;
  value: string;
};

export function normalizeAliasLookupValue(value: string): string {
  return value.trim().toUpperCase();
}

export function resolveCanonicalProductAlias(
  aliases: SkuAliasCandidate[],
  marketplace: string,
  aliasType: string,
  value: string,
): string | null {
  const normalizedMarketplace = marketplace.trim();
  const normalizedAliasType = aliasType.trim().toUpperCase();
  const normalizedValue = normalizeAliasLookupValue(value);
  if (normalizedMarketplace === '' || normalizedAliasType === '' || normalizedValue === '') {
    return null;
  }

  const match = aliases.find(
    (alias) =>
      alias.marketplace === normalizedMarketplace &&
      alias.aliasType.toUpperCase() === normalizedAliasType &&
      normalizeAliasLookupValue(alias.value) === normalizedValue,
  );

  return match ? match.canonicalProductId : null;
}
```

- [ ] **Step 2: Create pure legacy backfill planner**

Create `apps/plutus/lib/plutus/subledger/backfill.ts`:

```ts
import { normalizeAliasLookupValue } from './sku-alias';

export type LegacyBrandRow = {
  id: string;
  name: string;
  marketplace: string;
  currency: string;
};

export type LegacySkuRow = {
  id: string;
  sku: string;
  asin: string | null;
  productName: string | null;
  brandId: string;
};

export type LegacyBillMappingRow = {
  id: string;
  qboBillId: string;
  poNumber: string;
  brandId: string;
  billDate: string;
  vendorName: string;
  totalAmount: number;
};

export type LegacyBillLineMappingRow = {
  id: string;
  billMappingId: string;
  qboLineId: string;
  component: string;
  amountCents: number;
  sku: string | null;
  quantity: number | null;
};

export type LegacySubledgerBackfillPlan = {
  productGroups: Array<{ code: string; name: string }>;
  canonicalProducts: Array<{ key: string; name: string; productGroupCode: string }>;
  skuAliases: Array<{
    canonicalProductKey: string;
    marketplace: string;
    aliasType: 'SKU' | 'ASIN';
    value: string;
    normalizedAliasType: string;
    normalizedValue: string;
  }>;
  purchaseOrders: Array<{
    internalRef: string;
    sourceType: 'LEGACY_PO' | 'LEGACY_BILL';
    sourceId: string;
    marketplace: string;
    supplierRef: string | null;
  }>;
  costLayers: Array<{
    purchaseOrderSourceType: 'LEGACY_PO' | 'LEGACY_BILL';
    purchaseOrderSourceId: string;
    canonicalProductKey: string | null;
    component: string;
    quantity: number | null;
    amountCents: number;
    currency: string;
    sourceQboTxnType: 'Bill';
    sourceQboTxnId: string;
    sourceQboLineId: string;
  }>;
};

export function normalizeAliasValue(value: string): string {
  return normalizeAliasLookupValue(value);
}

export function mapLegacyBrandNameToProductGroupCode(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split('-').filter((part) => part.trim() !== '');
  return parts.length > 1 ? parts[parts.length - 1]!.trim().toUpperCase() : trimmed.toUpperCase();
}

function canonicalProductKeyForSku(input: { marketplace: string; sku: string; asin: string | null }): string {
  const asin = input.asin ? normalizeAliasValue(input.asin) : '';
  if (asin !== '') return `ASIN:${asin}`;
  return `SKU:${input.marketplace}:${normalizeAliasValue(input.sku)}`;
}

function purchaseOrderKeyForBillMapping(mapping: LegacyBillMappingRow, marketplace: string): {
  internalRef: string;
  sourceType: 'LEGACY_PO' | 'LEGACY_BILL';
  sourceId: string;
} {
  const poNumber = mapping.poNumber.trim();
  if (poNumber !== '') {
    return {
      internalRef: poNumber,
      sourceType: 'LEGACY_PO',
      sourceId: `${marketplace}:${poNumber}`,
    };
  }

  return {
    internalRef: `UNASSIGNED-BILL-${mapping.qboBillId}`,
    sourceType: 'LEGACY_BILL',
    sourceId: mapping.qboBillId,
  };
}

export function planLegacySubledgerBackfill(input: {
  brands: LegacyBrandRow[];
  skus: LegacySkuRow[];
  billMappings: LegacyBillMappingRow[];
  billLineMappings: LegacyBillLineMappingRow[];
}): LegacySubledgerBackfillPlan {
  const brandsById = new Map(input.brands.map((brand) => [brand.id, brand]));
  const productGroupsByCode = new Map<string, { code: string; name: string }>();
  const canonicalProductsByKey = new Map<string, { key: string; name: string; productGroupCode: string }>();
  const aliasKeys = new Set<string>();
  const skuAliases: LegacySubledgerBackfillPlan['skuAliases'] = [];
  const canonicalKeyByLegacySkuValue = new Map<string, string>();

  for (const sku of input.skus) {
    const brand = brandsById.get(sku.brandId);
    if (!brand) throw new Error(`Missing brand for SKU ${sku.id}`);
    const productGroupCode = mapLegacyBrandNameToProductGroupCode(brand.name);
    productGroupsByCode.set(productGroupCode, { code: productGroupCode, name: productGroupCode });

    const productKey = canonicalProductKeyForSku({ marketplace: brand.marketplace, sku: sku.sku, asin: sku.asin });
    canonicalProductsByKey.set(productKey, {
      key: productKey,
      name: sku.productName && sku.productName.trim() !== '' ? sku.productName.trim() : normalizeAliasValue(sku.sku),
      productGroupCode,
    });
    canonicalKeyByLegacySkuValue.set(`${brand.marketplace}:${normalizeAliasValue(sku.sku)}`, productKey);

    for (const alias of [
      { aliasType: 'SKU' as const, value: sku.sku },
      ...(sku.asin && sku.asin.trim() !== '' ? [{ aliasType: 'ASIN' as const, value: sku.asin }] : []),
    ]) {
      const normalizedValue = normalizeAliasValue(alias.value);
      const aliasKey = `${brand.marketplace}:${alias.aliasType}:${normalizedValue}`;
      if (!aliasKeys.has(aliasKey)) {
        aliasKeys.add(aliasKey);
        skuAliases.push({
          canonicalProductKey: productKey,
          marketplace: brand.marketplace,
          aliasType: alias.aliasType,
          value: alias.value.trim(),
          normalizedAliasType: alias.aliasType,
          normalizedValue,
        });
      }
    }
  }

  const purchaseOrders = input.billMappings.map((mapping) => {
    const brand = brandsById.get(mapping.brandId);
    if (!brand) throw new Error(`Missing brand for bill mapping ${mapping.id}`);
    const key = purchaseOrderKeyForBillMapping(mapping, brand.marketplace);
    return {
      ...key,
      marketplace: brand.marketplace,
      supplierRef: null,
    };
  });

  const billMappingsById = new Map(input.billMappings.map((mapping) => [mapping.id, mapping]));
  const costLayers = input.billLineMappings.map((line) => {
    const mapping = billMappingsById.get(line.billMappingId);
    if (!mapping) throw new Error(`Missing bill mapping for line ${line.id}`);
    const brand = brandsById.get(mapping.brandId);
    if (!brand) throw new Error(`Missing brand for bill mapping ${mapping.id}`);
    const canonicalProductKey = line.sku
      ? canonicalKeyByLegacySkuValue.get(`${brand.marketplace}:${normalizeAliasValue(line.sku)}`) ?? null
      : null;
    const purchaseOrderKey = purchaseOrderKeyForBillMapping(mapping, brand.marketplace);

    return {
      purchaseOrderSourceType: purchaseOrderKey.sourceType,
      purchaseOrderSourceId: purchaseOrderKey.sourceId,
      canonicalProductKey,
      component: line.component,
      quantity: line.quantity,
      amountCents: line.amountCents,
      currency: brand.currency,
      sourceQboTxnType: 'Bill' as const,
      sourceQboTxnId: mapping.qboBillId,
      sourceQboLineId: line.qboLineId,
    };
  });

  return {
    productGroups: Array.from(productGroupsByCode.values()).sort((left, right) => left.code.localeCompare(right.code)),
    canonicalProducts: Array.from(canonicalProductsByKey.values()).sort((left, right) => left.key.localeCompare(right.key)),
    skuAliases: skuAliases.sort((left, right) => `${left.marketplace}:${left.aliasType}:${left.value}`.localeCompare(`${right.marketplace}:${right.aliasType}:${right.value}`)),
    purchaseOrders,
    costLayers,
  };
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: alias and backfill tests pass; cost-flow and nav tests still fail.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/plutus/lib/plutus/subledger/sku-alias.ts apps/plutus/lib/plutus/subledger/backfill.ts apps/plutus/tests/run.ts
git commit -m "feat(plutus): add subledger alias backfill planner"
```

---

### Task 5: Add FIFO PO Cost Layer Consumption

**Files:**
- Create: `apps/plutus/lib/plutus/subledger/cost-flow.ts`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Create cost-flow module**

Create `apps/plutus/lib/plutus/subledger/cost-flow.ts`:

```ts
import { emptyComponentCosts, type ComponentCostsCents, type InventoryMovementType } from './types';

export type FifoCostLayerInput = {
  id: string;
  canonicalProductId: string;
  receivedDate: string;
  quantity: number;
  componentCostsCents: ComponentCostsCents;
};

export type InventoryMovementInput = {
  id: string;
  canonicalProductId: string;
  movementDate: string;
  movementType: InventoryMovementType;
  quantity: number;
};

export type MovementCostResult = {
  movementId: string;
  quantity: number;
  manufacturingCents: number;
  freightCents: number;
  dutyCents: number;
  mfgAccessoriesCents: number;
};

export type EndingLayerResult = {
  id: string;
  remainingQuantity: number;
};

export type CostFlowBlock = {
  movementId: string;
  code: 'NEGATIVE_INVENTORY' | 'INVALID_LAYER' | 'INVALID_MOVEMENT';
  message: string;
};

export type CostFlowResult = {
  movementCosts: MovementCostResult[];
  endingLayers: EndingLayerResult[];
  blocks: CostFlowBlock[];
};

type MutableLayer = FifoCostLayerInput & {
  remainingQuantity: number;
  consumedCostsCents: ComponentCostsCents;
};

function allocateComponentCost(totalCostCents: number, totalQuantity: number, consumedBefore: number, consumeQuantity: number): number {
  const costThroughEnd = Math.round((totalCostCents * (consumedBefore + consumeQuantity)) / totalQuantity);
  const costThroughStart = Math.round((totalCostCents * consumedBefore) / totalQuantity);
  return costThroughEnd - costThroughStart;
}

function sortByDateThenId<T extends { id: string }>(rows: T[], getDate: (row: T) => string): T[] {
  return [...rows].sort((left, right) => {
    const dateCompare = getDate(left).localeCompare(getDate(right));
    if (dateCompare !== 0) return dateCompare;
    return left.id.localeCompare(right.id);
  });
}

export function consumeInventoryMovementsFifo(input: {
  layers: FifoCostLayerInput[];
  movements: InventoryMovementInput[];
}): CostFlowResult {
  const blocks: CostFlowBlock[] = [];
  const layersByProduct = new Map<string, MutableLayer[]>();

  for (const layer of sortByDateThenId(input.layers, (row) => row.receivedDate)) {
    if (layer.quantity <= 0) {
      blocks.push({ movementId: layer.id, code: 'INVALID_LAYER', message: `Layer ${layer.id} quantity must be positive` });
      continue;
    }

    const mutable: MutableLayer = {
      ...layer,
      remainingQuantity: layer.quantity,
      consumedCostsCents: emptyComponentCosts(),
    };
    const productLayers = layersByProduct.get(layer.canonicalProductId) ?? [];
    productLayers.push(mutable);
    layersByProduct.set(layer.canonicalProductId, productLayers);
  }

  const movementCosts: MovementCostResult[] = [];

  for (const movement of sortByDateThenId(input.movements, (row) => row.movementDate)) {
    if (movement.quantity === 0) {
      blocks.push({ movementId: movement.id, code: 'INVALID_MOVEMENT', message: `Movement ${movement.id} quantity cannot be zero` });
      continue;
    }

    if (movement.quantity > 0) {
      continue;
    }

    let remainingToConsume = Math.abs(movement.quantity);
    const movementCost = emptyComponentCosts();
    const productLayers = layersByProduct.get(movement.canonicalProductId) ?? [];

    for (const layer of productLayers) {
      if (remainingToConsume === 0) break;
      if (layer.remainingQuantity === 0) continue;

      const consumeQuantity = Math.min(layer.remainingQuantity, remainingToConsume);
      const consumedBefore = layer.quantity - layer.remainingQuantity;

      for (const component of ['manufacturing', 'freight', 'duty', 'mfgAccessories'] as const) {
        const componentCost = allocateComponentCost(
          layer.componentCostsCents[component],
          layer.quantity,
          consumedBefore,
          consumeQuantity,
        );
        movementCost[component] += componentCost;
        layer.consumedCostsCents[component] += componentCost;
      }

      layer.remainingQuantity -= consumeQuantity;
      remainingToConsume -= consumeQuantity;
    }

    if (remainingToConsume > 0) {
      blocks.push({
        movementId: movement.id,
        code: 'NEGATIVE_INVENTORY',
        message: `Movement ${movement.id} needs ${Math.abs(movement.quantity)} units but only ${Math.abs(movement.quantity) - remainingToConsume} are available`,
      });
    }

    movementCosts.push({
      movementId: movement.id,
      quantity: Math.abs(movement.quantity) - remainingToConsume,
      manufacturingCents: movementCost.manufacturing,
      freightCents: movementCost.freight,
      dutyCents: movementCost.duty,
      mfgAccessoriesCents: movementCost.mfgAccessories,
    });
  }

  const endingLayers = Array.from(layersByProduct.values())
    .flat()
    .map((layer) => ({ id: layer.id, remainingQuantity: layer.remainingQuantity }));

  return { movementCosts, endingLayers, blocks };
}
```

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: cost-flow tests pass; nav tests still fail.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/plutus/lib/plutus/subledger/cost-flow.ts apps/plutus/tests/run.ts
git commit -m "feat(plutus): add FIFO subledger cost flow"
```

---

### Task 6: Add Legacy Backfill Script

**Files:**
- Create: `apps/plutus/scripts/backfill-subledger-foundation.ts`
- Modify: `apps/plutus/package.json`

- [ ] **Step 1: Create script**

Create `apps/plutus/scripts/backfill-subledger-foundation.ts`:

```ts
import db from '@/lib/db';
import { planLegacySubledgerBackfill } from '@/lib/plutus/subledger/backfill';

function parseApplyFlag(): boolean {
  return process.argv.includes('--apply');
}

async function main() {
  const apply = parseApplyFlag();

  const [brands, skus, billMappings, billLineMappings] = await Promise.all([
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.sku.findMany({ orderBy: { sku: 'asc' } }),
    db.billMapping.findMany({ orderBy: { poNumber: 'asc' } }),
    db.billLineMapping.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  const plan = planLegacySubledgerBackfill({
    brands,
    skus: skus.map((sku) => ({
      id: sku.id,
      sku: sku.sku,
      asin: sku.asin,
      productName: sku.productName,
      brandId: sku.brandId,
    })),
    billMappings,
    billLineMappings,
  });

  console.log(JSON.stringify({
    apply,
    productGroups: plan.productGroups.length,
    canonicalProducts: plan.canonicalProducts.length,
    skuAliases: plan.skuAliases.length,
    purchaseOrders: plan.purchaseOrders.length,
    costLayers: plan.costLayers.length,
    unassignedCostLayers: plan.costLayers.filter((layer) => layer.canonicalProductKey === null).length,
  }, null, 2));

  if (!apply) return;

  await db.$transaction(async (tx) => {
    const productGroupIdByCode = new Map<string, string>();
    for (const group of plan.productGroups) {
      const row = await tx.productGroup.upsert({
        where: { code: group.code },
        create: { code: group.code, name: group.name },
        update: { name: group.name, active: true },
      });
      productGroupIdByCode.set(group.code, row.id);
    }

    const canonicalProductIdByKey = new Map<string, string>();
    for (const product of plan.canonicalProducts) {
      const productGroupId = productGroupIdByCode.get(product.productGroupCode);
      if (!productGroupId) throw new Error(`Missing product group ${product.productGroupCode}`);
      const [productKeyType, ...productKeyParts] = product.key.split(':');
      const productKeyValue = productKeyParts.join(':');
      if (productKeyType !== 'ASIN' && productKeyType !== 'SKU') {
        throw new Error(`Unsupported canonical product key ${product.key}`);
      }
      const existingAlias = await tx.skuAlias.findFirst({
        where: {
          normalizedAliasType: productKeyType,
          normalizedValue: productKeyValue,
        },
      });
      const row = existingAlias
        ? await tx.canonicalProduct.update({ where: { id: existingAlias.canonicalProductId }, data: { name: product.name, productGroupId, active: true } })
        : await tx.canonicalProduct.create({ data: { name: product.name, productGroupId } });
      canonicalProductIdByKey.set(product.key, row.id);
    }

    for (const alias of plan.skuAliases) {
      const canonicalProductId = canonicalProductIdByKey.get(alias.canonicalProductKey);
      if (!canonicalProductId) throw new Error(`Missing canonical product ${alias.canonicalProductKey}`);
      await tx.skuAlias.upsert({
        where: {
          marketplace_normalizedAliasType_normalizedValue: {
            marketplace: alias.marketplace,
            normalizedAliasType: alias.normalizedAliasType,
            normalizedValue: alias.normalizedValue,
          },
        },
        create: {
          canonicalProductId,
          marketplace: alias.marketplace,
          aliasType: alias.aliasType,
          value: alias.value,
          normalizedAliasType: alias.normalizedAliasType,
          normalizedValue: alias.normalizedValue,
        },
        update: {
          canonicalProductId,
          aliasType: alias.aliasType,
          value: alias.value,
          active: true,
        },
      });
    }

    for (const po of plan.purchaseOrders) {
      await tx.purchaseOrder.upsert({
        where: { sourceType_sourceId: { sourceType: po.sourceType, sourceId: po.sourceId } },
        create: {
          internalRef: po.internalRef,
          sourceType: po.sourceType,
          sourceId: po.sourceId,
          supplierRef: po.supplierRef,
          marketplace: po.marketplace,
        },
        update: { supplierRef: po.supplierRef, marketplace: po.marketplace },
      });
    }

    for (const layer of plan.costLayers) {
      if (layer.canonicalProductKey === null) continue;
      const purchaseOrder = await tx.purchaseOrder.findUniqueOrThrow({
        where: {
          sourceType_sourceId: {
            sourceType: layer.purchaseOrderSourceType,
            sourceId: layer.purchaseOrderSourceId,
          },
        },
      });
      const canonicalProductId = canonicalProductIdByKey.get(layer.canonicalProductKey);
      if (!canonicalProductId) throw new Error(`Missing canonical product ${layer.canonicalProductKey}`);
      const existing = await tx.poCostLayer.findFirst({
        where: {
          purchaseOrderId: purchaseOrder.id,
          canonicalProductId,
          component: layer.component,
          sourceQboTxnType: layer.sourceQboTxnType,
          sourceQboTxnId: layer.sourceQboTxnId,
          sourceQboLineId: layer.sourceQboLineId,
        },
      });
      if (existing) {
        await tx.poCostLayer.update({
          where: { id: existing.id },
          data: {
            quantity: layer.quantity,
            amountCents: layer.amountCents,
            currency: layer.currency,
            allocationMethod: 'LEGACY_BILL_LINE_MAPPING',
          },
        });
      } else {
        await tx.poCostLayer.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            canonicalProductId,
            component: layer.component,
            quantity: layer.quantity,
            amountCents: layer.amountCents,
            currency: layer.currency,
            allocationMethod: 'LEGACY_BILL_LINE_MAPPING',
            sourceQboTxnType: layer.sourceQboTxnType,
            sourceQboTxnId: layer.sourceQboTxnId,
            sourceQboLineId: layer.sourceQboLineId,
          },
        });
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
```

- [ ] **Step 2: Add package script**

Add this to `apps/plutus/package.json` scripts:

```json
"subledger:backfill": "tsx scripts/backfill-subledger-foundation.ts"
```

- [ ] **Step 3: Run dry-run script**

Run:

```bash
pnpm -C apps/plutus subledger:backfill
```

Expected: JSON summary prints counts and `"apply": false`. The script must not write rows in dry-run mode.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: all pure-domain tests still pass; nav test still fails.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/plutus/scripts/backfill-subledger-foundation.ts apps/plutus/package.json
git commit -m "feat(plutus): add subledger backfill script"
```

---

### Task 7: Add Read-Only APIs and Pages

**Files:**
- Create: `apps/plutus/app/api/plutus/products/route.ts`
- Create: `apps/plutus/app/api/plutus/purchase-orders/route.ts`
- Create: `apps/plutus/app/api/plutus/inventory-ledger/route.ts`
- Create: `apps/plutus/app/api/plutus/qbo-audit/route.ts`
- Create: `apps/plutus/components/subledger/products-page.tsx`
- Create: `apps/plutus/components/subledger/purchase-orders-page.tsx`
- Create: `apps/plutus/components/subledger/inventory-ledger-page.tsx`
- Create: `apps/plutus/components/subledger/qbo-audit-page.tsx`
- Create: `apps/plutus/app/products/page.tsx`
- Create: `apps/plutus/app/purchase-orders/page.tsx`
- Create: `apps/plutus/app/inventory-ledger/page.tsx`
- Create: `apps/plutus/app/qbo-audit/page.tsx`
- Modify: `apps/plutus/components/app-header.tsx`
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Add read-only API routes**

Use this shape for `apps/plutus/app/api/plutus/products/route.ts`:

```ts
import { NextResponse } from 'next/server';

import db from '@/lib/db';

export async function GET() {
  const products = await db.canonicalProduct.findMany({
    orderBy: [{ productGroup: { code: 'asc' } }, { name: 'asc' }],
    include: {
      productGroup: true,
      aliases: { orderBy: [{ marketplace: 'asc' }, { aliasType: 'asc' }, { value: 'asc' }] },
    },
  });

  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      active: product.active,
      productGroup: { id: product.productGroup.id, code: product.productGroup.code, name: product.productGroup.name },
      aliases: product.aliases.map((alias) => ({
        id: alias.id,
        marketplace: alias.marketplace,
        aliasType: alias.aliasType,
        value: alias.value,
        active: alias.active,
      })),
    })),
  });
}
```

Use this shape for `apps/plutus/app/api/plutus/purchase-orders/route.ts`:

```ts
import { NextResponse } from 'next/server';

import db from '@/lib/db';

export async function GET() {
  const purchaseOrders = await db.purchaseOrder.findMany({
    orderBy: [{ internalRef: 'asc' }],
    include: {
      costLayers: {
        orderBy: [{ component: 'asc' }, { createdAt: 'asc' }],
        include: { canonicalProduct: { include: { productGroup: true } } },
      },
    },
  });

  return NextResponse.json({
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      internalRef: po.internalRef,
      supplierRef: po.supplierRef,
      marketplace: po.marketplace,
      status: po.status,
      totalAmountCents: po.costLayers.reduce((sum, layer) => sum + layer.amountCents, 0),
      costLayers: po.costLayers.map((layer) => ({
        id: layer.id,
        component: layer.component,
        quantity: layer.quantity,
        amountCents: layer.amountCents,
        currency: layer.currency,
        allocationMethod: layer.allocationMethod,
        sourceQboTxnType: layer.sourceQboTxnType,
        sourceQboTxnId: layer.sourceQboTxnId,
        sourceQboLineId: layer.sourceQboLineId,
        product: {
          id: layer.canonicalProduct.id,
          name: layer.canonicalProduct.name,
          productGroupCode: layer.canonicalProduct.productGroup.code,
        },
      })),
    })),
  });
}
```

Use this shape for `apps/plutus/app/api/plutus/inventory-ledger/route.ts`:

```ts
import { NextResponse } from 'next/server';

import db from '@/lib/db';

export async function GET() {
  const movements = await db.inventoryMovement.findMany({
    orderBy: [{ movementDate: 'desc' }, { id: 'asc' }],
    take: 500,
    include: { canonicalProduct: { include: { productGroup: true } } },
  });

  return NextResponse.json({
    movements: movements.map((movement) => ({
      id: movement.id,
      marketplace: movement.marketplace,
      movementType: movement.movementType,
      quantity: movement.quantity,
      movementDate: movement.movementDate.toISOString(),
      sourceType: movement.sourceType,
      sourceId: movement.sourceId,
      sourceLineId: movement.sourceLineId,
      product: {
        id: movement.canonicalProduct.id,
        name: movement.canonicalProduct.name,
        productGroupCode: movement.canonicalProduct.productGroup.code,
      },
    })),
  });
}
```

Use this shape for `apps/plutus/app/api/plutus/qbo-audit/route.ts`:

```ts
import { NextResponse } from 'next/server';

import db from '@/lib/db';

export async function GET() {
  const postings = await db.qboPosting.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    take: 500,
    include: { postingIntent: true, lineFingerprints: true },
  });

  return NextResponse.json({
    postings: postings.map((posting) => ({
      id: posting.id,
      qboTxnType: posting.qboTxnType,
      qboTxnId: posting.qboTxnId,
      qboDocNumber: posting.qboDocNumber,
      qboTxnDate: posting.qboTxnDate,
      driftStatus: posting.driftStatus,
      attachmentStatus: posting.attachmentStatus,
      sourceType: posting.postingIntent.sourceType,
      sourceId: posting.postingIntent.sourceId,
      market: posting.postingIntent.market,
      lineCount: posting.lineFingerprints.length,
      lastCheckedAt: posting.lastCheckedAt ? posting.lastCheckedAt.toISOString() : null,
    })),
  });
}
```

- [ ] **Step 2: Add simple read-only pages**

Each component should use `useQuery`, match the current Plutus page loading/error patterns, and render a dense MUI table. Keep text minimal.

Create route wrappers:

```ts
import { ProductsPage } from '@/components/subledger/products-page';

export default ProductsPage;
```

Use equivalent wrappers for Purchase Orders, Inventory Ledger, and QBO Audit.

In each component:
- Put `PageHeader` at top.
- Fetch its matching API route.
- Render a `MuiTable` with stable columns.
- Show `EmptyState` when no rows exist.

- [ ] **Step 3: Add nav items**

In `apps/plutus/components/app-header.tsx`, add imports:

```ts
import CategoryIcon from '@mui/icons-material/Category';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
```

Replace `NAV_ITEMS` with:

```ts
const NAV_ITEMS: NavItem[] = [
  { href: '/settlements', label: 'Settlements', icon: ReceiptLongIcon },
  { href: '/products', label: 'Products', icon: CategoryIcon },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: LocalShippingIcon },
  { href: '/inventory-ledger', label: 'Inventory Ledger', icon: Inventory2Icon },
  { href: '/settlement-mapping', label: 'Mappings', icon: MapIcon },
  { href: '/qbo-audit', label: 'QBO Audit', icon: FactCheckIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];
```

- [ ] **Step 4: Add route source tests**

Add this test to `apps/plutus/tests/run.ts`:

```ts
test('subledger pages are wired to route wrappers', () => {
  assert.equal(readFileSync(new URL('../app/products/page.tsx', import.meta.url), 'utf8').includes('ProductsPage'), true);
  assert.equal(readFileSync(new URL('../app/purchase-orders/page.tsx', import.meta.url), 'utf8').includes('PurchaseOrdersPage'), true);
  assert.equal(readFileSync(new URL('../app/inventory-ledger/page.tsx', import.meta.url), 'utf8').includes('InventoryLedgerPage'), true);
  assert.equal(readFileSync(new URL('../app/qbo-audit/page.tsx', import.meta.url), 'utf8').includes('QboAuditPage'), true);
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: all custom tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/plutus/app apps/plutus/components apps/plutus/tests/run.ts
git commit -m "feat(plutus): add subledger read-only surfaces"
```

---

### Task 8: Verify End to End Without Touching Main Port

**Files:**
- No source changes.

- [ ] **Step 1: Type-check**

Run:

```bash
pnpm -C apps/plutus type-check
```

Expected: exits `0`.

- [ ] **Step 2: Lint**

Run:

```bash
pnpm -C apps/plutus lint
```

Expected: exits `0`.

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: exits `0`.

- [ ] **Step 4: Build**

Run:

```bash
pnpm -C apps/plutus build
```

Expected: exits `0`.

- [ ] **Step 5: Start isolated preview**

Use a non-main port. Do not use port `3012`.

Run:

```bash
PORT=4312 pnpm -C apps/plutus dev
```

Expected: app starts on `http://localhost:4312`.

- [ ] **Step 6: Browser-check routes**

Open these routes in the browser preview:

```text
http://localhost:4312/plutus/products
http://localhost:4312/plutus/purchase-orders
http://localhost:4312/plutus/inventory-ledger
http://localhost:4312/plutus/qbo-audit
```

Expected:
- Each page loads.
- No page crashes on an empty subledger table.
- The nav shows Products, Purchase Orders, Inventory Ledger, Mappings, QBO Audit, and Settings.
- Current settlements still load.

- [ ] **Step 7: Commit verification notes only when source changed**

If verification required source fixes, commit them:

```bash
git add apps/plutus
git commit -m "fix(plutus): stabilize subledger foundation"
```

If no source fixes were needed, do not create an empty commit.
