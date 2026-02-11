# Plutus Setup - UI Design

## Overview

The Setup page guides users through prerequisites before Plutus can process COGS. Uses a sidebar navigation pattern with focused, non-scrolling sections.

**Prerequisite:** Complete the LMB Accounts & Taxes Wizard before finishing the **Accounts** section (parent account mapping + sub-account creation). Brands/SKUs can be configured first.

---

## Design Principles

1. **Sidebar navigation** - Settings-style layout with sections in left sidebar
2. **Focused sections** - Each section fits on screen without scrolling
3. **Full-width content** - Use available horizontal space (no narrow wizards)
4. **NotConnectedScreen pattern** - Dashboards gated until QBO is connected (Setup supports offline mode)

---

## Page Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                          PLUTUS SETUP   │
├────────────────────┬─────────────────────────────────────────────────────────┤
│                    │                                                         │
│  SETUP             │   [Content area for selected section]                   │
│                    │                                                         │
│  ┌──────────────┐  │                                                         │
│  │ ● Brands     │  │                                                         │
│  │   Accounts   │  │                                                         │
│  │   SKUs       │  │                                                         │
│  └──────────────┘  │                                                         │
│                    │                                                         │
│                    │                                                         │
│                    │                                                         │
│                    │                                                         │
│                    │                                                         │
├────────────────────┴─────────────────────────────────────────────────────────┤
│  Status: 2 brands configured • 0/19 accounts mapped • 0 SKUs                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## QBO Connection (NotConnectedScreen Pattern)

If QBO is not connected, **Plutus still loads Setup in “offline mode”** so users can continue configuration without being blocked.

- **Allowed (offline):** Brands + SKUs
- **Blocked until connected:** Account mapping + sub-account creation
- **Dashboards blocked:** Settlements, Audit Data, Bills, Reconciliation, Chart of Accounts (show NotConnectedScreen)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                              PLUTUS SETUP                                    │
│                                                                              │
│                         ┌─────────────────────┐                              │
│                         │                     │                              │
│                         │    [QBO Logo]       │                              │
│                         │                     │                              │
│                         └─────────────────────┘                              │
│                                                                              │
│                    Connect QuickBooks to continue                            │
│                                                                              │
│              Plutus needs access to your QuickBooks Online                   │
│              account to read accounts and post journal entries.              │
│                                                                              │
│                      [Connect to QuickBooks]                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Once connected, unlock the Accounts section (QBO account selectors + “Create Sub-Accounts”).

---

## Section 1: Brands

**Purpose:** Define brand names and their marketplaces for P&L tracking.

**Sidebar indicator:** Shows checkmark when at least 1 brand is configured.

```
┌────────────────────┬─────────────────────────────────────────────────────────┐
│                    │                                                         │
│  SETUP             │   BRANDS                                                │
│                    │   ─────────────────────────────────────────────────     │
│  ┌──────────────┐  │                                                         │
│  │ ● Brands     │  │   Add brands for separate P&L tracking. Plutus will    │
│  │   Accounts   │  │   create sub-accounts in QBO for each brand.           │
│  │   SKUs       │  │                                                         │
│  └──────────────┘  │   ┌─────────────────────────────────────────────────┐   │
│                    │   │ Brand Name       │ Marketplace     │ Currency │   │
│                    │   ├──────────────────┼─────────────────┼──────────┤   │
│                    │   │ US-Dust Sheets   │ Amazon.com      │ USD      │ ✕ │
│                    │   │ UK-Dust Sheets   │ Amazon.co.uk    │ GBP      │ ✕ │
│                    │   └─────────────────────────────────────────────────┘   │
│                    │                                                         │
│                    │   ┌─────────────────────────────────────────────────┐   │
│                    │   │ [Brand name...    ] [Amazon.com ▼] [+ Add]     │   │
│                    │   └─────────────────────────────────────────────────┘   │
│                    │                                                         │
└────────────────────┴─────────────────────────────────────────────────────────┘
```

**Marketplace Options:**
| Marketplace | Currency |
|-------------|----------|
| Amazon.com | USD |
| Amazon.co.uk | GBP |
| Amazon.ca | CAD |
| Amazon.de | EUR |
| Amazon.fr | EUR |
| Amazon.es | EUR |
| Amazon.it | EUR |

**Validation:**
- At least 1 brand required
- Brand names must be unique
- Brand names must be valid for QBO account names (no special characters)

**Data Captured:**
- `brands[]` - Array of { name, marketplace, currency }

---

## Section 2: Account Mapping

**Purpose:** Map QBO parent accounts so Plutus can create brand sub-accounts.

**Sidebar indicator:** Shows checkmark when all 19 accounts are mapped and sub-accounts created.

```
┌────────────────────┬─────────────────────────────────────────────────────────┐
│                    │                                                         │
│  SETUP             │   ACCOUNT MAPPING                                       │
│                    │   ─────────────────────────────────────────────────     │
│  ┌──────────────┐  │                                                         │
│  │   Brands ✓   │  │   Map your QBO accounts. Plutus creates brand          │
│  │ ● Accounts   │  │   sub-accounts under each parent you select.           │
│  │   SKUs       │  │                                                         │
│  └──────────────┘  │                                                         │
│                    │   INVENTORY ASSET                                       │
│                    │   ┌───────────────────────────────────────────────┐     │
│                    │   │ Manufacturing    │ [Select account...     ▼] │     │
│                    │   │ Freight          │ [Select account...     ▼] │     │
│                    │   │ Duty             │ [Select account...     ▼] │     │
│                    │   │ Mfg Accessories  │ [Select account...     ▼] │     │
│                    │   └───────────────────────────────────────────────┘     │
│                    │                                                         │
│                    │   COST OF GOODS SOLD                                    │
│                    │   ┌───────────────────────────────────────────────┐     │
│                    │   │ Manufacturing    │ [Select account...     ▼] │     │
│                    │   │ Freight          │ [Select account...     ▼] │     │
│                    │   │ Duty             │ [Select account...     ▼] │     │
│                    │   │ Mfg Accessories  │ [Select account...     ▼] │     │
│                    │   │ Shrinkage        │ [Select account...     ▼] │     │
│                    │   └───────────────────────────────────────────────┘     │
│                    │                                                         │
│                    │   WAREHOUSING                                            │
│                    │   ┌───────────────────────────────────────────────┐     │
│                    │   │ 3PL             │ [Select account...     ▼] │     │
│                    │   │ Amazon FC       │ [Select account...     ▼] │     │
│                    │   │ AWD             │ [Select account...     ▼] │     │
│                    │   └───────────────────────────────────────────────┘     │
│                    │                                                         │
│                    │   REVENUE & FEES (LMB)                                  │
│                    │   ┌───────────────────────────────────────────────┐     │
│                    │   │ Amazon Sales     │ [Select account...     ▼] │     │
│                    │   │ Amazon Refunds   │ [Select account...     ▼] │     │
│                    │   │ FBA Reimbursement│ [Select account...     ▼] │     │
│                    │   │ Seller Fees      │ [Select account...     ▼] │     │
│                    │   │ FBA Fees         │ [Select account...     ▼] │     │
│                    │   │ Storage Fees     │ [Select account...     ▼] │     │
│                    │   │ Advertising      │ [Select account...     ▼] │     │
│                    │   │ Promotions       │ [Select account...     ▼] │     │
│                    │   └───────────────────────────────────────────────┘     │
│                    │                                                         │
│                    │   ┌─────────────────────────────────────────────────┐   │
│                    │   │      [Create Sub-Accounts for 2 Brands]        │   │
│                    │   └─────────────────────────────────────────────────┘   │
│                    │                                                         │
└────────────────────┴─────────────────────────────────────────────────────────┘
```

### Account Categories

**Inventory Asset (4 accounts)**

| Key | Label | QBO Account Type | Detail Type |
|-----|-------|------------------|-------------|
| invManufacturing | Manufacturing | Other Current Asset | Inventory |
| invFreight | Freight | Other Current Asset | Inventory |
| invDuty | Duty | Other Current Asset | Inventory |
| invMfgAccessories | Mfg Accessories | Other Current Asset | Inventory |

**Cost of Goods Sold (5 accounts)**

| Key | Label | QBO Account Type | Detail Type |
|-----|-------|------------------|-------------|
| cogsManufacturing | Manufacturing | Cost of Goods Sold | Supplies & Materials - COGS |
| cogsFreight | Freight | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| cogsDuty | Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| cogsMfgAccessories | Mfg Accessories | Cost of Goods Sold | Supplies & Materials - COGS |
| cogsShrinkage | Shrinkage | Cost of Goods Sold | Other Costs of Services - COS |

**Warehousing (3 accounts)**

| Key | Label | QBO Account Type | Detail Type |
|-----|-------|------------------|-------------|
| warehousing3pl | Warehousing:3PL | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| warehousingAmazonFc | Warehousing:Amazon FC | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| warehousingAwd | Warehousing:AWD | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Revenue & Fees - LMB (8 accounts)**

| Key | Label | QBO Account Type | Detail Type |
|-----|-------|------------------|-------------|
| amazonSales | Amazon Sales | Income | Sales of Product Income |
| amazonRefunds | Amazon Refunds | Income | Discounts/Refunds Given |
| amazonFbaInventoryReimbursement | FBA Reimbursement | Other Income | Other Miscellaneous Income |
| amazonSellerFees | Seller Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| amazonFbaFees | FBA Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| amazonStorageFees | Storage Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| amazonAdvertisingCosts | Advertising | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| amazonPromotions | Promotions | Cost of Goods Sold | Other Costs of Services - COS |

### Sub-Account Naming Convention

Plutus creates QBO **sub-accounts** under each selected parent account.

- Sub-account **Name** follows: `{Label} - {BrandName}` (e.g., `Amazon Sales - US-Dust Sheets`)
- QBO **FullyQualifiedName** displays the path with colons (e.g., `Amazon Sales:Amazon Sales - US-Dust Sheets`)

### Sub-Account Creation Summary

For 2 brands, the API creates:
- 8 Inventory Asset sub-accounts (4 components × 2 brands)
- 10 COGS sub-accounts (5 components × 2 brands)
- 6 Warehousing leaf accounts (3 buckets × 2 brands)
- 16 Revenue/Fee sub-accounts (8 categories × 2 brands)
- **Total: 40 sub-accounts**

**Validation:**
- All 20 parent accounts must be selected
- Brands must be configured first (navigate to Brands section if empty)

**API Endpoint:** `POST /api/qbo/accounts/create-plutus-qbo-lmb-plan`

```typescript
// Request
{
  brandNames: string[],
  accountMappings: {
    invManufacturing: string,    // QBO account ID
    invFreight: string,
    invDuty: string,
    invMfgAccessories: string,
    cogsManufacturing: string,
    cogsFreight: string,
    cogsDuty: string,
    cogsMfgAccessories: string,
    cogsShrinkage: string,
    warehousing3pl: string,
    warehousingAmazonFc: string,
    warehousingAwd: string,
    amazonSales: string,
    amazonRefunds: string,
    amazonFbaInventoryReimbursement: string,
    amazonSellerFees: string,
    amazonFbaFees: string,
    amazonStorageFees: string,
    amazonAdvertisingCosts: string,
    amazonPromotions: string,
  }
}

// Response
{
  success: true,
  created: 40,
  accounts: [
    { name: "Manufacturing - US-Dust Sheets", qboId: "123" },
    // ...
  ]
}
```

---

## Section 3: SKUs

**Purpose:** Map product SKUs to brands for COGS calculation.

**Sidebar indicator:** Shows checkmark when at least 1 SKU is configured.

```
┌────────────────────┬─────────────────────────────────────────────────────────┐
│                    │                                                         │
│  SETUP             │   SKUs                                                  │
│                    │   ─────────────────────────────────────────────────     │
│  ┌──────────────┐  │                                                         │
│  │   Brands ✓   │  │   Add your product SKUs and assign them to brands.     │
│  │   Accounts ✓ │  │   Costs come from bills - no need to enter them here.  │
│  │ ● SKUs       │  │                                                         │
│  └──────────────┘  │   [+ Add SKU]  [Import CSV]                             │
│                    │                                                         │
│                    │   ┌─────────────────────────────────────────────────┐   │
│                    │   │ SKU          │ Product Name          │ Brand   │   │
│                    │   ├──────────────┼───────────────────────┼─────────┤   │
│                    │   │ CS-007       │ 6 Pack Drop Cloth     │ US-Dust │ ✕ │
│                    │   │ CS-010       │ 3 Pack Drop Cloth     │ US-Dust │ ✕ │
│                    │   │ CS-12LD-7M   │ 12 Pack Drop Cloth    │ US-Dust │ ✕ │
│                    │   │ CS-007-UK    │ 6 Pack Drop Cloth     │ UK-Dust │ ✕ │
│                    │   │ CS-010-UK    │ 3 Pack Drop Cloth     │ UK-Dust │ ✕ │
│                    │   └─────────────────────────────────────────────────┘   │
│                    │                                                         │
│                    │   Total: 5 SKUs configured                              │
│                    │                                                         │
└────────────────────┴─────────────────────────────────────────────────────────┘
```

**Add SKU Modal:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ADD SKU                                                    [X] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SKU *              [CS-007                    ]                │
│  Product Name       [6 Pack Drop Cloth 12x9ft  ]                │
│  Brand *            [US-Dust Sheets        ▼]                   │
│  ASIN (optional)    [B08XYZ123             ]                    │
│                                                                 │
│  [Cancel]                                      [Save]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**CSV Import Format:**

```csv
sku,product_name,brand,asin
CS-007,6 Pack Drop Cloth 12x9ft,US-Dust Sheets,B08XYZ123
CS-010,3 Pack Drop Cloth 12x9ft,US-Dust Sheets,B08XYZ456
```

**Validation:**
- SKU must be unique
- Brand must exist (from Brands section)

**Data Captured:**
- `skus[]` - Array of { sku, productName, brandId, asin }

---

## Status Bar

The status bar at the bottom provides a quick summary of setup progress:

```
Status: 2 brands configured • 19/19 accounts mapped • 12 SKUs
```

States:
- `0 brands configured` → Red indicator
- `N brands configured` → Green indicator
- `0/19 accounts mapped` → Red indicator
- `N/19 accounts mapped` → Yellow indicator (partial)
- `19/19 accounts mapped` → Green indicator
- `0 SKUs` → Yellow indicator (optional but recommended)
- `N SKUs` → Green indicator

---

## Data Persistence

Setup data is persisted in Postgres via Prisma (`Brand`, `Sku`, `SetupConfig`) and fetched via `/api/setup`.

localStorage is used as a client-side backup for UI state with key `plutus-setup-v5`:

```typescript
type SetupState = {
  section: 'brands' | 'accounts' | 'skus';
  brands: Array<{ name: string; marketplace: string; currency: string }>;
  accountMappings: Record<string, string>;  // key → QBO account ID
  accountsCreated: boolean;
  skus: Array<{ sku: string; productName: string; brand: string; asin?: string }>;
};
```

---

## Implementation Notes

### Route Structure

```
/setup                  → Single route with sidebar sections
```

### Component Structure

```
SetupPage
├── SetupSidebar
│   ├── SidebarItem (Brands)
│   ├── SidebarItem (Accounts)
│   └── SidebarItem (SKUs)
├── SetupContent
│   ├── BrandsSection
│   ├── AccountsSection
│   └── SkusSection
└── StatusBar
```

### Files to Modify

- `apps/plutus/app/setup/page.tsx` - Main setup page with sidebar layout

---

## Removed from Setup UI

The following items from the original 9-step wizard are NOT part of the setup UI. They are documented in the implementation plan or shown as help content elsewhere:

| Original Step | New Location |
|---------------|--------------|
| Step 1: Connect QuickBooks | NotConnectedScreen pattern (automatic) |
| Step 2: Verify LMB Setup | Mentioned in prerequisites / help docs |
| Step 6: LMB Product Groups | Help documentation |
| Step 7: Bill Entry Guidelines | Bills page (`/bills`) |
| Step 8: Historical Catch-Up | Future feature / separate workflow |
| Step 9: Review & Complete | Status bar shows completion state |
