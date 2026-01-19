# xplan Sellerboard Standardization & Week System Overhaul

## Overview

**Goals:**
1. Standardize Sellerboard endpoint usage across xplan
2. Visually distinguish "real" weeks (with actual Sellerboard data) from "projected" weeks
3. Change week start day from Sunday to Monday globally (for all regions)

---

## Phase 1: Change Week Start Day to Monday (Global)

### Background

Currently xplan uses Sunday as week start for US region. This needs to change to Monday everywhere to align with:
- Sellerboard (uses Monday-Sunday weeks)
- Standard business week convention
- International consistency

### Task 1.1: Identify all week calculation locations

Files to update:
- `apps/xplan/lib/calculations/sales.ts` - `resolveWeekNumber()`, `getWeekStartDate()`
- `apps/xplan/lib/calculations/ops.ts` - Week number calculations for PO dates
- `apps/xplan/lib/calculations/finance.ts` - P&L and Cash Flow week aggregations
- `apps/xplan/lib/integrations/sellerboard-us-actual-sales-sync.ts` - Sellerboard sync week parsing
- `apps/xplan/components/sheets/sales-planning-grid.tsx` - `PLANNING_ANCHOR_DATE`, `PLANNING_ANCHOR_WEEK`
- Any other files using `getDay()`, `startOfWeek()`, or week calculations

### Task 1.2: Update planning anchor

Current:
```typescript
const PLANNING_ANCHOR_WEEK = 1;
const PLANNING_ANCHOR_DATE = new Date('2025-01-05T00:00:00.000Z'); // Sunday
```

Change to:
```typescript
const PLANNING_ANCHOR_WEEK = 1;
const PLANNING_ANCHOR_DATE = new Date('2025-01-06T00:00:00.000Z'); // Monday
```

### Task 1.3: Update week calculation functions

Current logic (Sunday = 0):
```typescript
function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}
```

Change to (Monday = 0):
```typescript
function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0, Sunday = 6
  d.setDate(d.getDate() - diff);
  return d;
}
```

### Task 1.4: Update region-specific week start config

If there's a region-based week start config, remove it or set all regions to Monday:

```typescript
// Remove or change
const WEEK_START_DAY = {
  US: 0, // Sunday - REMOVE THIS
  UK: 1, // Monday
}

// Change to
const WEEK_START_DAY = 1; // Monday for all regions
```

### Task 1.5: Update Sellerboard sync date parsing

Ensure Sellerboard CSV dates are aggregated using Monday-Sunday week boundaries.

Current file: `apps/xplan/lib/integrations/sellerboard-us-actual-sales-sync.ts`

Update week parsing to use Monday as week start.

### Task 1.6: Database migration consideration

If existing `SalesWeek` records have `weekDate` stored as Sunday, need to either:
- Option A: Migrate all `weekDate` values to Monday (recommended)
- Option B: Keep stored as-is, convert on read (messy)

Recommended: Create migration to shift all `weekDate` values by +1 day.

### Task 1.7: Update UI week labels

Ensure week labels show correct date range (Mon-Sun instead of Sun-Sat).

Example: "Week 3 (Jan 13-19)" instead of "Week 3 (Jan 12-18)"

### Task 1.8: Test cases to verify

- [ ] Sales Planning grid shows correct week dates
- [ ] Sellerboard sync aggregates to correct weeks
- [ ] P&L weekly totals align with Sellerboard
- [ ] Cash Flow weeks align
- [ ] PO arrival weeks calculate correctly
- [ ] Historical data still displays correctly after migration

---

## Phase 2: Standardize Sellerboard Data Layer

### Task 2.1: Create unified Sellerboard service folder structure

Location: `apps/xplan/lib/integrations/sellerboard/`

```
sellerboard/
├── client.ts          # Shared fetch logic, auth, error handling
├── types.ts           # TypeScript types for all Sellerboard data
├── orders.ts          # Orders endpoint (current - units)
├── dashboard.ts       # Dashboard by day endpoint (NEW - revenue, fees)
├── advertising.ts     # Advertising Performance (NEW - PPC spend)
├── sync.ts            # Unified sync orchestration
└── index.ts           # Re-exports
```

### Task 2.2: Define Sellerboard data types

```typescript
// types.ts

// Raw CSV row from Orders report
export type SellerboardOrderRow = {
  amazonOrderId: string
  purchaseDateUtc: Date
  products: string  // SKU or ASIN
  numberOfItems: number
  orderStatus: string
}

// Raw CSV row from Dashboard by day report
export type SellerboardDashboardRow = {
  date: Date
  product: string  // SKU or ASIN
  units: number
  revenue: number
  amazonFees: number      // referral + FBA combined
  refunds: number
  ppcSpend: number
  netProfit: number
}

// Aggregated weekly data
export type SellerboardWeeklyData = {
  weekNumber: number
  weekDate: Date  // Monday of the week
  productCode: string
  units: number
  revenue: number
  amazonFees: number
  refunds: number
  ppcSpend: number
  netProfit: number
  orderCount: number
  hasActualData: boolean
}

// Sync result
export type SellerboardSyncResult = {
  success: boolean
  rowsParsed: number
  rowsSkipped: number
  productsMatched: number
  weeksUpdated: number
  errors: string[]
  csvSha256: string
  dateRange: {
    oldest: Date
    newest: Date
  }
}
```

### Task 2.3: Create shared client

```typescript
// client.ts

export async function fetchSellerboardCsv(reportUrl: string): Promise<string> {
  const response = await fetch(reportUrl, { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Sellerboard fetch failed: ${response.status}`)
  }
  return response.text()
}

export function parseSellerboardCsv<T>(
  csvContent: string,
  rowParser: (row: Record<string, string>) => T | null
): T[] {
  // CSV parsing logic with header detection
  // Skip BOM if present
  // Handle quoted fields
  // Return parsed rows
}

export function hashCsvContent(content: string): string {
  // SHA256 hash for change detection
}
```

### Task 2.4: Migrate existing Orders sync

Move from:
- `apps/xplan/lib/integrations/sellerboard-us-actual-sales-sync.ts`
- `apps/xplan/lib/integrations/sellerboard-orders.ts`

To:
- `apps/xplan/lib/integrations/sellerboard/orders.ts`

Preserve all existing functionality:
- CSV parsing
- SKU/ASIN matching (direct + Talos lookup)
- Week aggregation (now with Monday start)
- Database upsert

### Task 2.5: Update API routes to use new service

Update:
- `POST /api/v1/xplan/sellerboard/us-actual-sales/sync`
- `GET /api/v1/xplan/sellerboard/us-actual-sales/debug`
- `GET /api/v1/xplan/sellerboard/us-actual-sales/compare`
- `GET /api/v1/xplan/sellerboard/us-actual-sales/raw-week`

To import from new location.

---

## Phase 3: Add Dashboard by Day Endpoint

### Task 3.1: Create new Sellerboard automation report

In Sellerboard UI → Settings → Automation:
1. Click "Add" to create new report
2. Select "Dashboard by day" report type
3. Set CSV Separator to "Comma"
4. Set delivery method to "Link"
5. Save and copy the generated URL
6. Add to environment: `SELLERBOARD_US_DASHBOARD_REPORT_URL`

### Task 3.2: Identify Dashboard CSV columns

Download a sample CSV and document all columns:

Expected columns (verify against actual CSV):
- Date
- Product / SKU / ASIN
- Units
- Ordered product sales (revenue)
- Amazon fees
- FBA fees
- Referral fees
- Refunds
- PPC spend
- Net profit
- (possibly more)

### Task 3.3: Implement dashboard parser

```typescript
// dashboard.ts

import { fetchSellerboardCsv, parseSellerboardCsv } from './client'
import type { SellerboardDashboardRow } from './types'

export function parseDashboardRow(row: Record<string, string>): SellerboardDashboardRow | null {
  // Parse date (handle Sellerboard date format)
  // Parse product identifier
  // Parse numeric fields (handle currency symbols, commas)
  // Return null for invalid rows
}

export async function fetchDashboardData(reportUrl: string): Promise<SellerboardDashboardRow[]> {
  const csv = await fetchSellerboardCsv(reportUrl)
  return parseSellerboardCsv(csv, parseDashboardRow)
}

export function aggregateDashboardByWeek(
  rows: SellerboardDashboardRow[],
  getWeekNumber: (date: Date) => number
): Map<string, SellerboardWeeklyData> {
  // Group by week + product
  // Sum units, revenue, fees, etc.
  // Return map keyed by `${weekNumber}-${productCode}`
}
```

### Task 3.4: Create database table for financial actuals

```prisma
// Add to schema.prisma

model SalesWeekFinancials {
  id            String   @id @default(cuid())
  strategyId    String
  productId     String
  weekNumber    Int
  weekDate      DateTime  // Monday of the week

  // From Sellerboard Dashboard
  actualRevenue       Decimal?  @db.Decimal(12, 2)
  actualAmazonFees    Decimal?  @db.Decimal(12, 2)
  actualReferralFees  Decimal?  @db.Decimal(12, 2)
  actualFbaFees       Decimal?  @db.Decimal(12, 2)
  actualRefunds       Decimal?  @db.Decimal(12, 2)
  actualPpcSpend      Decimal?  @db.Decimal(12, 2)
  actualNetProfit     Decimal?  @db.Decimal(12, 2)

  // Metadata
  syncedAt      DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  strategy      Strategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)
  product       Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([strategyId, productId, weekNumber])
  @@index([strategyId])
  @@index([productId])
  @@index([weekNumber])
}
```

### Task 3.5: Create sync endpoint for Dashboard data

`POST /api/v1/xplan/sellerboard/us-dashboard/sync`

```typescript
// Route handler
export async function POST(request: Request) {
  // 1. Fetch Dashboard CSV from Sellerboard
  // 2. Parse rows
  // 3. Match products (SKU/ASIN → Product ID)
  // 4. Aggregate by week (Monday start)
  // 5. Upsert to SalesWeekFinancials table
  // 6. Return sync result
}
```

### Task 3.6: Create debug/compare endpoints for Dashboard

- `GET /api/v1/xplan/sellerboard/us-dashboard/debug` - View parsed data
- `GET /api/v1/xplan/sellerboard/us-dashboard/compare` - Compare vs current P&L calculations

---

## Phase 4: Track "Real" Weeks in Database

### Task 4.1: Add `hasActualData` flag to SalesWeek model

```prisma
model SalesWeek {
  id            String   @id @default(cuid())
  strategyId    String
  productId     String
  weekNumber    Int
  weekDate      DateTime

  actualSales       Int?
  forecastSales     Int?
  systemForecastSales Int?
  systemForecastVersion String?
  finalSales        Int?
  finalSalesSource  String?

  hasActualData     Boolean @default(false)  // NEW FIELD

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // ... relations
}
```

### Task 4.2: Create database migration

```bash
npx prisma migrate dev --name add-has-actual-data-to-sales-week
```

Migration SQL:
```sql
ALTER TABLE "SalesWeek" ADD COLUMN "hasActualData" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Set hasActualData = true where actualSales is not null
UPDATE "SalesWeek" SET "hasActualData" = true WHERE "actualSales" IS NOT NULL;
```

### Task 4.3: Update Orders sync to set `hasActualData`

In `sellerboard/orders.ts`:

```typescript
await prisma.salesWeek.upsert({
  where: {
    strategyId_productId_weekNumber: {
      strategyId,
      productId,
      weekNumber,
    },
  },
  update: {
    actualSales: units,
    hasActualData: true,  // Mark as real data
    updatedAt: new Date(),
  },
  create: {
    strategyId,
    productId,
    weekNumber,
    weekDate,
    actualSales: units,
    hasActualData: true,  // Mark as real data
  },
})
```

### Task 4.4: Handle edge case - clearing actual data

If a week's actual data is cleared (e.g., manual reset), set `hasActualData = false`:

```typescript
// When clearing actual sales
await prisma.salesWeek.update({
  where: { id },
  data: {
    actualSales: null,
    hasActualData: false,
  },
})
```

---

## Phase 5: Visual "Real Week" Indicator in UI

### Task 5.1: Update data loader to include `hasActualData`

In the page data loader (`apps/xplan/app/[sheet]/page.tsx`), ensure `hasActualData` is included in the sales week data passed to components.

```typescript
const salesWeeks = await prisma.salesWeek.findMany({
  where: { strategyId },
  select: {
    weekNumber: true,
    productId: true,
    actualSales: true,
    forecastSales: true,
    systemForecastSales: true,
    finalSales: true,
    hasActualData: true,  // Include this
  },
})
```

### Task 5.2: Pass `hasActualData` to grid components

Update props for:
- `SalesPlanningGrid`
- `ProfitAndLossGrid`
- `CashFlowGrid`
- `POProfitabilitySection`

```typescript
type WeekData = {
  weekNumber: number
  weekDate: Date
  hasActualData: boolean  // Add this
  // ... other fields
}
```

### Task 5.3: Create "Real Week" indicator component

```typescript
// components/ui/real-week-indicator.tsx

export function RealWeekIndicator({ hasActualData }: { hasActualData: boolean }) {
  if (!hasActualData) return null

  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-1"
      title="Actual data from Sellerboard"
    />
  )
}
```

### Task 5.4: Update week column header styling

In `sales-planning-grid.tsx`:

```typescript
// Week header cell
<th
  className={cn(
    'sticky top-0 z-20 px-2 py-1 text-xs font-medium border-b',
    hasActualData
      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
      : 'bg-muted border-border'
  )}
>
  <div className="flex items-center gap-1">
    <span>W{weekNumber}</span>
    <RealWeekIndicator hasActualData={hasActualData} />
  </div>
  <div className="text-muted-foreground text-[10px]">
    {formatWeekDateRange(weekDate)}
  </div>
</th>
```

### Task 5.5: Update data cell styling for actual vs projected

```typescript
// For actualSales column specifically
<td
  className={cn(
    'px-2 py-1 text-right',
    hasActualData
      ? 'bg-emerald-50/50 dark:bg-emerald-950/20'  // Real data - subtle green
      : 'bg-amber-50/50 dark:bg-amber-950/20'      // No actual data - subtle amber
  )}
>
  {value}
</td>
```

### Task 5.6: Add legend to sheet headers

Add a small legend explaining the indicators:

```typescript
<div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
  <div className="flex items-center gap-1">
    <span className="w-2 h-2 rounded-full bg-emerald-500" />
    <span>Actual data</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="w-2 h-2 rounded-full bg-amber-400" />
    <span>Projected</span>
  </div>
</div>
```

---

## Phase 6: Apply to All Sheets

### Task 6.1: Sales Planning Sheet (4-sales-planning)

File: `apps/xplan/components/sheets/sales-planning-grid.tsx`

Updates:
- [ ] Week column headers show green indicator when `hasActualData = true`
- [ ] `actualSales` cells have different background when real vs empty
- [ ] Week dates show Mon-Sun range (not Sun-Sat)
- [ ] Add legend component

### Task 6.2: P&L Sheet (5-fin-planning-pl)

File: `apps/xplan/components/sheets/profit-and-loss-grid.tsx`

Updates:
- [ ] Week column headers show green indicator
- [ ] Revenue/COGS/Fees cells show "Actual" tooltip when based on real Sellerboard data
- [ ] Week dates show Mon-Sun range
- [ ] Add legend component

### Task 6.3: PO P&L Sheet (6-po-profitability)

File: `apps/xplan/components/sheets/po-profitability-section.tsx`

Updates:
- [ ] REAL mode toggle only uses weeks with `hasActualData = true`
- [ ] PROJECTED mode clearly shows it's using forecasts
- [ ] Week references in PO analysis use Monday start
- [ ] Visual distinction between real and projected portions

### Task 6.4: Cash Flow Sheet (7-fin-planning-cash-flow)

File: `apps/xplan/components/sheets/cash-flow-grid.tsx`

Updates:
- [ ] Week column headers show green indicator
- [ ] Amazon Payout shows "Actual" when based on real revenue
- [ ] Week dates show Mon-Sun range
- [ ] Add legend component

### Task 6.5: Ops Planning Sheet (3-ops-planning)

File: `apps/xplan/components/sheets/ops-planning/`

Updates:
- [ ] PO arrival weeks calculated with Monday start
- [ ] Timeline visualization uses Monday-Sunday weeks
- [ ] Week number displays consistent with other sheets

---

## Phase 7: Future Enhancement - Use Actual Financials in P&L

### Task 7.1: Update P&L calculation to use actual data when available

In `apps/xplan/lib/calculations/finance.ts`:

```typescript
function calculateWeeklyPnL(weekNumber: number, products: Product[], salesWeeks: SalesWeek[], financials: SalesWeekFinancials[]) {
  // For each product in week
  for (const product of products) {
    const salesWeek = salesWeeks.find(sw => sw.productId === product.id && sw.weekNumber === weekNumber)
    const financial = financials.find(f => f.productId === product.id && f.weekNumber === weekNumber)

    if (financial && salesWeek?.hasActualData) {
      // Use actual financials from Sellerboard
      return {
        units: salesWeek.actualSales,
        revenue: financial.actualRevenue,
        amazonFees: financial.actualAmazonFees,
        ppcSpend: financial.actualPpcSpend,
        isActual: true,
      }
    } else {
      // Use calculated/estimated values
      return {
        units: salesWeek?.finalSales ?? 0,
        revenue: (salesWeek?.finalSales ?? 0) * product.sellingPrice,
        amazonFees: calculateEstimatedFees(salesWeek, product),
        ppcSpend: calculateEstimatedPpc(salesWeek, product),
        isActual: false,
      }
    }
  }
}
```

### Task 7.2: Show variance between actual and estimated

```typescript
// In P&L grid cell
{isActual && (
  <div className="text-xs text-muted-foreground">
    Est: ${estimated.toFixed(2)}
    ({((actual - estimated) / estimated * 100).toFixed(1)}%)
  </div>
)}
```

### Task 7.3: Add toggle to show actual vs estimated

```typescript
<select value={displayMode} onChange={setDisplayMode}>
  <option value="actual">Show Actual (where available)</option>
  <option value="estimated">Show Estimated Only</option>
  <option value="both">Show Both with Variance</option>
</select>
```

---

## Phase 8: Environment Variables

### Current Variables
```env
# Existing - keep
SELLERBOARD_US_ORDERS_REPORT_URL=https://...
SELLERBOARD_SYNC_TOKEN=...
```

### New Variables to Add
```env
# Dashboard by day report
SELLERBOARD_US_DASHBOARD_REPORT_URL=https://...

# Optional: Advertising Performance report
SELLERBOARD_US_ADVERTISING_REPORT_URL=https://...

# Optional: Cashflow report (for actual Amazon payouts)
SELLERBOARD_US_CASHFLOW_REPORT_URL=https://...
```

### Production Setup
1. Create each report in Sellerboard Automation settings
2. Copy generated URLs to `.env.local` and production environment
3. Test sync endpoints before enabling in production

---

## Phase 9: E2E Testing in Chrome Browser

### CRITICAL: Test on New Strategy Only

**DO NOT test on existing production strategies. Create a new test strategy to avoid corrupting real data.**

### Task 9.1: Create test strategy

1. Go to https://targonos.targonglobal.com/xplan/1-strategies
2. Create new strategy named "TEST - Sellerboard Integration"
3. Use this strategy for ALL testing below
4. Delete test strategy after testing is complete

### Task 9.2: Test Week System (Monday Start)

**URL:** https://targonos.targonglobal.com/xplan/4-sales-planning?year=2026

Browser tests:
- [ ] Open Sales Planning sheet
- [ ] Verify Week 1 of 2025 shows "Jan 6-12" (Monday-Sunday), not "Jan 5-11"
- [ ] Verify Week 3 of 2026 shows "Jan 12-18" (Monday-Sunday)
- [ ] Scroll through weeks and verify all show Mon-Sun range
- [ ] Check week numbers are consistent across all sheets

### Task 9.3: Test Sellerboard Sync

**URL:** https://targonos.targonglobal.com/xplan/4-sales-planning

Browser tests:
- [ ] Trigger Sellerboard sync via UI control
- [ ] Verify sync completes without errors
- [ ] Check that `actualSales` values appear in correct weeks
- [ ] Compare a few week totals with Sellerboard UI to verify accuracy
- [ ] Verify product matching works (check debug endpoint if needed)

### Task 9.4: Test Real Week Indicators

**URL:** https://targonos.targonglobal.com/xplan/4-sales-planning

Browser tests:
- [ ] Weeks with actual data show green indicator (emerald dot)
- [ ] Weeks without actual data show no indicator or amber
- [ ] Legend displays at top of sheet
- [ ] Hover tooltip explains indicator meaning
- [ ] Visual distinction is clear and not overwhelming

### Task 9.5: Test P&L Sheet

**URL:** https://targonos.targonglobal.com/xplan/5-fin-planning-pl

Browser tests:
- [ ] Week dates show Mon-Sun range
- [ ] Green indicators appear on weeks with actual data
- [ ] Revenue/COGS calculations look correct
- [ ] Totals sum correctly
- [ ] Legend displays

### Task 9.6: Test PO P&L Sheet

**URL:** https://targonos.targonglobal.com/xplan/6-po-profitability

Browser tests:
- [ ] Toggle between REAL and PROJECTED modes
- [ ] REAL mode only shows data for weeks with actual data
- [ ] PROJECTED mode fills in forecasts
- [ ] Week references consistent with other sheets

### Task 9.7: Test Cash Flow Sheet

**URL:** https://targonos.targonglobal.com/xplan/7-fin-planning-cash-flow

Browser tests:
- [ ] Week dates show Mon-Sun range
- [ ] Green indicators appear
- [ ] Amazon Payout values align with P&L revenue (with delay)
- [ ] Legend displays

### Task 9.8: Test Ops Planning Sheet

**URL:** https://targonos.targonglobal.com/xplan/3-ops-planning

Browser tests:
- [ ] PO arrival weeks show correct Monday-start week numbers
- [ ] Timeline visualization uses Monday-Sunday weeks
- [ ] Creating new PO assigns correct week numbers

### Task 9.9: Cross-Sheet Consistency

Browser tests:
- [ ] Same week number shows same date range across all sheets
- [ ] Actual data indicators consistent across sheets
- [ ] No duplicate or missing weeks when scrolling

### Task 9.10: Cleanup

After testing:
- [ ] Delete test strategy "TEST - Sellerboard Integration"
- [ ] Verify no test data remains in production database
- [ ] Document any issues found during testing

---

## Implementation Order & Dependencies

| Step | Task | Effort | Dependencies | Priority |
|------|------|--------|--------------|----------|
| 1 | Identify all week calculation locations | Small | None | P0 |
| 2 | Update week start to Monday (all regions) | Medium | Step 1 | P0 |
| 3 | Create database migration for weekDate shift | Medium | Step 2 | P0 |
| 4 | Update Sellerboard sync for Monday weeks | Small | Step 2 | P0 |
| 5 | Update UI week labels (Mon-Sun) | Small | Step 2 | P0 |
| 6 | Test week system changes (Chrome) | Medium | Steps 2-5 | P0 |
| 7 | Create `sellerboard/` folder structure | Small | None | P1 |
| 8 | Migrate existing Orders sync | Small | Step 7 | P1 |
| 9 | Add `hasActualData` to schema + migration | Small | None | P1 |
| 10 | Update sync to set `hasActualData` | Small | Steps 8, 9 | P1 |
| 11 | Backfill `hasActualData` for existing data | Small | Step 9 | P1 |
| 12 | Pass `hasActualData` to frontend | Medium | Step 10 | P1 |
| 13 | Create RealWeekIndicator component | Small | None | P1 |
| 14 | Add visual indicator to Sales Planning | Medium | Steps 12, 13 | P1 |
| 15 | Add visual indicator to P&L | Medium | Steps 12, 13 | P1 |
| 16 | Add visual indicator to Cash Flow | Medium | Steps 12, 13 | P1 |
| 17 | Add visual indicator to PO P&L | Medium | Steps 12, 13 | P1 |
| 18 | Add legend to all sheets | Small | Step 13 | P1 |
| 19 | E2E test all sheets in Chrome | Medium | Steps 6, 14-18 | P1 |
| 20 | Create Dashboard report in Sellerboard | Small | None | P2 |
| 21 | Document Dashboard CSV columns | Small | Step 20 | P2 |
| 22 | Implement Dashboard parser | Medium | Steps 7, 21 | P2 |
| 23 | Create SalesWeekFinancials table | Medium | None | P2 |
| 24 | Implement Dashboard sync endpoint | Medium | Steps 22, 23 | P2 |
| 25 | Create Dashboard debug/compare endpoints | Small | Step 24 | P2 |
| 26 | E2E test Dashboard integration (Chrome) | Medium | Steps 24, 25 | P2 |
| 27 | Use actual financials in P&L calculation | Large | Steps 23, 24 | P3 |
| 28 | Show variance (actual vs estimated) | Medium | Step 27 | P3 |
| 29 | Add display mode toggle | Small | Step 28 | P3 |
| 30 | Final E2E test all features (Chrome) | Medium | All above | P3 |

---

## Testing Checklist

### Week System (Monday Start)
- [ ] Sales Planning grid shows correct week dates (Mon-Sun)
- [ ] Week 1 of 2025 starts on Monday Jan 6, 2025
- [ ] Sellerboard sync aggregates orders to correct weeks
- [ ] P&L weekly totals match Sellerboard Dashboard by day totals
- [ ] Cash Flow weeks align with P&L weeks
- [ ] PO arrival weeks calculate correctly
- [ ] Historical data displays correctly after migration
- [ ] No data loss during weekDate migration

### Real Week Indicators
- [ ] Green indicator appears on weeks with actual Sellerboard data
- [ ] Weeks without actual data show no indicator (or amber)
- [ ] Legend displays correctly on all sheets
- [ ] Tooltip explains indicator meaning
- [ ] `hasActualData` correctly set during sync
- [ ] `hasActualData` correctly cleared when actual data removed

### Sellerboard Integration
- [ ] Orders sync continues to work correctly
- [ ] Dashboard sync populates SalesWeekFinancials correctly
- [ ] Product matching works (SKU + ASIN + Talos)
- [ ] CSV hash change detection works
- [ ] Error handling for failed fetches
- [ ] Debug endpoints return useful data
- [ ] Compare endpoints show discrepancies

### P&L with Actual Financials
- [ ] Actual revenue used when available
- [ ] Estimated revenue used when no actual data
- [ ] Variance calculation correct
- [ ] Display mode toggle works
- [ ] Tooltips show actual vs estimated clearly

### E2E Browser Tests (Chrome)
- [ ] All tests run on NEW test strategy (not production data)
- [ ] Sales Planning sheet works correctly
- [ ] P&L sheet works correctly
- [ ] Cash Flow sheet works correctly
- [ ] PO P&L sheet works correctly
- [ ] Ops Planning sheet works correctly
- [ ] Cross-sheet consistency verified
- [ ] Test strategy deleted after testing

---

## Rollback Plan

If issues arise:

### Week System Rollback
1. Revert migration (shift weekDates back by -1 day)
2. Revert code changes to use Sunday start
3. Re-sync Sellerboard data

### hasActualData Rollback
1. Remove `hasActualData` column (or ignore)
2. Remove visual indicators from UI
3. No data loss - just removes feature

### Dashboard Integration Rollback
1. Disable Dashboard sync endpoint
2. Keep using calculated financials in P&L
3. Drop `SalesWeekFinancials` table if needed

---

## Success Metrics

1. **Data Accuracy**: Sellerboard units match xplan display exactly
2. **Week Alignment**: xplan weeks match Sellerboard Dashboard by day weekly totals
3. **Visual Clarity**: Users can instantly see which weeks have real data
4. **Financial Accuracy**: P&L with actual financials matches Sellerboard profit calculations within 1%
5. **E2E Verification**: All features tested and working in Chrome browser
