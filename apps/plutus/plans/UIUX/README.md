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
