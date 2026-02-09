# Plutus UI/UX - LMB Reference

This folder contains UI/UX documentation for replicating Link My Books (LMB) patterns while adapting to the Targon design system.

## Implementation Checklist

### Components
- [x] SplitButton - LMB-style action button with dropdown
- [x] FilterBar - Styled filter row with dropdowns
- [x] SelectionCard - Card selection with badge support
- [ ] TreeTable - Expandable rows with tree lines (deferred)

### Styling
- [x] Font: Outfit
- [x] Filter labels: Teal accent color (`text-brand-teal-600`)
- [x] PageHeader: Accent variant for orange titles
- [x] SplitButton navigation on click

### Dark Mode
- [x] ThemeToggle button in header
- [x] Settlements page dark mode support
- [x] Setup page dark mode support
- [x] Bills page dark mode support
- [x] Chart of Accounts dark mode support
- [x] Filter bar dark mode
- [x] SplitButton dark mode

### Future Enhancements
- [ ] Tree table with expand/collapse for account mapping
- [ ] Step wizard with connecting lines
- [ ] Country flags for marketplace indicators

---

## Color Mapping (LMB to Targon)

| LMB Color | LMB Usage | Targon Equivalent |
|-----------|-----------|-------------------|
| #E86C3A (coral) | Page titles, links | `text-accent-500` |
| #38B2AC (teal) | CTAs, badges | `bg-brand-teal-500` |
| #2D3748 (dark) | Body text | `text-slate-900 dark:text-white` |
| #718096 (muted) | Secondary text | `text-slate-500 dark:text-slate-400` |
| #E2E8F0 (border) | Borders | `border-slate-200 dark:border-slate-700` |

## Components Built

### 1. SplitButton (`ui/split-button.tsx`)
LMB-style split action button with primary action and dropdown.

```tsx
<SplitButton
  onClick={() => handleAction()}
  dropdownItems={[
    { label: 'View', onClick: () => {} },
    { label: 'Delete', onClick: () => {}, variant: 'destructive' },
  ]}
>
  ACTION
</SplitButton>
```

### 2. FilterBar (`ui/filter-bar.tsx`)
LMB-style filter row with dropdowns and filter button.

```tsx
<FilterBar
  filters={[
    { key: 'period', label: 'Period', value, options, onChange },
    { key: 'status', label: 'Status', value, options, onChange },
  ]}
  onFilter={() => {}}
  onClear={() => {}}
/>
```

### 3. SelectionCard (`ui/selection-card.tsx`)
Card selection with optional "Most Popular" badge.

```tsx
<SelectionCard
  selected={isSelected}
  badge="Most Popular"
  icon={<ChartIcon />}
  title="Default Chart Accounts"
  description="We'll add a suitable chart..."
  onClick={() => setSelected(true)}
/>
```

### 4. ThemeToggle (`components/theme-toggle.tsx`)
Dark/light mode toggle button.

```tsx
<ThemeToggle />
```

## Page Title Pattern

LMB uses coral/orange for page titles. In Targon, use:
```tsx
<h1 className="text-2xl font-semibold text-accent-500">Settlements</h1>
```

Or use the PageHeader component with `variant="accent"`.

## Dark Mode Guidelines

All components must support dark mode. Use these patterns:

```tsx
// Text
className="text-slate-900 dark:text-white"
className="text-slate-500 dark:text-slate-400"

// Backgrounds
className="bg-white dark:bg-slate-800"
className="bg-slate-50 dark:bg-slate-900"

// Borders
className="border-slate-200 dark:border-slate-700"

// Interactive states
className="hover:bg-slate-50 dark:hover:bg-slate-700"
```

## Navigation Structure

```
Settlements          (top-level link)
Transactions         (top-level link)
Benchmarking         (top-level link)
Accounts & Taxes ▾   (dropdown)
  ├── Setup Wizard
  └── Chart of Accounts
Cost Management ▾    (dropdown)
  ├── Audit Data      ← NEW: bulk audit data upload
  └── Bills
  └── Reconciliation  ← NEW: Amazon vs LMB compare
Settings             (top-level link)
```

## Audit Data Page (`/audit-data`)

**Purpose:** Single place to upload LMB Audit Data CSVs. One CSV covers multiple settlements — Plutus splits by Invoice and matches to known settlements automatically.

**Location in nav:** Cost Management → Audit Data

### Upload Flow
1. User drags/clicks to upload a CSV (or ZIP containing a CSV)
2. Plutus parses and shows a summary table:
   - Invoice ID, matched settlement doc number, date range, row count, status
   - Statuses: "Matched" (linked to a known settlement), "Unmatched" (no QBO settlement found)
3. User confirms → audit data is stored and linked to settlements
4. Re-uploading overlapping data is safe (idempotent)

### Page Layout
- **Header:** "Audit Data" (accent variant)
- **Upload zone:** Drag-and-drop area with file picker fallback
- **Upload history table:**
  - Columns: Filename, Uploaded, Settlements, Rows, Status
  - Expandable rows showing per-Invoice breakdown
- **Empty state:** Instructions pointing user to download audit data from LMB

### Design Notes
- Upload zone: dashed border, teal accent on hover/drag, file icon
- Success state: green checkmark with matched settlement count
- Warning state: amber for unmatched invoices (settlement not yet posted by LMB)
- The Settlements page should show an "Audit Data" indicator column (including ambiguous/none states) so the user knows which settlements have data ready for processing

## LMB Patterns Reference

### Settlements List
- Filter bar with dropdowns (Period, Total, Status)
- Split action button per row
- Status badges ("Posted" in teal pill)
- Country flags next to marketplace
- Audit data availability indicator per row (including ambiguous/none states)

### Account Taxes
- Tree table with expand/collapse
- Orange connecting lines for tree structure
- Column labels above dropdowns (teal, uppercase)
- Grouped by category

### Setup Wizard
- Left sidebar with step indicator
- Radio buttons with dashed connecting lines
- Card selection with badges
- Progress status bar at bottom
