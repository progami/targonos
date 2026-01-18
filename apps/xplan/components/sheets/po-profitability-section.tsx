'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { SheetViewToggle, type SheetViewMode } from '@/components/sheet-view-toggle';
import {
  SHEET_TOOLBAR_GROUP,
  SHEET_TOOLBAR_LABEL,
  SHEET_TOOLBAR_SELECT,
} from '@/components/sheet-toolbar';
import { usePersistentState } from '@/hooks/usePersistentState';

export type POStatus = 'DRAFT' | 'ISSUED' | 'MANUFACTURING' | 'OCEAN' | 'WAREHOUSE' | 'SHIPPED';

export type PoPnlMode = 'PROJECTED' | 'REAL';

export type PoPnlValueDisplay = 'ABSOLUTE' | 'PER_UNIT';

export interface PoPnlSummary {
  units: number;
  revenue: number;
  cogs: number;
  amazonFees: number;
  ppcSpend: number;
  fixedCosts: number;
  grossProfit: number;
  netProfit: number;
}

export interface POProfitabilityDataset {
  data: POProfitabilityData[];
  totals: PoPnlSummary;
  unattributed: PoPnlSummary;
}

export interface POProfitabilityData {
  id: string;
  orderCode: string;
  batchCode: string | null;
  productId: string;
  productName: string;
  status: POStatus;
  units: number;
  revenue: number;
  manufacturingCost: number;
  freightCost: number;
  tariffCost: number;
  cogs: number;
  cogsAdjustment: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  amazonFees: number;
  amazonFeesAdjustment: number;
  ppcSpend: number;
  fixedCosts: number;
  grossProfit: number;
  grossMarginPercent: number;
  netProfit: number;
  netMarginPercent: number;
  roi: number;
  productionStart: Date | null;
  availableDate: Date | null;
  totalLeadDays: number | null;
}

interface POProfitabilitySectionProps {
  datasets: { projected: POProfitabilityDataset; real: POProfitabilityDataset };
  productOptions?: Array<{ id: string; name: string }>;
  sheetSlug?: string;
  viewMode?: SheetViewMode;
  title?: string;
  description?: string;
  showChart?: boolean;
  showTable?: boolean;
}

type StatusFilter = 'ALL' | POStatus;
type MetricKey = 'grossMarginPercent' | 'netMarginPercent' | 'roi';

const metricConfig: Record<MetricKey, { label: string; color: string; gradientId: string }> = {
  grossMarginPercent: {
    label: 'Gross Margin %',
    color: 'hsl(var(--chart-1))',
    gradientId: 'gradientGrossMargin',
  },
  netMarginPercent: {
    label: 'Net Margin %',
    color: 'hsl(var(--chart-2))',
    gradientId: 'gradientNetMargin',
  },
  roi: { label: 'ROI %', color: 'hsl(var(--chart-3))', gradientId: 'gradientROI' },
};

const statusLabels: Record<POStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  MANUFACTURING: 'Manufacturing',
  OCEAN: 'Ocean',
  WAREHOUSE: 'Warehouse',
  SHIPPED: 'Shipped',
};

const modeLabels: Record<PoPnlMode, string> = {
  PROJECTED: 'Projected',
  REAL: 'Real',
};

const modeOptions: PoPnlMode[] = ['PROJECTED', 'REAL'];

const statusFilters: StatusFilter[] = [
  'ALL',
  'DRAFT',
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'SHIPPED',
];

type POProfitabilityFiltersContextValue = {
  mode: PoPnlMode;
  setMode: (value: PoPnlMode) => void;
  valueDisplay: PoPnlValueDisplay;
  setValueDisplay: (value: PoPnlValueDisplay) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  focusSkuId: string;
  setFocusSkuId: (value: string) => void;
  showGpAfterPpc: boolean;
  setShowGpAfterPpc: (value: boolean) => void;
};

const POProfitabilityFiltersContext = createContext<POProfitabilityFiltersContextValue | null>(
  null,
);

export function POProfitabilityFiltersProvider({
  children,
  strategyId,
}: {
  children: ReactNode;
  strategyId: string;
}) {
  const [mode, setMode] = usePersistentState<PoPnlMode>(
    `xplan:po-pnl:${strategyId}:mode`,
    'PROJECTED',
  );
  const [valueDisplay, setValueDisplay] = usePersistentState<PoPnlValueDisplay>(
    `xplan:po-pnl:${strategyId}:value-display`,
    'ABSOLUTE',
  );
  const [statusFilter, setStatusFilter] = usePersistentState<StatusFilter>(
    `xplan:po-profitability:${strategyId}:status-filter`,
    'ALL',
  );
  const [focusSkuId, setFocusSkuId] = usePersistentState<string>(
    `xplan:po-profitability:${strategyId}:focus-sku`,
    'ALL',
  );
  const [showGpAfterPpc, setShowGpAfterPpc] = usePersistentState<boolean>(
    `xplan:po-profitability:${strategyId}:show-gp-after-ppc`,
    false,
  );

  const value = useMemo(
    () => ({
      mode,
      setMode,
      valueDisplay,
      setValueDisplay,
      statusFilter,
      setStatusFilter,
      focusSkuId,
      setFocusSkuId,
      showGpAfterPpc,
      setShowGpAfterPpc,
    }),
    [
      focusSkuId,
      mode,
      setFocusSkuId,
      setMode,
      setStatusFilter,
      setValueDisplay,
      showGpAfterPpc,
      setShowGpAfterPpc,
      statusFilter,
      valueDisplay,
    ],
  );

  return (
    <POProfitabilityFiltersContext.Provider value={value}>
      {children}
    </POProfitabilityFiltersContext.Provider>
  );
}

export function POProfitabilityHeaderControls({
  productOptions,
}: {
  productOptions: Array<{ id: string; name: string }>;
}) {
  const context = useContext(POProfitabilityFiltersContext);
  const focusSkuId = context?.focusSkuId ?? 'ALL';

  useEffect(() => {
    if (!context) return;
    if (focusSkuId === 'ALL') return;
    if (!productOptions.some((option) => option.id === focusSkuId)) {
      context.setFocusSkuId('ALL');
    }
  }, [context, focusSkuId, productOptions]);

  if (!context) return null;

  const { mode, setMode, statusFilter, setStatusFilter, setFocusSkuId, showGpAfterPpc, setShowGpAfterPpc } = context;

  return (
    <>
      <div className={SHEET_TOOLBAR_GROUP}>
        <span className={SHEET_TOOLBAR_LABEL}>Mode</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as PoPnlMode)}
          className={SHEET_TOOLBAR_SELECT}
          aria-label="Switch PO P&L mode"
        >
          {modeOptions.map((value) => (
            <option key={value} value={value}>
              {modeLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className={SHEET_TOOLBAR_GROUP}>
        <span className={SHEET_TOOLBAR_LABEL}>Status</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className={SHEET_TOOLBAR_SELECT}
          aria-label="Filter by purchase order status"
        >
          {statusFilters.map((status) => (
            <option key={status} value={status}>
              {status === 'ALL' ? 'All' : statusLabels[status]}
            </option>
          ))}
        </select>
      </div>

      {productOptions.length > 0 ? (
        <div className={SHEET_TOOLBAR_GROUP}>
          <span className={SHEET_TOOLBAR_LABEL}>SKU</span>
          <select
            value={focusSkuId}
            onChange={(event) => setFocusSkuId(event.target.value)}
            className={`${SHEET_TOOLBAR_SELECT} max-w-[7rem]`}
            aria-label="Focus on a single SKU"
          >
            <option value="ALL">All</option>
            {productOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

export function POProfitabilitySection({
  datasets,
  productOptions = [],
  sheetSlug,
  viewMode,
  title = 'PO P&L',
  description = 'FIFO-based PO-level P&L (Projected vs Real)',
  showChart = true,
  showTable = true,
}: POProfitabilitySectionProps) {
  const filters = useContext(POProfitabilityFiltersContext);
  const mode = filters?.mode ?? 'PROJECTED';
  const statusFilter = filters?.statusFilter ?? 'ALL';
  const skuFilter = filters?.focusSkuId ?? 'ALL';
  const valueDisplay = filters?.valueDisplay ?? 'ABSOLUTE';
  const showGpAfterPpc = filters?.showGpAfterPpc ?? false;
  const dataset = mode === 'REAL' ? datasets.real : datasets.projected;
  const data = dataset.data;
  const [enabledMetrics, setEnabledMetrics] = useState<MetricKey[]>([
    'grossMarginPercent',
    'netMarginPercent',
    'roi',
  ]);

  // When "All SKUs" selected, aggregate to per-PO view
  // When specific SKU selected, show per-batch view filtered to that SKU
  const filteredData = useMemo(() => {
    let result = data;

    // Apply status filter first
    if (statusFilter !== 'ALL') {
      result = result.filter((row) => row.status === statusFilter);
    }

    // If specific SKU selected, filter to that SKU (per-batch view)
    if (skuFilter !== 'ALL') {
      result = result.filter((row) => row.productId === skuFilter);
      return [...result].sort((a, b) => {
        const dateA = a.availableDate ? new Date(a.availableDate).getTime() : 0;
        const dateB = b.availableDate ? new Date(b.availableDate).getTime() : 0;
        return dateA - dateB;
      });
    }

    // Aggregate to per-PO view when "All SKUs" selected
    const poMap = new Map<string, POProfitabilityData>();
    result.forEach((row) => {
      const existing = poMap.get(row.orderCode);
      if (existing) {
        // Aggregate values
        existing.units += row.units;
        existing.revenue += row.revenue;
        existing.manufacturingCost += row.manufacturingCost;
        existing.freightCost += row.freightCost;
        existing.tariffCost += row.tariffCost;
        existing.cogs += row.cogs;
        existing.referralFees += row.referralFees;
        existing.fbaFees += row.fbaFees;
        existing.storageFees += row.storageFees;
        existing.amazonFees += row.amazonFees;
        existing.ppcSpend += row.ppcSpend;
        existing.fixedCosts += row.fixedCosts;

        existing.cogsAdjustment =
          existing.cogs - existing.manufacturingCost - existing.freightCost - existing.tariffCost;
        existing.amazonFeesAdjustment =
          existing.amazonFees - existing.referralFees - existing.fbaFees - existing.storageFees;
        existing.grossProfit = existing.revenue - existing.cogs - existing.amazonFees;
        existing.netProfit = existing.grossProfit - existing.ppcSpend - existing.fixedCosts;

        existing.grossMarginPercent =
          existing.revenue > 0 ? (existing.grossProfit / existing.revenue) * 100 : 0;
        existing.netMarginPercent =
          existing.revenue > 0 ? (existing.netProfit / existing.revenue) * 100 : 0;
        existing.roi = existing.cogs > 0 ? (existing.netProfit / existing.cogs) * 100 : 0;
        // Combine product names
        if (!existing.productName.includes(row.productName)) {
          existing.productName = existing.productName + ', ' + row.productName;
        }
      } else {
        poMap.set(row.orderCode, { ...row });
      }
    });

    return Array.from(poMap.values()).sort((a, b) => {
      const dateA = a.availableDate ? new Date(a.availableDate).getTime() : 0;
      const dateB = b.availableDate ? new Date(b.availableDate).getTime() : 0;
      return dateA - dateB;
    });
  }, [data, statusFilter, skuFilter]);

  // Use filteredData directly for the vertical table (sorted by arrival date)
  const tableSortedData = filteredData;

  // Transform data for Recharts
  // filteredData is already aggregated by PO when "All SKUs" selected
  const chartData = useMemo(() => {
    return filteredData.map((row) => ({
      name:
        skuFilter !== 'ALL'
          ? `${row.orderCode}${row.batchCode ? ` (${row.batchCode})` : ''}`
          : row.orderCode,
      grossMarginPercent: row.grossMarginPercent,
      netMarginPercent: row.netMarginPercent,
      roi: row.roi,
    }));
  }, [filteredData, skuFilter]);

  const toggleMetric = (key: MetricKey) => {
    setEnabledMetrics((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: valueDisplay === 'PER_UNIT' ? 2 : 0,
    }).format(value);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatMoney = (value: number, units: number) => {
    if (valueDisplay === 'PER_UNIT') {
      if (!units) return formatCurrency(0);
      return formatCurrency(value / units);
    }
    return formatCurrency(value);
  };
  const showUnattributed =
    Math.abs(dataset.unattributed.revenue) > 0.01 ||
    Math.abs(dataset.unattributed.cogs) > 0.01 ||
    Math.abs(dataset.unattributed.netProfit) > 0.01 ||
    Math.abs(dataset.unattributed.fixedCosts) > 0.01;

  // Summary stats
  const summary = useMemo(() => {
    if (filteredData.length === 0)
      return {
        totalUnits: 0,
        totalRevenue: 0,
        totalGrossProfit: 0,
        totalPpc: 0,
        totalProfit: 0,
        totalCogs: 0,
        netMargin: 0,
        roi: 0,
      };
    const totalUnits = filteredData.reduce((sum, row) => sum + row.units, 0);
    const totalRevenue = filteredData.reduce((sum, row) => sum + row.revenue, 0);
    const totalGrossProfit = filteredData.reduce((sum, row) => sum + row.grossProfit, 0);
    const totalPpc = filteredData.reduce((sum, row) => sum + row.ppcSpend, 0);
    const totalProfit = filteredData.reduce((sum, row) => sum + row.netProfit, 0);
    const totalCogs = filteredData.reduce((sum, row) => sum + row.cogs, 0);
    const netMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const roi = totalCogs > 0 ? (totalProfit / totalCogs) * 100 : 0;
    return { totalUnits, totalRevenue, totalGrossProfit, totalPpc, totalProfit, totalCogs, netMargin, roi };
  }, [filteredData]);

  if (data.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm dark:border-white/10">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No purchase orders available for analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show chart/table based on props (page.tsx handles view mode separation)
  const shouldShowChart = showChart;
  const shouldShowTable = showTable;

  return (
    <div className="space-y-4">
      {shouldShowChart ? (
        <Card className="rounded-xl shadow-sm dark:border-white/10 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Margin trends</CardTitle>
            <CardDescription>Performance across purchase orders by arrival date</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  {/* Gradient definitions */}
                  <defs>
                    <linearGradient id="gradientGrossMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradientNetMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradientROI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                    </linearGradient>
                    {/* Glow filters for dark mode */}
                    <filter id="glow1" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-700/50"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-slate-500 dark:text-slate-400"
                    interval="preserveStartEnd"
                    dy={10}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    className="text-slate-500 dark:text-slate-400"
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    width={50}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      return (
                        <div className="rounded-xl border border-slate-200/50 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95">
                          <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {label}
                          </p>
                          <div className="space-y-1.5">
                            {payload.map((entry) => (
                              <div
                                key={entry.dataKey}
                                className="flex items-center justify-between gap-6"
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-xs text-slate-600 dark:text-slate-400">
                                    {metricConfig[entry.dataKey as MetricKey]?.label}
                                  </span>
                                </div>
                                <span
                                  className="text-xs font-semibold tabular-nums"
                                  style={{ color: entry.color }}
                                >
                                  {formatPercent(entry.value as number)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                    cursor={{
                      stroke: 'currentColor',
                      strokeWidth: 1,
                      strokeDasharray: '4 4',
                      className: 'text-slate-300 dark:text-slate-600',
                    }}
                  />
                  {enabledMetrics.includes('grossMarginPercent') && (
                    <Area
                      type="monotone"
                      dataKey="grossMarginPercent"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2.5}
                      fill="url(#gradientGrossMargin)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: 'hsl(var(--chart-1))',
                        fill: 'white',
                        className: 'dark:fill-slate-900',
                      }}
                    />
                  )}
                  {enabledMetrics.includes('netMarginPercent') && (
                    <Area
                      type="monotone"
                      dataKey="netMarginPercent"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2.5}
                      fill="url(#gradientNetMargin)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: 'hsl(var(--chart-2))',
                        fill: 'white',
                        className: 'dark:fill-slate-900',
                      }}
                    />
                  )}
                  {enabledMetrics.includes('roi') && (
                    <Area
                      type="monotone"
                      dataKey="roi"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2.5}
                      fill="url(#gradientROI)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: 'hsl(var(--chart-3))',
                        fill: 'white',
                        className: 'dark:fill-slate-900',
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-6 border-t border-slate-200/60 pt-4 dark:border-slate-700/50">
              {(Object.keys(metricConfig) as MetricKey[]).map((key) => {
                const isEnabled = enabledMetrics.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleMetric(key)}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200 ${
                      isEnabled
                        ? 'bg-slate-100/80 dark:bg-slate-800/50'
                        : 'opacity-50 hover:opacity-75'
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`h-3 w-3 rounded-full transition-transform duration-200 ${
                          isEnabled ? 'scale-100' : 'scale-75'
                        }`}
                        style={{ backgroundColor: metricConfig[key].color }}
                      />
                      {isEnabled && (
                        <div
                          className="absolute inset-0 animate-pulse rounded-full opacity-40 blur-sm"
                          style={{ backgroundColor: metricConfig[key].color }}
                        />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium transition-colors duration-200 ${
                        isEnabled
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {metricConfig[key].label}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {shouldShowTable ? (
        <Card className="rounded-xl shadow-sm dark:border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">P&L breakdown</CardTitle>
                <CardDescription>
                  {skuFilter !== 'ALL' ? 'Filtered by SKU' : 'Aggregated by purchase order'}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="inline-flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5 shadow-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant={valueDisplay === 'ABSOLUTE' ? 'secondary' : 'ghost'}
                    className="h-7 px-2 text-xs"
                    onClick={() => filters?.setValueDisplay('ABSOLUTE')}
                  >
                    Absolute
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={valueDisplay === 'PER_UNIT' ? 'secondary' : 'ghost'}
                    className="h-7 px-2 text-xs"
                    onClick={() => filters?.setValueDisplay('PER_UNIT')}
                  >
                    Per unit
                  </Button>
                </div>
                {showUnattributed ? (
                  <div className="text-right text-xs text-muted-foreground">
                    Unattributed:{' '}
                    <span className="font-medium text-foreground/80">
                      {formatCurrency(dataset.unattributed.revenue)}
                    </span>{' '}
                    rev ·{' '}
                    <span
                      className={`font-medium ${dataset.unattributed.netProfit >= 0 ? 'text-emerald-600/80 dark:text-emerald-200/80' : 'text-red-600/80 dark:text-red-200/80'}`}
                    >
                      {formatCurrency(dataset.unattributed.netProfit)}
                    </span>{' '}
                    profit
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-slate-700">
                    <TableHead className="h-9 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/30 min-w-[140px]">
                      Metric
                    </TableHead>
                    {tableSortedData.map((row) => (
                      <TableHead
                        key={row.id}
                        className="h-9 px-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/30 min-w-[100px]"
                      >
                        {row.orderCode}
                      </TableHead>
                    ))}
                    <TableHead className="h-9 px-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100/70 dark:bg-slate-700/40 min-w-[100px]">
                      Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Status row */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Status
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm text-slate-600 dark:text-slate-300">
                        {statusLabels[row.status]}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                      —
                    </TableCell>
                  </TableRow>

                  {/* Units row */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Units
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                        {row.units.toLocaleString()}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-800/30">
                      {summary.totalUnits.toLocaleString()}
                    </TableCell>
                  </TableRow>

                  {/* Revenue row */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {valueDisplay === 'PER_UNIT' ? 'Sell Price' : 'Revenue'}
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                        {formatMoney(row.revenue, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(summary.totalRevenue, summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* COGS Section Header */}
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={tableSortedData.length + 2}
                      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-700"
                    >
                      COGS
                    </TableCell>
                  </TableRow>

                  {/* Manufacturing */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Manufacturing
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.manufacturingCost, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.manufacturingCost, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Freight */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Freight
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.freightCost, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.freightCost, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Tariff */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Tariff
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.tariffCost, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.tariffCost, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* COGS Adjustment */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Adjustment
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.cogsAdjustment, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.cogsAdjustment, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Total COGS */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Total COGS
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                        {formatMoney(row.cogs, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-100/50 dark:bg-slate-800/30">
                      {formatMoney(summary.totalCogs, summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* AMZ Fees Section Header */}
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={tableSortedData.length + 2}
                      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-700"
                    >
                      Amazon Fees
                    </TableCell>
                  </TableRow>

                  {/* Referral */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Referral
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.referralFees, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.referralFees, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* FBA */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      FBA
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.fbaFees, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.fbaFees, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Storage */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Storage
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.storageFees, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.storageFees, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* AMZ Adjustment */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 pl-6 text-sm text-slate-600 dark:text-slate-300">
                      Adjustment
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(row.amazonFeesAdjustment, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.amazonFeesAdjustment, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Total AMZ Fees */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Total AMZ Fees
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                        {formatMoney(row.amazonFees, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-100/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.amazonFees, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* PPC - shown before GP as it's part of GP calculation, not OPEX */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      PPC Spend
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                        {formatMoney(row.ppcSpend, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-100/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.ppcSpend, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Profit Section Header */}
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={tableSortedData.length + 2}
                      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-700"
                    >
                      Profit
                    </TableCell>
                  </TableRow>

                  {/* Gross Profit - shows before or after PPC based on toggle */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <button
                        type="button"
                        onClick={() => filters?.setShowGpAfterPpc(!showGpAfterPpc)}
                        className="hover:underline underline-offset-2 cursor-pointer text-left"
                      >
                        {showGpAfterPpc ? 'Gross Profit (After PPC)' : 'Gross Profit (Before PPC)'}
                      </button>
                    </TableCell>
                    {tableSortedData.map((row) => {
                      const gpValue = showGpAfterPpc ? row.grossProfit - row.ppcSpend : row.grossProfit;
                      return (
                        <TableCell
                          key={row.id}
                          className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${gpValue >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
                        >
                          {formatMoney(gpValue, row.units)}
                        </TableCell>
                      );
                    })}
                    <TableCell className={`px-3 py-2 text-right text-sm tabular-nums font-bold bg-slate-50/50 dark:bg-slate-800/30 ${(showGpAfterPpc ? summary.totalGrossProfit - summary.totalPpc : summary.totalGrossProfit) >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {formatMoney(showGpAfterPpc ? summary.totalGrossProfit - summary.totalPpc : summary.totalGrossProfit, summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Gross Margin % */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                      Gross Margin %
                    </TableCell>
                    {tableSortedData.map((row) => {
                      const gpValue = showGpAfterPpc ? row.grossProfit - row.ppcSpend : row.grossProfit;
                      const gmPercent = row.revenue > 0 ? (gpValue / row.revenue) * 100 : 0;
                      return (
                        <TableCell
                          key={row.id}
                          className={`px-3 py-2 text-right text-sm tabular-nums ${gmPercent >= 0 ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-300'}`}
                        >
                          {formatPercent(gmPercent)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatPercent(summary.totalRevenue > 0 ? ((showGpAfterPpc ? summary.totalGrossProfit - summary.totalPpc : summary.totalGrossProfit) / summary.totalRevenue) * 100 : 0)}
                    </TableCell>
                  </TableRow>

                  {/* OPEX (Fixed Costs only - estimates in X-Plan) */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      OPEX (est.)
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell key={row.id} className="px-3 py-2 text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {formatMoney(row.fixedCosts, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums font-bold text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-800/30">
                      {formatMoney(filteredData.reduce((sum, row) => sum + row.fixedCosts, 0), summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Net Profit */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Net Profit
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell
                        key={row.id}
                        className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${row.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
                      >
                        {formatMoney(row.netProfit, row.units)}
                      </TableCell>
                    ))}
                    <TableCell className={`px-3 py-2 text-right text-sm tabular-nums font-bold bg-slate-50/50 dark:bg-slate-800/30 ${summary.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {formatMoney(summary.totalProfit, summary.totalUnits)}
                    </TableCell>
                  </TableRow>

                  {/* Net Margin % */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                      Net Margin %
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell
                        key={row.id}
                        className={`px-3 py-2 text-right text-sm tabular-nums ${row.netMarginPercent >= 0 ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-300'}`}
                      >
                        {formatPercent(row.netMarginPercent)}
                      </TableCell>
                    ))}
                    <TableCell className={`px-3 py-2 text-right text-sm tabular-nums font-medium bg-slate-50/50 dark:bg-slate-800/30 ${summary.netMargin >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-300'}`}>
                      {formatPercent(summary.netMargin)}
                    </TableCell>
                  </TableRow>

                  {/* ROI */}
                  <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      ROI
                    </TableCell>
                    {tableSortedData.map((row) => (
                      <TableCell
                        key={row.id}
                        className={`px-3 py-2 text-right text-sm tabular-nums font-semibold ${row.roi >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
                      >
                        {formatPercent(row.roi)}
                      </TableCell>
                    ))}
                    <TableCell className={`px-3 py-2 text-right text-sm tabular-nums font-bold bg-slate-50/50 dark:bg-slate-800/30 ${summary.roi >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {formatPercent(summary.roi)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

