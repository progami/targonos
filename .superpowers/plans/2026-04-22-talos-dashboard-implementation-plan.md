# Talos Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Talos dashboard with a fast operations overview that answers how much stock is in factory, transit, and each warehouse, with warehouse rows sorted by cartons.

**Architecture:** Keep the current dashboard data pipeline split into three layers: a server route that fetches tenant data, a pure snapshot builder that aggregates it into dashboard-specific totals, and a dedicated dashboard UI component that renders a summary strip plus warehouse/factory/transit sections. Remove the current `stock-network` presentation and route names so the dashboard code and copy stop using graph/analytics language.

**Tech Stack:** Next.js app router, React client components, TypeScript, Prisma Talos client, `@targon/ledger` aggregation helpers, Node test runner via `tsx --test`, ESLint.

---

## File Structure

### Files to create
- `apps/talos/src/lib/dashboard/dashboard-overview.ts`
  - Pure data transformer for the new dashboard snapshot.
- `apps/talos/src/lib/dashboard/dashboard-overview.test.ts`
  - Unit coverage for the new aggregation rules.
- `apps/talos/src/app/api/dashboard/overview/route.ts`
  - Authenticated dashboard data endpoint for the new dashboard.
- `apps/talos/src/components/dashboard/dashboard-overview-board.tsx`
  - New dashboard UI that uses operational copy and the hybrid layout.

### Files to modify
- `apps/talos/src/app/dashboard/page.tsx`
  - Fetch the new overview route and render the new dashboard component.
- `apps/talos/src/app/operations/inventory/page.tsx`
  - Remove any leftover dashboard/analytics coupling introduced during the stock-network attempt.

### Files to delete after replacement
- `apps/talos/src/lib/dashboard/stock-network.ts`
- `apps/talos/src/lib/dashboard/stock-network.test.ts`
- `apps/talos/src/app/api/dashboard/stock-network/route.ts`
- `apps/talos/src/components/dashboard/stock-network-board.tsx`

---

### Task 1: Build the new dashboard snapshot model

**Files:**
- Create: `apps/talos/src/lib/dashboard/dashboard-overview.ts`
- Test: `apps/talos/src/lib/dashboard/dashboard-overview.test.ts`

- [ ] **Step 1: Write the failing snapshot test**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDashboardOverviewSnapshot,
  type DashboardOverviewBalanceInput,
  type DashboardOverviewPurchaseOrderInput,
} from './dashboard-overview'

test('buildDashboardOverviewSnapshot groups stock into factory, transit, and warehouse totals', () => {
  const purchaseOrders: DashboardOverviewPurchaseOrderInput[] = [
    {
      id: 'po-mfg-1',
      orderNumber: 'PO-1001',
      status: 'MANUFACTURING',
      counterpartyName: 'Ningbo Mills',
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      totalCartons: 120,
      totalPallets: 8,
      totalUnits: 960,
    },
    {
      id: 'po-ocean-1',
      orderNumber: 'PO-1002',
      status: 'OCEAN',
      counterpartyName: 'Ningbo Mills',
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      totalCartons: 80,
      totalPallets: 5,
      totalUnits: 640,
    },
  ]

  const balances: DashboardOverviewBalanceInput[] = [
    {
      warehouseCode: 'TCL-CHINO',
      warehouseName: 'Tactical Warehouse Solutions',
      skuCode: 'CS-007',
      currentCartons: 300,
      currentPallets: 20,
      currentUnits: 2400,
    },
    {
      warehouseCode: 'FMC-UK',
      warehouseName: 'FMC Logistics (UK) Ltd',
      skuCode: 'CS-12LD-7M',
      currentCartons: 200,
      currentPallets: 10,
      currentUnits: 1600,
    },
  ]

  const snapshot = buildDashboardOverviewSnapshot({ purchaseOrders, balances })

  assert.equal(snapshot.summary.factory.cartons, 120)
  assert.equal(snapshot.summary.factory.pallets, 8)
  assert.equal(snapshot.summary.factory.units, 960)
  assert.equal(snapshot.summary.factory.poCount, 1)

  assert.equal(snapshot.summary.transit.cartons, 80)
  assert.equal(snapshot.summary.transit.pallets, 5)
  assert.equal(snapshot.summary.transit.units, 640)
  assert.equal(snapshot.summary.transit.poCount, 1)

  assert.equal(snapshot.summary.warehouses.cartons, 500)
  assert.equal(snapshot.summary.warehouses.pallets, 30)
  assert.equal(snapshot.summary.warehouses.units, 4000)
  assert.equal(snapshot.summary.warehouses.warehouseCount, 2)

  assert.deepEqual(
    snapshot.warehouses.map(row => row.warehouseCode),
    ['TCL-CHINO', 'FMC-UK']
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @targon/talos exec tsx --test src/lib/dashboard/dashboard-overview.test.ts`
Expected: FAIL with `Cannot find module './dashboard-overview'` or missing export errors.

- [ ] **Step 3: Write the minimal snapshot builder**

```ts
export interface DashboardOverviewPurchaseOrderInput {
  id: string
  orderNumber: string
  status: 'MANUFACTURING' | 'OCEAN'
  counterpartyName: string | null
  warehouseCode: string | null
  warehouseName: string | null
  totalCartons: number
  totalPallets: number
  totalUnits: number
}

export interface DashboardOverviewBalanceInput {
  warehouseCode: string
  warehouseName: string
  skuCode: string
  currentCartons: number
  currentPallets: number
  currentUnits: number
}

export interface DashboardOverviewSnapshot {
  summary: {
    factory: { cartons: number; pallets: number; units: number; poCount: number }
    transit: { cartons: number; pallets: number; units: number; poCount: number }
    warehouses: { cartons: number; pallets: number; units: number; warehouseCount: number }
  }
  warehouses: Array<{
    warehouseCode: string
    warehouseName: string
    cartons: number
    pallets: number
    units: number
    skuCount: number
  }>
}

export function buildDashboardOverviewSnapshot({
  purchaseOrders,
  balances,
}: {
  purchaseOrders: DashboardOverviewPurchaseOrderInput[]
  balances: DashboardOverviewBalanceInput[]
}): DashboardOverviewSnapshot {
  const factoryOrders = purchaseOrders.filter(order => order.status === 'MANUFACTURING')
  const transitOrders = purchaseOrders.filter(order => order.status === 'OCEAN')

  const warehouseMap = new Map<string, DashboardOverviewSnapshot['warehouses'][number] & { skuCodes: Set<string> }>()

  for (const balance of balances) {
    const key = balance.warehouseCode.trim().length > 0 ? balance.warehouseCode : balance.warehouseName
    const existing = warehouseMap.get(key)
    if (existing === undefined) {
      warehouseMap.set(key, {
        warehouseCode: balance.warehouseCode,
        warehouseName: balance.warehouseName,
        cartons: balance.currentCartons,
        pallets: balance.currentPallets,
        units: balance.currentUnits,
        skuCount: 1,
        skuCodes: new Set([balance.skuCode]),
      })
      continue
    }

    existing.cartons += balance.currentCartons
    existing.pallets += balance.currentPallets
    existing.units += balance.currentUnits
    existing.skuCodes.add(balance.skuCode)
    existing.skuCount = existing.skuCodes.size
  }

  const warehouses = Array.from(warehouseMap.values())
    .map(({ skuCodes: _skuCodes, ...row }) => row)
    .sort((left, right) => right.cartons - left.cartons)

  return {
    summary: {
      factory: {
        cartons: factoryOrders.reduce((sum, order) => sum + order.totalCartons, 0),
        pallets: factoryOrders.reduce((sum, order) => sum + order.totalPallets, 0),
        units: factoryOrders.reduce((sum, order) => sum + order.totalUnits, 0),
        poCount: factoryOrders.length,
      },
      transit: {
        cartons: transitOrders.reduce((sum, order) => sum + order.totalCartons, 0),
        pallets: transitOrders.reduce((sum, order) => sum + order.totalPallets, 0),
        units: transitOrders.reduce((sum, order) => sum + order.totalUnits, 0),
        poCount: transitOrders.length,
      },
      warehouses: {
        cartons: warehouses.reduce((sum, row) => sum + row.cartons, 0),
        pallets: warehouses.reduce((sum, row) => sum + row.pallets, 0),
        units: warehouses.reduce((sum, row) => sum + row.units, 0),
        warehouseCount: warehouses.length,
      },
    },
    warehouses,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @targon/talos exec tsx --test src/lib/dashboard/dashboard-overview.test.ts`
Expected: PASS with `1 test passed`.

- [ ] **Step 5: Commit the snapshot builder**

```bash
git add apps/talos/src/lib/dashboard/dashboard-overview.ts apps/talos/src/lib/dashboard/dashboard-overview.test.ts
git commit -m "feat(talos): add dashboard overview snapshot"
```

### Task 2: Replace the dashboard API route with an overview route

**Files:**
- Create: `apps/talos/src/app/api/dashboard/overview/route.ts`
- Modify: `apps/talos/src/lib/dashboard/dashboard-overview.ts`
- Delete: `apps/talos/src/app/api/dashboard/stock-network/route.ts`
- Test: `apps/talos/src/lib/dashboard/dashboard-overview.test.ts`

- [ ] **Step 1: Extend the test to cover warehouse sorting and zero-value filtering**

```ts
test('buildDashboardOverviewSnapshot sorts warehouses by cartons descending', () => {
  const snapshot = buildDashboardOverviewSnapshot({
    purchaseOrders: [],
    balances: [
      {
        warehouseCode: 'B',
        warehouseName: 'Warehouse B',
        skuCode: 'SKU-2',
        currentCartons: 10,
        currentPallets: 1,
        currentUnits: 100,
      },
      {
        warehouseCode: 'A',
        warehouseName: 'Warehouse A',
        skuCode: 'SKU-1',
        currentCartons: 40,
        currentPallets: 4,
        currentUnits: 400,
      },
    ],
  })

  assert.deepEqual(snapshot.warehouses.map(row => row.warehouseCode), ['A', 'B'])
})
```

- [ ] **Step 2: Run the test to verify the current builder still passes**

Run: `pnpm --filter @targon/talos exec tsx --test src/lib/dashboard/dashboard-overview.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the new overview route and wire it to real tenant data**

```ts
import { NextResponse } from 'next/server'
import { Prisma } from '@targon/prisma-talos'
import { aggregateInventoryTransactions } from '@targon/ledger'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import {
  AMAZON_WAREHOUSE_CODES,
  canRegionUseWarehouseCode,
  type TalosRegion,
} from '@/lib/warehouses/amazon-warehouse'
import { buildDashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_request, session) => {
  const prisma = await getTenantPrisma()
  let warehouseCodeFilter: string | null = null

  if (session.user.role === 'staff' && session.user.warehouseId) {
    const staffWarehouse = await prisma.warehouse.findUnique({
      where: { id: session.user.warehouseId },
      select: { code: true },
    })

    if (staffWarehouse !== null) {
      warehouseCodeFilter = staffWarehouse.code
    }
  }

  const blockedAmazonWarehouseCodes =
    warehouseCodeFilter === null
      ? AMAZON_WAREHOUSE_CODES.filter(
          warehouseCode => !canRegionUseWarehouseCode(session.user.region as TalosRegion, warehouseCode)
        )
      : []

  const transactionWhere: Prisma.InventoryTransactionWhereInput = {}
  if (warehouseCodeFilter !== null) {
    transactionWhere.warehouseCode = warehouseCodeFilter
  } else if (blockedAmazonWarehouseCodes.length > 0) {
    transactionWhere.NOT = { warehouseCode: { in: blockedAmazonWarehouseCodes } }
  }

  const purchaseOrderWhere: Prisma.PurchaseOrderWhereInput = {
    status: { in: ['MANUFACTURING', 'OCEAN'] },
  }
  if (warehouseCodeFilter !== null) {
    purchaseOrderWhere.warehouseCode = warehouseCodeFilter
  } else if (blockedAmazonWarehouseCodes.length > 0) {
    purchaseOrderWhere.NOT = { warehouseCode: { in: blockedAmazonWarehouseCodes } }
  }

  const [transactions, purchaseOrders] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        purchaseOrder: { select: { orderNumber: true } },
        fulfillmentOrder: { select: { foNumber: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: purchaseOrderWhere,
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        counterpartyName: true,
        warehouseCode: true,
        warehouseName: true,
        totalCartons: true,
        totalPallets: true,
        lines: { select: { unitsOrdered: true } },
      },
    }),
  ])

  const aggregated = aggregateInventoryTransactions(
    transactions.map(({ purchaseOrder, fulfillmentOrder, ...transaction }) => ({
      ...transaction,
      purchaseOrderNumber: purchaseOrder?.orderNumber ?? null,
      fulfillmentOrderNumber: fulfillmentOrder?.foNumber ?? null,
    }))
  )

  return NextResponse.json(
    buildDashboardOverviewSnapshot({
      purchaseOrders: purchaseOrders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status as 'MANUFACTURING' | 'OCEAN',
        counterpartyName: order.counterpartyName,
        warehouseCode: order.warehouseCode,
        warehouseName: order.warehouseName,
        totalCartons: order.totalCartons,
        totalPallets: order.totalPallets ?? 0,
        totalUnits: order.lines.reduce((sum, line) => sum + line.unitsOrdered, 0),
      })),
      balances: aggregated.balances.map(balance => ({
        warehouseCode: balance.warehouseCode,
        warehouseName: balance.warehouseName,
        skuCode: balance.skuCode,
        currentCartons: balance.currentCartons,
        currentPallets: balance.currentPallets,
        currentUnits: balance.currentUnits,
      })),
    })
  )
})
```

- [ ] **Step 4: Run type-check and snapshot tests**

Run:
```bash
pnpm --filter @targon/talos exec tsx --test src/lib/dashboard/dashboard-overview.test.ts
pnpm --filter @targon/talos type-check
```
Expected:
- test passes
- `tsc --noEmit` exits 0

- [ ] **Step 5: Commit the route replacement**

```bash
git add apps/talos/src/app/api/dashboard/overview/route.ts apps/talos/src/lib/dashboard/dashboard-overview.ts apps/talos/src/lib/dashboard/dashboard-overview.test.ts
git rm apps/talos/src/app/api/dashboard/stock-network/route.ts
git commit -m "feat(talos): add dashboard overview api"
```

### Task 3: Replace the dashboard UI with an operations overview board

**Files:**
- Create: `apps/talos/src/components/dashboard/dashboard-overview-board.tsx`
- Modify: `apps/talos/src/app/dashboard/page.tsx`
- Delete: `apps/talos/src/components/dashboard/stock-network-board.tsx`
- Test: `apps/talos/src/lib/dashboard/dashboard-overview.test.ts`

- [ ] **Step 1: Write the new overview component with operational copy**

```tsx
'use client'

import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

function SummaryCard({
  title,
  cartons,
  pallets,
  units,
}: {
  title: string
  cartons: number
  pallets: number
  units: number
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Cartons</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{cartons.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Pallets</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{pallets.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Units</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{units.toLocaleString()}</div>
        </div>
      </div>
    </section>
  )
}

export function DashboardOverviewBoard({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard title="In Factory" {...snapshot.summary.factory} />
        <SummaryCard title="In Transit" {...snapshot.summary.transit} />
        <SummaryCard title="In Warehouses" {...snapshot.summary.warehouses} />
      </div>

      <section className="rounded-[28px] border border-slate-800 bg-slate-950 p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Warehouses</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">Warehouse stock</div>
          </div>
          <div className="text-xs text-slate-500">Sorted by cartons</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3 text-right">Cartons</th>
                <th className="px-3 py-3 text-right">Pallets</th>
                <th className="px-3 py-3 text-right">Units</th>
                <th className="px-3 py-3 text-right">SKUs</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.warehouses.map(row => (
                <tr key={row.warehouseCode} className="border-b border-slate-900 text-slate-300">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-100">{row.warehouseCode}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.warehouseName}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{row.cartons.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{row.pallets.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{row.units.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{row.skuCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Factory</div>
          <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
            <div><div className="text-slate-500">Cartons</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.factory.cartons.toLocaleString()}</div></div>
            <div><div className="text-slate-500">Pallets</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.factory.pallets.toLocaleString()}</div></div>
            <div><div className="text-slate-500">Units</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.factory.units.toLocaleString()}</div></div>
            <div><div className="text-slate-500">POs</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.factory.poCount.toLocaleString()}</div></div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Transit</div>
          <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
            <div><div className="text-slate-500">Cartons</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.transit.cartons.toLocaleString()}</div></div>
            <div><div className="text-slate-500">Pallets</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.transit.pallets.toLocaleString()}</div></div>
            <div><div className="text-slate-500">Units</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.transit.units.toLocaleString()}</div></div>
            <div><div className="text-slate-500">POs</div><div className="mt-1 font-semibold text-slate-100">{snapshot.summary.transit.poCount.toLocaleString()}</div></div>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update the dashboard page to use the new route and component**

```tsx
import { DashboardOverviewBoard } from '@/components/dashboard/dashboard-overview-board'
import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

// replace StockNetworkSnapshot with DashboardOverviewSnapshot
const [snapshot, setSnapshot] = useState<DashboardOverviewSnapshot | null>(null)

const response = await fetch(withBasePath('/api/dashboard/overview'), {
  credentials: 'include',
})

const payload: DashboardOverviewSnapshot = await response.json()
setSnapshot(payload)

<PageHeaderSection
  title="Dashboard"
  description="Home"
  icon={Boxes}
  actions={
    <button
      type="button"
      onClick={() => router.push('/operations/inventory')}
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
    >
      Open Inventory Ledger
    </button>
  }
/>

<PageContent>
  <DashboardOverviewBoard snapshot={snapshot} />
</PageContent>
```

- [ ] **Step 3: Remove the graph/stock-network UI files**

Run:
```bash
git rm apps/talos/src/components/dashboard/stock-network-board.tsx
```

Expected: file staged for deletion and no imports remain.

- [ ] **Step 4: Run type-check and lint on the dashboard files**

Run:
```bash
pnpm --filter @targon/talos type-check
pnpm --filter @targon/talos exec eslint src/app/dashboard/page.tsx src/components/dashboard/dashboard-overview-board.tsx
```
Expected:
- type-check exits 0
- eslint exits 0

- [ ] **Step 5: Commit the dashboard UI replacement**

```bash
git add apps/talos/src/app/dashboard/page.tsx apps/talos/src/components/dashboard/dashboard-overview-board.tsx
git commit -m "feat(talos): redesign dashboard overview"
```

### Task 4: Remove leftover stock-network coupling and verify the live flow

**Files:**
- Modify: `apps/talos/src/app/operations/inventory/page.tsx`
- Delete: `apps/talos/src/lib/dashboard/stock-network.ts`
- Delete: `apps/talos/src/lib/dashboard/stock-network.test.ts`

- [ ] **Step 1: Remove stale dashboard coupling from inventory and delete old files**

Run:
```bash
git rm apps/talos/src/lib/dashboard/stock-network.ts
git rm apps/talos/src/lib/dashboard/stock-network.test.ts
```

Then verify `apps/talos/src/app/operations/inventory/page.tsx` contains no dashboard-specific tabs or analytics copy beyond the normal inventory ledger header.

- [ ] **Step 2: Run the full Talos verification set**

Run:
```bash
pnpm --filter @targon/talos exec tsx --test src/lib/dashboard/dashboard-overview.test.ts
pnpm --filter @targon/talos type-check
pnpm --filter @targon/talos exec eslint src/app/dashboard/page.tsx src/components/dashboard/dashboard-overview-board.tsx src/app/api/dashboard/overview/route.ts src/lib/dashboard/dashboard-overview.ts
```
Expected:
- snapshot test passes
- type-check exits 0
- eslint exits 0

- [ ] **Step 3: Start Talos locally and verify the actual dashboard route**

Run:
```bash
pnpm --filter @targon/talos dev
curl -s http://localhost:41201/talos/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:41201/talos
```
Expected:
- dev server reports `Local: http://localhost:41201`
- health route returns JSON with all checks true
- `/talos` returns `200`

- [ ] **Step 4: Browser-check the final dashboard content**

Verify in the browser that the page shows:
- page title `Dashboard`
- summary cards `In Factory`, `In Transit`, `In Warehouses`
- warehouse section sorted by cartons
- no labels like `Stock Network`, `Inventory Network`, `Nodes`, `Movement`, `Visual Flow`

- [ ] **Step 5: Commit the cleanup and verification**

```bash
git add apps/talos/src/app/dashboard/page.tsx apps/talos/src/app/api/dashboard/overview/route.ts apps/talos/src/components/dashboard/dashboard-overview-board.tsx apps/talos/src/lib/dashboard/dashboard-overview.ts apps/talos/src/lib/dashboard/dashboard-overview.test.ts apps/talos/src/app/operations/inventory/page.tsx
git commit -m "chore(talos): remove stock network dashboard"
```

---

## Self-Review

### Spec coverage
- Header renamed back to `Dashboard`: covered in Task 3.
- Summary strip with `In Factory`, `In Transit`, `In Warehouses`: covered in Task 3.
- Warehouse-first main body with cartons/pallets/units/SKU count: covered in Task 3.
- Factory and Transit support blocks with PO count: covered in Tasks 1 and 3.
- No graph/network copy: covered in Tasks 3 and 4.
- Keep existing data pipeline direction but change presentation: covered in Tasks 1 and 2.

### Placeholder scan
- No `TBD`, `TODO`, or deferred work markers remain.
- Each task has exact files, commands, and concrete code.

### Type consistency
- The plan uses `DashboardOverviewSnapshot` consistently across the builder, route, and UI.
- The route path and fetch path are both `/api/dashboard/overview`.
