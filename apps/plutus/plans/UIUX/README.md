# Plutus UI/UX - LMB Reference

This folder contains UI/UX documentation for replicating Link My Books (LMB) patterns while adapting to the Targon design system.

## Color Mapping (LMB to Targon)

| LMB Color | LMB Usage | Targon Equivalent |
|-----------|-----------|-------------------|
| #E86C3A (coral) | Page titles, links | `text-accent-500` |
| #38B2AC (teal) | CTAs, badges | `bg-brand-teal-500` |
| #2D3748 (dark) | Body text | `text-slate-900` |
| #718096 (muted) | Secondary text | `text-slate-500` |
| #E2E8F0 (border) | Borders | `border-slate-200` |

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

## Page Title Pattern

LMB uses coral/orange for page titles. In Targon, use:
```tsx
<h1 className="text-2xl font-semibold text-accent-500">Settlements</h1>
```

Or use the PageHeader component with `variant="accent"`.

## LMB Patterns Reference

### Settlements List
- Filter bar with dropdowns (Period, Total, Status)
- Split action button per row
- Status badges ("Posted" in teal pill)
- Country flags next to marketplace

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
