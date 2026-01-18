import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  FileSpreadsheet,
  LineChart,
  Package,
  Target,
  TrendingUp,
  Wallet2,
} from 'lucide-react';

export type SheetSlug =
  | '1-strategies'
  | '2-product-setup'
  | '3-ops-planning'
  | '4-sales-planning'
  | '5-fin-planning-pl'
  | '6-po-profitability'
  | '7-fin-planning-cash-flow';

export type LegacySheetSlug =
  | '0-strategies'
  | '1-product-setup'
  | '2-ops-planning'
  | '3-sales-planning'
  | '4-fin-planning-pl'
  | '5-fin-planning-cash-flow'
  | '6-fin-planning-cash-flow'
  | '6-po-profitability'
  | '7-po-profitability';

export interface SheetConfig {
  slug: SheetSlug;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const SHEETS: SheetConfig[] = [
  {
    slug: '1-strategies',
    label: 'Strategies',
    shortLabel: 'Strat',
    description: '',
    icon: Target,
  },
  {
    slug: '2-product-setup',
    label: 'Product Setup',
    shortLabel: 'Setup',
    description: '',
    icon: Package,
  },
  {
    slug: '3-ops-planning',
    label: 'Ops Planning',
    shortLabel: 'Ops',
    description: '',
    icon: ClipboardList,
  },
  {
    slug: '4-sales-planning',
    label: 'Sales Planning',
    shortLabel: 'Sales',
    description: '',
    icon: FileSpreadsheet,
  },
  {
    slug: '5-fin-planning-pl',
    label: 'P&L',
    shortLabel: 'P&L',
    description: '',
    icon: LineChart,
  },
  {
    slug: '6-po-profitability',
    label: 'PO P&L',
    shortLabel: 'PO P&L',
    description: '',
    icon: TrendingUp,
  },
  {
    slug: '7-fin-planning-cash-flow',
    label: 'Cash Flow',
    shortLabel: 'Cash',
    description: '',
    icon: Wallet2,
  },
];

export const LEGACY_SHEET_SLUG_REDIRECTS: Readonly<Record<LegacySheetSlug, SheetSlug>> = {
  '0-strategies': '1-strategies',
  '1-product-setup': '2-product-setup',
  '2-ops-planning': '3-ops-planning',
  '3-sales-planning': '4-sales-planning',
  '4-fin-planning-pl': '5-fin-planning-pl',
  '5-fin-planning-cash-flow': '7-fin-planning-cash-flow',
  '6-fin-planning-cash-flow': '7-fin-planning-cash-flow',
  '6-po-profitability': '6-po-profitability',
  '7-po-profitability': '6-po-profitability',
};

export function getCanonicalSheetSlug(slug: string): SheetSlug | undefined {
  const redirected =
    (LEGACY_SHEET_SLUG_REDIRECTS as Record<string, SheetSlug | undefined>)[slug] ?? slug;
  return SHEETS.some((sheet) => sheet.slug === redirected) ? (redirected as SheetSlug) : undefined;
}

export function getSheetConfig(slug: string): SheetConfig | undefined {
  const canonical = getCanonicalSheetSlug(slug);
  if (!canonical) return undefined;
  return SHEETS.find((sheet) => sheet.slug === canonical);
}
