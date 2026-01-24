# Talos UI/UX Improvements Plan

## Overview

This document tracks UI/UX improvements for the Talos application.

---

## Todo List

### Dark Mode Issues

- [x] **Fix text not white in dark mode** - Some text elements are not properly styled for dark mode and appear in incorrect colors (should be white/light)

### Content Cleanup

- [x] **Remove "Pallet conversions" text from warehouse rates page** - Remove the informational box about pallet conversions from `/config/warehouses/[id]/rates`

---

## Completed Fixes

### `/operations/fulfillment-orders/new` Page

#### Fixed:

1. **amazon-shipment-picker.tsx**
   - Added dark mode variants to import confirmation banner (`dark:bg-emerald-900/30`, `dark:text-emerald-200/300`)
   - Added dark mode to shipment list (`dark:bg-slate-900`)
   - Fixed shipment items with dark variants (`dark:text-slate-100`, `dark:text-slate-400`)
   - Added hover dark variant (`dark:hover:bg-slate-700`)
   - Added `text-foreground` to warehouse select for proper text color

2. **freight-section.tsx**
   - Added hover dark variant (`dark:hover:bg-slate-700`)

3. **page.tsx**
   - Added `text-foreground` to all select elements for proper dark mode text color
   - Added `divide-border` for proper divider color in dark mode

---

### `/config/warehouses/[id]/rates` Page

#### Fixed:

1. **warehouse-rates-panel.tsx**
   - Removed the "Pallet conversions" info box

---

## Implementation Notes

### Dark Mode Fix Pattern

When fixing dark mode text issues:

1. Replace hardcoded colors with dark variants:
   - `text-slate-900` -> `text-slate-900 dark:text-slate-100`
   - `text-slate-500` -> `text-slate-500 dark:text-slate-400`
   - `bg-slate-50` -> `bg-slate-50 dark:bg-slate-900`
   - `bg-emerald-50` -> `bg-emerald-50 dark:bg-emerald-900/30`
   - `text-emerald-800` -> `text-emerald-800 dark:text-emerald-200`
   - `hover:bg-slate-50` -> `hover:bg-slate-50 dark:hover:bg-slate-700`

2. Use semantic color classes:
   - `text-foreground` for text that should adapt to theme
   - `divide-border` for dividers that should adapt to theme

---

## Related Files

- Theme configuration: `apps/talos/tailwind.config.ts`
- Global styles: `apps/talos/src/app/globals.css`
- Warehouse rates panel: `apps/talos/src/app/config/warehouses/warehouse-rates-panel.tsx`

---

## Progress Tracking

| Issue | Status | Notes |
|-------|--------|-------|
| Dark mode text - fulfillment-orders/new | Completed | Fixed select elements, dividers, and component colors |
| Remove pallet conversions text - warehouse rates | Completed | Removed info box |
