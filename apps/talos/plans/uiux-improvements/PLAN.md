# Talos UI/UX Improvements Plan

## Overview

This document tracks UI/UX improvements for the Talos application.

---

## Todo List

### Dark Mode Issues

- [x] **Fix text not white in dark mode** - Comprehensive fix across components

### Content Cleanup

- [x] **Remove "Pallet conversions" text from warehouse rates page**

---

## Completed Fixes

### Batch 2 - Comprehensive Dark Mode Scan

1. **amazon-import-button.tsx** - Full dark mode support for modal
   - Header, workflow steps, filter buttons
   - Table headers, rows, cells
   - Status badges, results section, footer

2. **empty-state.tsx** - Text colors using semantic classes

3. **import-button.tsx** - Modal dark mode support
   - Instructions, template download, file input, results

4. **export-button.tsx** - Button and dropdown dark mode

5. **form-field.tsx** - Labels, inputs, hints dark mode

6. **fulfillment-orders/[id]/page.tsx** - Detail page dark mode
   - Status badges, document upload section, line items table, freight section

7. **fulfillment-orders-panel.tsx** - Status badge classes

### Batch 1 - Initial Fixes

1. **amazon-shipment-picker.tsx**
   - Import confirmation banner, shipment list, hover states, warehouse select

2. **freight-section.tsx** - Hover dark variant

3. **fulfillment-orders/new/page.tsx** - Select elements, dividers

4. **warehouse-rates-panel.tsx** - Removed pallet conversions text

---

## Dark Mode Pattern Reference

### Text Colors
- `text-slate-900` -> `text-foreground`
- `text-slate-700` -> `text-foreground`
- `text-slate-600` -> `text-muted-foreground`
- `text-slate-500` -> `text-muted-foreground`

### Background Colors
- `bg-slate-50` -> `bg-slate-50 dark:bg-slate-900`
- `bg-white` -> `bg-white dark:bg-slate-800`
- `hover:bg-slate-50` -> `hover:bg-slate-50 dark:hover:bg-slate-800`
- `hover:bg-slate-100` -> `hover:bg-slate-100 dark:hover:bg-slate-700`

### Status/Badge Colors
- `bg-emerald-50 text-emerald-700` -> `bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300`
- `bg-rose-50 text-rose-700` -> `bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300`
- `bg-slate-100 text-slate-700` -> `bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300`

---

## Known Remaining Files (Lower Priority)

Some files still have hardcoded colors but are lower impact:
- `landing-page.tsx` - Public landing page (light mode only is acceptable)
- `no-access/page.tsx`, `unauthorized/page.tsx`, `500.tsx` - Error pages
- Various config pages with labels

---

## Related Files

- Theme configuration: `apps/talos/tailwind.config.ts`
- Global styles: `apps/talos/src/app/globals.css`
