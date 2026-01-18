# Page State Persistence Implementation Plan

## Overview

This document outlines the implementation of Zustand-based page state persistence across Talos list/table pages. The goal is to preserve user context (search, filters, sort, pagination, tabs) when navigating away and returning to a page.

## Existing Infrastructure

The Zustand store already exists at:
```
apps/talos/src/lib/store/page-state.ts
```

### Available State Types
| State | Type | Purpose |
|-------|------|---------|
| `activeTab` | `string` | Selected tab on tabbed interfaces |
| `search` | `string` | Search/filter text input |
| `filters` | `Record<string, any>` | Column/field filters |
| `sort` | `{ field, direction }` | Table sort configuration |
| `pagination` | `{ page, pageSize }` | Current page and page size |
| `expandedSections` | `string[]` | Expanded accordion sections |
| `selectedIds` | `string[]` | Multi-select table selections |
| `custom` | `Record<string, unknown>` | Page-specific state |

### Usage Pattern
```typescript
import { usePageState } from '@/lib/store/page-state'

const PAGE_KEY = '/operations/purchase-orders'

function MyPage() {
  const { search, setSearch, filters, updateFilter } = usePageState(PAGE_KEY)
  // ... use persisted state
}
```

---

## Complete Pages Inventory

### Implemented (14 pages/components)

| # | Page | File | State Persisted | Status |
|---|------|------|-----------------|--------|
| 1 | Inventory Ledger | `/operations/inventory/page.tsx` | filters, search | Uses `usePageState` + `useInventoryFilters` |
| 2 | Cost Ledger | `/operations/cost-ledger/page.tsx` | column filters | Uses `usePageState` |
| 3 | Products/SKUs | `/config/products/skus-panel.tsx` | `search` | Implemented |
| 4 | Suppliers | `/config/suppliers/suppliers-panel.tsx` | `search` | Implemented |
| 5 | FBA Discrepancies | `/amazon/fba-fee-discrepancies/page.tsx` | `search`, `statusFilter` | Implemented |
| 6 | Storage Ledger | `/operations/storage-ledger/page.tsx` | `aggregationView`, `filters` | Implemented |
| 7 | Warehouses | `/config/warehouses/warehouses-panel.tsx` | `search` | Implemented |
| 8 | Shipment Planning | `/market/shipment-planning/page.tsx` | `search`, `showOnlyLowStock`, `viewMode`, `showAmazonStatus` | Implemented |
| 9 | Warehouse Rates | `/config/warehouses/warehouse-rates-panel.tsx` | `activeTab` | Implemented |
| 10 | Permissions | `/config/permissions/permissions-panel.tsx` | `search` | Implemented |
| 11 | SKU Batches Panel | `/config/products/sku-batches-modal.tsx` | `search`, `activeTab` | Implemented |
| 12 | Dashboard | `/dashboard/page.tsx` | `timeRange` | Implemented |
| 13 | Purchase Orders | `/operations/purchase-orders/page.tsx` | `activeTab` | Implemented (+ URL params) |
| 14 | Fulfillment Orders | `/operations/fulfillment-orders/page.tsx` | `activeTab` | Implemented (+ URL params) |

### Batches List Page

| # | Page | File | Notes |
|---|------|------|-------|
| 14 | Batches List Page | `/config/products/batches/page.tsx` | Uses `SkuBatchesPanel` - inherits state from #11 |
| 15 | Batch Detail Page | `/config/products/batches/[batchId]/page.tsx` | Detail view - N/A |

### Redirect Pages (No State Needed)

| Page | File | Redirects To |
|------|------|--------------|
| Orders | `/operations/orders/page.tsx` | `/operations/purchase-orders` |
| Transactions List | `/operations/transactions/page.tsx` | Redirect only |
| Finance Cost Ledger | `/finance/cost-ledger/page.tsx` | `/operations/cost-ledger` |
| Finance Storage Ledger | `/finance/storage-ledger/page.tsx` | `/operations/storage-ledger` |

### Under Construction (3 pages)

| Page | File | Reason |
|------|------|--------|
| Market Orders | `/market/orders/page.tsx` | Under construction |
| Reorder | `/market/reorder/page.tsx` | Under construction |
| Amazon Market | `/market/amazon/page.tsx` | Under construction |

### Detail/Create Pages (No List State Needed)

| Page | File | Notes |
|------|------|-------|
| Purchase Order Detail | `/operations/purchase-orders/[id]/page.tsx` | Detail view |
| Purchase Order New | `/operations/purchase-orders/new/page.tsx` | Create form |
| Fulfillment Order Detail | `/operations/fulfillment-orders/[id]/page.tsx` | Detail view |
| Fulfillment Order New | `/operations/fulfillment-orders/new/page.tsx` | Create form |
| Transaction Detail | `/operations/transactions/[id]/page.tsx` | Detail view |
| Warehouse Edit | `/config/warehouses/[id]/edit/page.tsx` | Edit form |
| Warehouse Rates | `/config/warehouses/[id]/rates/page.tsx` | Detail view |
| Warehouse New | `/config/warehouses/new/page.tsx` | Create form |

### Index/Landing Pages (No State Needed)

| Page | File | Notes |
|------|------|-------|
| Home | `/page.tsx` | Redirects to dashboard |
| Config Index | `/config/page.tsx` | Tab container |
| Finance Index | `/finance/page.tsx` | Tab container |
| Market Index | `/market/page.tsx` | Tab container |
| Products Index | `/config/products/page.tsx` | Uses `SkusPanel` |
| Suppliers Index | `/config/suppliers/page.tsx` | Uses `SuppliersPanel` |
| Warehouses Index | `/config/warehouses/page.tsx` | Uses `WarehousesPanel` |
| Permissions Index | `/config/permissions/page.tsx` | Uses `PermissionsPanel` |

### Auth/Error Pages (No State Needed)

| Page | File | Notes |
|------|------|-------|
| Login | `/auth/login/page.tsx` | Auth flow |
| Auth Error | `/auth/error/page.tsx` | Error display |
| No Access | `/no-access/page.tsx` | Access denied |
| Unauthorized | `/unauthorized/page.tsx` | 401 page |

### Test Pages (No State Needed)

| Page | File | Notes |
|------|------|-------|
| S3 Upload Test | `/test/s3-upload/page.tsx` | Dev/test only |

---

## Implementation Checklist

### Phase 1: High Priority - COMPLETED

- [x] **3. Products/SKUs Panel**
  - File: `apps/talos/src/app/config/products/skus-panel.tsx`
  - State: `searchTerm`
  - PAGE_KEY: `/config/products`

- [x] **4. Suppliers Panel**
  - File: `apps/talos/src/app/config/suppliers/suppliers-panel.tsx`
  - State: `searchTerm`
  - PAGE_KEY: `/config/suppliers`

- [x] **5. FBA Fee Discrepancies**
  - File: `apps/talos/src/app/amazon/fba-fee-discrepancies/page.tsx`
  - State: `search`, `statusFilter`
  - PAGE_KEY: `/amazon/fba-fee-discrepancies`

- [x] **6. Storage Ledger**
  - File: `apps/talos/src/app/operations/storage-ledger/page.tsx`
  - State: `aggregationView`, `filters`
  - PAGE_KEY: `/operations/storage-ledger`

### Phase 2: Medium Priority - COMPLETED

- [x] **7. Warehouses Panel**
  - File: `apps/talos/src/app/config/warehouses/warehouses-panel.tsx`
  - State: `searchTerm`
  - PAGE_KEY: `/config/warehouses`

- [x] **8. Shipment Planning**
  - File: `apps/talos/src/app/market/shipment-planning/page.tsx`
  - State: `searchQuery`, `showOnlyLowStock`, `viewMode`, `showAmazonStatus`
  - PAGE_KEY: `/market/shipment-planning`

### Phase 3: Low Priority - COMPLETED

- [x] **9. Warehouse Rates Panel**
  - File: `apps/talos/src/app/config/warehouses/warehouse-rates-panel.tsx`
  - State: `activeTab`
  - PAGE_KEY: `/config/warehouses/${warehouseId}/rates` (dynamic)

- [x] **10. Permissions Panel**
  - File: `apps/talos/src/app/config/permissions/permissions-panel.tsx`
  - State: `searchTerm`
  - PAGE_KEY: `/config/permissions`

- [x] **11. SKU Batches Panel** (used by Batches List Page)
  - File: `apps/talos/src/app/config/products/sku-batches-modal.tsx`
  - State: `batchSearch`, `batchModalTab`
  - PAGE_KEY: `/config/products/batches/${skuId}` (dynamic)

### Phase 4: Additional Pages - COMPLETED

- [x] **12. Dashboard**
  - File: `apps/talos/src/app/dashboard/page.tsx`
  - State: `timeRange`
  - PAGE_KEY: `/dashboard`

- [x] **13. Purchase Orders**
  - File: `apps/talos/src/app/operations/purchase-orders/page.tsx`
  - State: `activeTab` (status filter)
  - PAGE_KEY: `/operations/purchase-orders`
  - Note: Also uses URL params for shareability

- [x] **14. Fulfillment Orders**
  - File: `apps/talos/src/app/operations/fulfillment-orders/page.tsx`
  - State: `activeTab` (status filter)
  - PAGE_KEY: `/operations/fulfillment-orders`
  - Note: Also uses URL params for shareability

---

## Implementation Pattern

### Before (useState)
```typescript
const [searchTerm, setSearchTerm] = useState('')
const [statusFilter, setStatusFilter] = useState<string>('ALL')
```

### After (usePageState)
```typescript
import { usePageState } from '@/lib/store/page-state'

const PAGE_KEY = '/config/products'

function ProductsPanel() {
  const pageState = usePageState(PAGE_KEY)
  
  // Search - use built-in
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch
  
  // Custom state - use custom store
  const statusFilter = (pageState.custom?.statusFilter as string) ?? 'ALL'
  const setStatusFilter = (value: string) => pageState.setCustom('statusFilter', value)
  
  // ... rest of component
}
```

---

## Verification Checklist

For each page, verify:

1. [ ] State initializes correctly on first visit
2. [ ] State persists after navigating away and back
3. [ ] State persists after page refresh
4. [ ] State resets appropriately when user clears/resets
5. [ ] No hydration mismatch errors in console
6. [ ] Performance is acceptable (no lag on state updates)

---

## Notes

- **Don't persist `selectedIds`** - Selection state is session-specific and should reset
- **Don't persist scroll position by default** - Can become stale and confusing
- **URL params vs Zustand** - For shareable state (e.g., linking to filtered view), prefer URL params. For user convenience, use Zustand.
- **Modal state** - Generally don't persist modal-internal state unless it significantly improves UX
- **Panel components** - Many pages use panel components (e.g., `SkusPanel`, `SuppliersPanel`). The panel owns the state, not the page wrapper.

---

## Related Files

- Store: `apps/talos/src/lib/store/page-state.ts`
- Example implementation: `apps/talos/src/app/operations/inventory/page.tsx`
- Example hook: `apps/talos/src/app/operations/inventory/use-inventory-filters.ts`

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Implemented | 14 | Complete |
| Batches Pages | 2 | Uses SkuBatchesPanel |
| Redirect Pages | 4 | N/A |
| Under Construction | 3 | N/A |
| Detail/Create Pages | 8 | N/A |
| Index/Landing Pages | 8 | N/A |
| Auth/Error Pages | 4 | N/A |
| Test Pages | 1 | N/A |
| **Total Pages** | **44** | |
