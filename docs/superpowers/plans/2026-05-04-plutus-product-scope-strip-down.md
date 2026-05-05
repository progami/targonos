# Plutus Product Scope Strip-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip Plutus Phase 1 UI down to settlement accounting, COGS inputs, exceptions, mappings, sources, and settings.

**Architecture:** Keep the settlement accounting engine intact. Replace the primary navigation and route entry points so normal users cannot enter generic QBO transaction, cashflow, or chart-of-accounts workflows. Reuse the existing bill-mapping code as the first COGS Inputs surface, with QBO Bills read-only and no QBO Bill/Purchase creation controls.

**Tech Stack:** Next.js App Router, React client components, MUI, Vitest-style custom Node test runner in `apps/plutus/tests/run.ts`, TypeScript.

---

### Task 1: Lock Product Scope With Source Tests

**Files:**
- Modify: `apps/plutus/tests/run.ts`

- [ ] **Step 1: Add failing tests**

Add tests near the existing settlement UI source tests:

```ts
test('plutus primary nav exposes only settlement accounting scope', () => {
  const source = readFileSync('components/app-header.tsx', 'utf8');

  for (const expected of [
    "label: 'Settlements'",
    "label: 'COGS Inputs'",
    "label: 'Exceptions'",
    "label: 'Mappings'",
    "label: 'Sources'",
    "label: 'Settings'",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }

  for (const removed of [
    "label: 'Transactions'",
    "label: 'Cashflow'",
    "label: 'Accounts & Taxes'",
    "label: 'Setup Wizard'",
    "label: 'Account Taxes'",
    "label: 'Chart of Accounts'",
    "href: '/transactions'",
    "href: '/cashflow'",
    "href: '/chart-of-accounts'",
  ]) {
    assert.equal(source.includes(removed), false, removed);
  }
});

test('removed QBO clone pages redirect out of primary workflows', () => {
  assert.equal(readFileSync('app/transactions/page.tsx', 'utf8').includes("redirect('/cogs-inputs')"), true);
  assert.equal(readFileSync('app/bills/page.tsx', 'utf8').includes("redirect('/cogs-inputs')"), true);
  assert.equal(readFileSync('app/cashflow/page.tsx', 'utf8').includes("redirect('/settlements')"), true);
  assert.equal(readFileSync('app/chart-of-accounts/page.tsx', 'utf8').includes("redirect('/settlements')"), true);
});

test('cogs inputs page is read-only QBO source intake', () => {
  const routeSource = readFileSync('app/cogs-inputs/page.tsx', 'utf8');
  const pageSource = readFileSync('components/cogs-inputs/cogs-inputs-page.tsx', 'utf8');

  assert.equal(routeSource.includes('CogsInputsPage'), true);
  assert.equal(pageSource.includes('PageHeader title="COGS Inputs"'), true);
  assert.equal(pageSource.includes("const tab: 'journalEntry' | 'bill' | 'purchase' = 'bill';"), true);
  assert.equal(pageSource.includes('New Bill'), false);
  assert.equal(pageSource.includes('New Expense'), false);
  assert.equal(pageSource.includes('setCreateBillOpen(true)'), false);
  assert.equal(pageSource.includes('setCreatePurchaseOpen(true)'), false);
  assert.equal(pageSource.includes('<Tabs'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: FAIL on the new tests because `COGS Inputs` and redirect routes do not exist yet.

### Task 2: Replace Primary Navigation

**Files:**
- Modify: `apps/plutus/components/app-header.tsx`

- [ ] **Step 1: Replace nav imports and items**

Use this target shape:

```ts
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import MapIcon from '@mui/icons-material/Map';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SettingsIcon from '@mui/icons-material/Settings';
```

```ts
type NavItem = { href: string; label: string; icon: SvgIconComponent };

const NAV_ITEMS: NavItem[] = [
  { href: '/settlements', label: 'Settlements', icon: ReceiptLongIcon },
  { href: '/cogs-inputs', label: 'COGS Inputs', icon: AssignmentTurnedInIcon },
  { href: '/exceptions', label: 'Exceptions', icon: ErrorOutlineIcon },
  { href: '/settlement-mapping', label: 'Mappings', icon: MapIcon },
  { href: '/data-sources', label: 'Sources', icon: InventoryIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];
```

Delete the dropdown component and the dropdown rendering branches from desktop and mobile nav.

- [ ] **Step 2: Run the nav test**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: the nav-scope test passes; redirect and COGS tests still fail.

### Task 3: Create COGS Inputs Route From Existing Bill Mapping Surface

**Files:**
- Move: `apps/plutus/app/transactions/page.tsx` to `apps/plutus/components/cogs-inputs/cogs-inputs-page.tsx`
- Create: `apps/plutus/app/cogs-inputs/page.tsx`
- Create: `apps/plutus/app/transactions/page.tsx`
- Modify: `apps/plutus/app/bills/page.tsx`

- [ ] **Step 1: Move the existing transaction component**

Run:

```bash
mkdir -p apps/plutus/components/cogs-inputs
mv apps/plutus/app/transactions/page.tsx apps/plutus/components/cogs-inputs/cogs-inputs-page.tsx
```

- [ ] **Step 2: Convert the moved component to bill-only COGS input mode**

In `apps/plutus/components/cogs-inputs/cogs-inputs-page.tsx`, rename the exported component:

```ts
export function CogsInputsPage() {
```

Inside it, replace tab store usage with:

```ts
  const tab: 'journalEntry' | 'bill' | 'purchase' = 'bill';
```

Set the not-connected and page header title to `COGS Inputs`, remove the `<Tabs>` block, remove rendered `New Bill` and `New Expense` buttons, and remove rendered `CreateBillModal` and `CreatePurchaseModal` blocks.

- [ ] **Step 3: Add route entry points**

`apps/plutus/app/cogs-inputs/page.tsx`:

```ts
import { CogsInputsPage } from '@/components/cogs-inputs/cogs-inputs-page';

export default CogsInputsPage;
```

`apps/plutus/app/transactions/page.tsx`:

```ts
import { redirect } from 'next/navigation';

export default function TransactionsPage() {
  redirect('/cogs-inputs');
}
```

`apps/plutus/app/bills/page.tsx`:

```ts
import { redirect } from 'next/navigation';

export default function BillsPage() {
  redirect('/cogs-inputs');
}
```

- [ ] **Step 4: Run the COGS test**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: COGS test passes; cashflow/chart redirects still fail.

### Task 4: Redirect Removed QBO Clone Pages and Add Exceptions Route

**Files:**
- Modify: `apps/plutus/app/cashflow/page.tsx`
- Modify: `apps/plutus/app/chart-of-accounts/page.tsx`
- Create: `apps/plutus/app/exceptions/page.tsx`

- [ ] **Step 1: Redirect removed primary surfaces**

Replace both removed pages with:

```ts
import { redirect } from 'next/navigation';

export default function RemovedQboClonePage() {
  redirect('/settlements');
}
```

- [ ] **Step 2: Add exceptions entry point**

Create `apps/plutus/app/exceptions/page.tsx`:

```ts
import { redirect } from 'next/navigation';

export default function ExceptionsPage() {
  redirect('/settlements');
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm -C apps/plutus test
```

Expected: the three new scope tests pass.

### Task 5: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run Plutus checks**

Run:

```bash
pnpm -C apps/plutus test
pnpm -C apps/plutus type-check
pnpm -C apps/plutus lint
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Commit implementation**

Run:

```bash
git add apps/plutus docs/superpowers/plans/2026-05-04-plutus-product-scope-strip-down.md
git commit -m "feat(plutus): strip primary app to settlement accounting"
```
