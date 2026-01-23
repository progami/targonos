'use client';

import { addWeeks } from 'date-fns';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SelectionStatsBar } from '@/components/ui/selection-stats-bar';
import { RealWeekIndicator } from '@/components/ui/real-week-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import {
  SHEET_TOOLBAR_GROUP,
  SHEET_TOOLBAR_LABEL,
  SHEET_TOOLBAR_SELECT,
} from '@/components/sheet-toolbar';
import {
  formatNumericInput,
  parseNumericInput,
  sanitizeNumeric,
} from '@/components/sheets/validators';
import { useMutationQueue } from '@/hooks/useMutationQueue';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useGridUndoRedo, type CellEdit } from '@/hooks/useGridUndoRedo';
import { withAppBasePath } from '@/lib/base-path';
import type { SelectionStats } from '@/lib/selection-stats';
import { getSelectionBorderBoxShadow } from '@/lib/grid/selection-border';
import { formatDateDisplay } from '@/lib/utils/dates';

const PLANNING_ANCHOR_WEEK = 1;
const PLANNING_ANCHOR_DATE = new Date('2025-01-06T00:00:00.000Z'); // Monday

function formatWeekDateFallback(weekNumber: number): string {
  return formatDateDisplay(addWeeks(PLANNING_ANCHOR_DATE, weekNumber - PLANNING_ANCHOR_WEEK));
}

type SalesRow = {
  weekNumber: string;
  weekLabel: string;
  weekDate: string;
  arrivalDetail?: string;
  arrivalNote?: string;
  hasActualData?: string;
  isCurrentWeek?: string;
  [key: string]: string | undefined;
};

type ColumnMeta = Record<string, { productId: string; field: string }>;
type NestedHeaderCell = string | { label: string; colspan?: number; rowspan?: number };

const editableMetrics = new Set(['actualSales', 'forecastSales']);
const BASE_SALES_METRICS = [
  'stockStart',
  'actualSales',
  'forecastSales',
  'systemForecastSales',
  'finalSales',
  'finalSalesError',
] as const;
const STOCK_METRIC_OPTIONS = [
  { id: 'stockWeeks', label: 'Cover (w)' },
  { id: 'stockEnd', label: 'Stock Qty' },
] as const;
type StockMetricId = (typeof STOCK_METRIC_OPTIONS)[number]['id'];

function isEditableMetric(field: string | undefined) {
  return Boolean(field && editableMetrics.has(field));
}

type SalesUpdate = {
  productId: string;
  weekNumber: number;
  values: Record<string, string>;
};

type SalesPlanningFocusContextValue = {
  focusProductId: string;
  setFocusProductId: (value: string) => void;
};

const SalesPlanningFocusContext = createContext<SalesPlanningFocusContextValue | null>(null);

export function useSalesPlanningFocus() {
  return useContext(SalesPlanningFocusContext);
}

export function SalesPlanningFocusProvider({
  children,
  strategyId,
}: {
  children: ReactNode;
  strategyId: string;
}) {
  const [focusProductId, setFocusProductId] = usePersistentState<string>(
    `xplan:sales-grid:${strategyId}:focus-product`,
    'ALL',
  );
  const value = useMemo(
    () => ({ focusProductId, setFocusProductId }),
    [focusProductId, setFocusProductId],
  );
  return (
    <SalesPlanningFocusContext.Provider value={value}>
      {children}
    </SalesPlanningFocusContext.Provider>
  );
}

export function SalesPlanningFocusControl({
  productOptions,
}: {
  productOptions: Array<{ id: string; name: string }>;
}) {
  const context = useContext(SalesPlanningFocusContext);
  const focusProductId = context?.focusProductId ?? 'ALL';

  useEffect(() => {
    if (!context) return;
    if (focusProductId === 'ALL') return;
    if (!productOptions.some((option) => option.id === focusProductId)) {
      context.setFocusProductId('ALL');
    }
  }, [context, focusProductId, productOptions]);

  if (!context) return null;
  const { setFocusProductId } = context;

  return (
    <div className={SHEET_TOOLBAR_GROUP}>
      <span className={SHEET_TOOLBAR_LABEL}>Focus SKU</span>
      <select
        value={focusProductId}
        onChange={(event) => setFocusProductId(event.target.value)}
        className={`${SHEET_TOOLBAR_SELECT} max-w-[7rem]`}
        aria-label="Focus on a single SKU"
      >
        <option value="ALL">Show all</option>
        {productOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type BatchAllocationMeta = {
  orderCode: string;
  batchCode?: string | null;
  quantity: number;
  sellingPrice: number;
  landedUnitCost: number;
};

type LeadTimeByProduct = Record<
  string,
  {
    productionWeeks: number;
    sourceWeeks: number;
    oceanWeeks: number;
    finalWeeks: number;
    totalWeeks: number;
  }
>;

type ReorderCueMeta = {
  startWeekNumber: number;
  startWeekLabel: string | null;
  startYear: number | null;
  startDate: string;
  breachWeekNumber: number;
  breachWeekLabel: string | null;
  breachYear: number | null;
  breachDate: string;
  leadTimeWeeks: number;
};

interface SalesPlanningGridProps {
  strategyId: string;
  rows: SalesRow[];
  hiddenRowIndices?: number[];
  columnMeta: ColumnMeta;
  nestedHeaders: NestedHeaderCell[][];
  columnKeys: string[];
  productOptions: Array<{ id: string; name: string }>;
  stockWarningWeeks: number;
  leadTimeByProduct: LeadTimeByProduct;
  batchAllocations: Map<string, BatchAllocationMeta[]>;
  reorderCueByProduct: Map<string, ReorderCueMeta>;
}

type CellCoords = { row: number; col: number };
type CellRange = { from: CellCoords; to: CellCoords };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

function clearNativeSelection() {
  const selection = window.getSelection();
  if (!selection) return;
  if (selection.type !== 'Range') return;
  selection.removeAllRanges();
}

function normalizeRange(range: CellRange): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const top = Math.min(range.from.row, range.to.row);
  const bottom = Math.max(range.from.row, range.to.row);
  const left = Math.min(range.from.col, range.to.col);
  const right = Math.max(range.from.col, range.to.col);
  return { top, bottom, left, right };
}

function formatNumberDisplay(value: unknown, useGrouping: boolean, fractionDigits: number): string {
  const parsed = typeof value === 'number' ? value : sanitizeNumeric(value);
  if (!Number.isFinite(parsed)) return '';
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping,
  });
}

function formatBatchComment(allocations: BatchAllocationMeta[]): string {
  if (!allocations || allocations.length === 0) return '';
  const lines = allocations.map((alloc) => {
    const batchId = alloc.batchCode || alloc.orderCode;
    const qty = Number(alloc.quantity).toFixed(0);
    const price = Number(alloc.sellingPrice).toFixed(2);
    const cost = Number(alloc.landedUnitCost).toFixed(3);
    return `${batchId}: ${qty} units @ $${price} (cost: $${cost})`;
  });
  return `FIFO Batch Allocation:\n${lines.join('\n')}`;
}

function parseNumericCandidate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let raw = value.trim();
  if (!raw || raw === '∞') return null;

  let isNegative = false;
  if (raw.startsWith('(') && raw.endsWith(')')) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
  }

  const normalized = raw.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -parsed : parsed;
}

function computeSelectionStatsFromData(
  data: SalesRow[],
  visibleRowIndices: number[],
  columnIds: string[],
  range: CellRange | null,
): SelectionStats | null {
  if (!range) return null;
  const { top, bottom, left, right } = normalizeRange(range);
  if (top < 0 || left < 0) return null;

  let cellCount = 0;
  let numericCount = 0;
  let sum = 0;

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    const absoluteRowIndex = visibleRowIndices[rowIndex];
    const row = data[absoluteRowIndex];
    if (!row) continue;

    for (let colIndex = left; colIndex <= right; colIndex += 1) {
      const columnId = columnIds[colIndex];
      if (!columnId) continue;
      cellCount += 1;
      const numeric = parseNumericCandidate(row[columnId]);
      if (numeric == null) continue;
      numericCount += 1;
      sum += numeric;
    }
  }

  if (cellCount === 0) return null;
  return {
    rangeCount: 1,
    cellCount,
    numericCount,
    sum,
    average: numericCount > 0 ? sum / numericCount : null,
  };
}

export function SalesPlanningGrid({
  strategyId,
  rows,
  hiddenRowIndices,
  columnMeta,
  columnKeys,
  productOptions,
  stockWarningWeeks,
  leadTimeByProduct,
  batchAllocations,
  reorderCueByProduct,
}: SalesPlanningGridProps) {
  const columnHelper = useMemo(() => createColumnHelper<SalesRow>(), []);
  const focusContext = useContext(SalesPlanningFocusContext);
  const focusProductId = focusContext?.focusProductId ?? 'ALL';

  const [activeStockMetric, setActiveStockMetric] = usePersistentState<StockMetricId>(
    'xplan:sales-grid:metric',
    'stockWeeks',
  );
  const [showFinalError, setShowFinalError] = usePersistentState<boolean>(
    'xplan:sales-grid:show-final-error',
    false,
  );

  const warningThreshold = Number.isFinite(stockWarningWeeks)
    ? stockWarningWeeks
    : Number.POSITIVE_INFINITY;

  const reorderCueByProductRef = useRef<Map<string, ReorderCueMeta>>(new Map());
  useEffect(() => {
    reorderCueByProductRef.current = new Map(reorderCueByProduct);
  }, [reorderCueByProduct]);

  const [data, setData] = useState<SalesRow[]>(() => rows.map((row) => ({ ...row })));
  useEffect(() => {
    setData(rows.map((row) => ({ ...row })));
  }, [rows]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);
  const pasteStartRef = useRef<CellCoords | null>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  usePersistentScroll(`hot:sales-planning:${strategyId}`, true, getScrollElement);

  const preserveGridScroll = useCallback((action: () => void) => {
    const holder = scrollRef.current;
    if (!holder) {
      action();
      return;
    }
    const top = holder.scrollTop;
    const left = holder.scrollLeft;
    action();
    requestAnimationFrame(() => {
      const current = scrollRef.current;
      if (!current) return;
      current.scrollTop = top;
      current.scrollLeft = left;
    });
  }, []);

  const hiddenRowSet = useMemo(() => new Set(hiddenRowIndices ?? []), [hiddenRowIndices]);
  const visibleRowIndices = useMemo(
    () => data.map((_, index) => index).filter((index) => !hiddenRowSet.has(index)),
    [data, hiddenRowSet],
  );
  const visibleRows = useMemo(
    () => visibleRowIndices.map((index) => data[index]).filter(Boolean),
    [data, visibleRowIndices],
  );

  const visibleMetrics = useMemo(() => {
    const metrics = new Set<string>([
      'stockStart',
      'actualSales',
      'forecastSales',
      'systemForecastSales',
    ]);
    metrics.add(showFinalError ? 'finalSalesError' : 'finalSales');
    metrics.add(activeStockMetric);
    return metrics;
  }, [activeStockMetric, showFinalError]);

  const keyByProductField = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const key of columnKeys) {
      const meta = columnMeta[key];
      if (!meta) continue;
      const entry = map.get(meta.productId) ?? {};
      entry[meta.field] = key;
      map.set(meta.productId, entry);
    }
    return map;
  }, [columnKeys, columnMeta]);

  const stockWeeksKeyByProduct = useMemo(() => {
    const map = new Map<string, string>();
    for (const key of columnKeys) {
      const meta = columnMeta[key];
      if (meta?.field === 'stockWeeks') {
        map.set(meta.productId, key);
      }
    }
    return map;
  }, [columnKeys, columnMeta]);

  const weekDateByNumber = useMemo(() => {
    const map = new Map<number, string>();
    data.forEach((row) => {
      const week = Number(row.weekNumber);
      if (!Number.isFinite(week)) return;
      map.set(week, row.weekDate ?? '');
    });
    return map;
  }, [data]);

  const weekLabelByNumber = useMemo(() => {
    const map = new Map<number, string>();
    data.forEach((row) => {
      const week = Number(row.weekNumber);
      if (!Number.isFinite(week)) return;
      map.set(week, row.weekLabel ?? '');
    });
    return map;
  }, [data]);

  const visibleWeekRange = useMemo(() => {
    let minWeekNumber = Number.POSITIVE_INFINITY;
    let maxWeekNumber = Number.NEGATIVE_INFINITY;
    for (const row of visibleRows) {
      const weekNumber = Number(row?.weekNumber);
      if (!Number.isFinite(weekNumber)) continue;
      minWeekNumber = Math.min(minWeekNumber, weekNumber);
      maxWeekNumber = Math.max(maxWeekNumber, weekNumber);
    }
    if (!Number.isFinite(minWeekNumber) || !Number.isFinite(maxWeekNumber)) {
      return { minWeekNumber: null as number | null, maxWeekNumber: null as number | null };
    }
    return { minWeekNumber, maxWeekNumber };
  }, [visibleRows]);

  const hasInboundByWeek = useMemo(() => {
    const set = new Set<number>();
    data.forEach((row) => {
      const week = Number(row.weekNumber);
      if (!Number.isFinite(week)) return;
      if ((row.arrivalDetail ?? '').trim()) {
        set.add(week);
      }
    });
    return set;
  }, [data]);

  const displayedProducts = useMemo(() => {
    const base =
      focusProductId === 'ALL'
        ? productOptions
        : productOptions.filter((product) => product.id === focusProductId);
    return base.filter((product) => {
      const keys = keyByProductField.get(product.id) ?? {};
      return (
        BASE_SALES_METRICS.some((metric) => keys[metric]) &&
        Boolean(keys.stockWeeks) &&
        Boolean(keys.stockEnd)
      );
    });
  }, [focusProductId, keyByProductField, productOptions]);

  const lowStockWeeksByProduct = useMemo(() => {
    const map = new Map<string, Set<number>>();

    displayedProducts.forEach((product) => {
      const keys = keyByProductField.get(product.id) ?? {};
      const stockWeeksKey = keys.stockWeeks;
      if (!stockWeeksKey) return;

      const lowWeeks = new Set<number>();
      data.forEach((row) => {
        const week = Number(row.weekNumber);
        if (!Number.isFinite(week)) return;
        const weeksNumeric = parseNumericInput(row[stockWeeksKey]);
        if (weeksNumeric != null && weeksNumeric <= warningThreshold) {
          lowWeeks.add(week);
        }
      });

      map.set(product.id, lowWeeks);
    });

    return map;
  }, [data, displayedProducts, keyByProductField, warningThreshold]);

  const inboundWeeksByProduct = useMemo(() => {
    const map = new Map<string, Set<number>>();

    displayedProducts.forEach((product) => {
      const keys = keyByProductField.get(product.id) ?? {};
      const stockStartKey = keys.stockStart;
      if (!stockStartKey) return;
      const inboundKey = stockStartKey.replace(/_stockStart$/, '_hasInbound');

      const inboundWeeks = new Set<number>();
      for (const row of data) {
        const week = Number(row?.weekNumber);
        if (!Number.isFinite(week) || !row) continue;
        if (row[inboundKey] === 'true') inboundWeeks.add(week);
      }

      map.set(product.id, inboundWeeks);
    });

    return map;
  }, [data, displayedProducts, keyByProductField]);

  const metricSequence = useMemo(() => {
    return [
      'stockStart',
      'actualSales',
      'forecastSales',
      'systemForecastSales',
      showFinalError ? 'finalSalesError' : 'finalSales',
      activeStockMetric,
    ];
  }, [activeStockMetric, showFinalError]);

  const columns = useMemo(() => {
    const baseColumns = [
      columnHelper.accessor('weekLabel', {
        id: 'weekLabel',
        header: () => 'Week',
        cell: (info) => (
          <span className="flex items-center gap-1">
            {info.getValue()}
            <RealWeekIndicator
              hasActualData={info.row.original.hasActualData === 'true'}
              isIncompleteWeek={info.row.original.isCurrentWeek === 'true'}
            />
          </span>
        ),
        meta: { sticky: true, stickyOffset: 0, width: 80, kind: 'pinned' },
      }),
      columnHelper.accessor('weekDate', {
        id: 'weekDate',
        header: () => 'Date',
        meta: { sticky: true, stickyOffset: 80, width: 120, kind: 'pinned' },
      }),
      columnHelper.accessor((row) => row.arrivalDetail ?? '', {
        id: 'arrivalDetail',
        header: () => 'Inbound PO',
        meta: { sticky: true, stickyOffset: 200, width: 140, kind: 'pinned' },
      }),
    ];

    const productColumns = displayedProducts.flatMap((product) => {
      const keys = keyByProductField.get(product.id) ?? {};

      return metricSequence
        .map((field) => {
          const key = keys[field];
          if (!key) return null;
          return columnHelper.accessor((row) => row[key] ?? '', {
            id: key,
            header: () => {
              const labelMap: Record<string, string> = {
                stockStart: 'Stock Start',
                actualSales: 'Actual',
                forecastSales: 'Planner',
                systemForecastSales: 'System',
                finalSales: 'Demand',
                finalSalesError: '% Error',
                stockWeeks: 'Cover (w)',
                stockEnd: 'Stock Qty',
              };

              if (field === activeStockMetric) {
                return (
                  <button
                    type="button"
                    className="rounded border bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-secondary/80"
                    onClick={() =>
                      preserveGridScroll(() =>
                        setActiveStockMetric((prev) =>
                          prev === 'stockWeeks' ? 'stockEnd' : 'stockWeeks',
                        ),
                      )
                    }
                  >
                    {labelMap[field]}
                  </button>
                );
              }

              if (field === (showFinalError ? 'finalSalesError' : 'finalSales')) {
                return (
                  <button
                    type="button"
                    className="rounded border bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-secondary/80"
                    onClick={() => preserveGridScroll(() => setShowFinalError((prev) => !prev))}
                  >
                    {labelMap[field]}
                  </button>
                );
              }

              return (
                <span className="text-xs font-medium text-muted-foreground">
                  {labelMap[field] ?? field}
                </span>
              );
            },
            meta: {
              kind: 'metric',
              productId: product.id,
              field,
              width: 110,
            },
          });
        })
        .filter((col): col is NonNullable<typeof col> => Boolean(col));
    });

    return [...baseColumns, ...productColumns];
  }, [
    activeStockMetric,
    columnHelper,
    displayedProducts,
    keyByProductField,
    metricSequence,
    preserveGridScroll,
    setActiveStockMetric,
    setShowFinalError,
    showFinalError,
  ]);

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const leafColumns = table.getAllLeafColumns();
  const leafColumnIds = useMemo(() => leafColumns.map((col) => col.id), [leafColumns]);
  const tableWidth = useMemo(() => {
    return leafColumns.reduce((sum, column) => {
      const meta = column.columnDef.meta as { width?: number } | undefined;
      const width = typeof meta?.width === 'number' ? meta.width : 110;
      return sum + width;
    }, 0);
  }, [leafColumns]);

  const columnLayout = useMemo(() => {
    const widths = leafColumns.map((column) => {
      const meta = column.columnDef.meta as { width?: number } | undefined;
      return typeof meta?.width === 'number' ? meta.width : 110;
    });

    const offsets: number[] = new Array(widths.length);
    let running = 0;
    for (let index = 0; index < widths.length; index += 1) {
      offsets[index] = running;
      running += widths[index] ?? 0;
    }

    const pinnedColumns = leafColumns.filter((column) => {
      const meta = column.columnDef.meta as { kind?: string } | undefined;
      return meta?.kind === 'pinned';
    });
    const pinnedWidth = pinnedColumns.reduce((sum, column) => {
      const meta = column.columnDef.meta as { width?: number } | undefined;
      const width = typeof meta?.width === 'number' ? meta.width : 110;
      return sum + width;
    }, 0);
    const pinnedCount =
      pinnedColumns.length > 0 ? pinnedColumns.length : Math.min(3, leafColumns.length);

    return { widths, offsets, pinnedWidth, pinnedCount };
  }, [leafColumns]);

  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const selectionRef = useRef<CellRange | null>(null);
  selectionRef.current = selection;
  const selectionRange = useMemo(() => (selection ? normalizeRange(selection) : null), [selection]);

  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);

  const [editingCell, setEditingCell] = useState<{
    coords: CellCoords;
    columnId: string;
    productId: string;
    field: string;
    value: string;
  } | null>(null);

  const recomputeDerivedForProduct = useCallback(
    (productId: string, nextData: SalesRow[], startRowIndex: number | null = null): SalesRow[] => {
      const extractYear = (label: string): number | null => {
        const match = label.match(/(\d{4})\s*$/);
        if (!match) return null;
        const year = Number(match[1]);
        return Number.isFinite(year) ? year : null;
      };

      const keysByField = new Map<string, string>();
      for (const key of columnKeys) {
        const meta = columnMeta[key];
        if (!meta || meta.productId !== productId) continue;
        keysByField.set(meta.field, key);
      }

      const stockStartKey = keysByField.get('stockStart');
      const actualSalesKey = keysByField.get('actualSales');
      const forecastSalesKey = keysByField.get('forecastSales');
      const systemForecastSalesKey = keysByField.get('systemForecastSales');
      const finalSalesKey = keysByField.get('finalSales');
      const finalSalesErrorKey = keysByField.get('finalSalesError');
      const stockWeeksKey = keysByField.get('stockWeeks');
      const stockEndKey = keysByField.get('stockEnd');

      if (
        !stockStartKey ||
        !actualSalesKey ||
        !forecastSalesKey ||
        !systemForecastSalesKey ||
        !finalSalesKey ||
        !finalSalesErrorKey ||
        !stockWeeksKey ||
        !stockEndKey
      ) {
        return nextData;
      }

      const n = nextData.length;
      const previousStockStart: number[] = new Array(n);
      const previousStockEnd: number[] = new Array(n);
      const actual: Array<number | null> = new Array(n);
      const forecast: Array<number | null> = new Array(n);
      const systemForecast: Array<number | null> = new Array(n);

      for (let i = 0; i < n; i += 1) {
        const row = nextData[i];
        previousStockStart[i] = parseNumericInput(row?.[stockStartKey]) ?? 0;
        previousStockEnd[i] = parseNumericInput(row?.[stockEndKey]) ?? 0;
        actual[i] = parseNumericInput(row?.[actualSalesKey]);
        forecast[i] = parseNumericInput(row?.[forecastSalesKey]);
        systemForecast[i] = parseNumericInput(row?.[systemForecastSalesKey]);
      }

      const arrivalsKey = stockStartKey.replace(/_stockStart$/, '_arrivals');
      const arrivals: number[] = new Array(n).fill(0);
      for (let i = 0; i < n; i += 1) {
        const row = nextData[i];
        arrivals[i] = parseNumericInput(row?.[arrivalsKey]) ?? 0;
      }

      const baseStartOverrides = new Map<number, number>();
      if (n > 0) {
        baseStartOverrides.set(0, previousStockStart[0] - arrivals[0]);
      }
      for (let i = 1; i < n; i += 1) {
        const baseStart = previousStockStart[i] - arrivals[i];
        if (baseStart !== previousStockEnd[i - 1]) {
          baseStartOverrides.set(i, baseStart);
        }
      }

      const nextStockStart: number[] = new Array(n);
      const nextFinalSales: number[] = new Array(n);
      const nextStockEnd: number[] = new Array(n);
      const nextError: Array<number | null> = new Array(n);
      const nextDemandSource: string[] = new Array(n);

      nextStockStart[0] = previousStockStart[0];

      for (let i = 0; i < n; i += 1) {
        const demand = actual[i] ?? forecast[i] ?? systemForecast[i] ?? 0;
        nextFinalSales[i] = Math.max(0, demand);
        nextStockEnd[i] = Math.max(0, nextStockStart[i] - nextFinalSales[i]);

        nextDemandSource[i] =
          actual[i] != null
            ? 'ACTUAL'
            : forecast[i] != null
              ? 'PLANNER'
              : systemForecast[i] != null
                ? 'SYSTEM'
                : 'ZERO';

        if (i + 1 < n) {
          const baseStartOverride = baseStartOverrides.get(i + 1);
          const baseStart = baseStartOverride != null ? baseStartOverride : nextStockEnd[i];
          nextStockStart[i + 1] = baseStart + arrivals[i + 1];
        }

        if (actual[i] != null && forecast[i] != null && forecast[i] !== 0) {
          nextError[i] = (actual[i]! - forecast[i]!) / Math.abs(forecast[i]!);
        } else {
          nextError[i] = null;
        }
      }

      const nextStockWeeks: number[] = new Array(n);
      for (let i = 0; i < n; i += 1) {
        const demand = nextFinalSales[i] ?? 0;
        const stockStart = nextStockStart[i] ?? 0;
        nextStockWeeks[i] =
          demand > 0 ? stockStart / demand : stockStart > 0 ? Number.POSITIVE_INFINITY : 0;
      }

      if (Number.isFinite(warningThreshold) && warningThreshold > 0) {
        const leadProfile = leadTimeByProduct[productId];
        const leadTimeWeeks = leadProfile
          ? Math.max(0, Math.ceil(Number(leadProfile.totalWeeks)))
          : 0;
        if (leadTimeWeeks > 0) {
          let hasBeenAbove = false;
          let breachIndex: number | null = null;
          for (let i = 0; i < n; i += 1) {
            const weeksValue = nextStockWeeks[i];
            if (!Number.isFinite(weeksValue)) {
              hasBeenAbove = true;
              continue;
            }
            const isBelow = weeksValue <= warningThreshold;
            if (isBelow && hasBeenAbove) {
              breachIndex = i;
              break;
            }
            if (!isBelow) {
              hasBeenAbove = true;
            }
          }

          if (breachIndex != null) {
            const breachWeekNumber = Number(nextData[breachIndex]?.weekNumber);
            if (!Number.isFinite(breachWeekNumber)) {
              reorderCueByProductRef.current.delete(productId);
            } else {
              const startWeekNumber = breachWeekNumber - leadTimeWeeks;
              const breachWeekLabel = nextData[breachIndex]?.weekLabel ?? null;
              const startWeekLabel = weekLabelByNumber.get(startWeekNumber) || null;
              const startDate =
                weekDateByNumber.get(startWeekNumber) || formatWeekDateFallback(startWeekNumber);
              const breachDate =
                nextData[breachIndex]?.weekDate ||
                weekDateByNumber.get(breachWeekNumber) ||
                formatWeekDateFallback(breachWeekNumber);

              reorderCueByProductRef.current.set(productId, {
                startWeekNumber,
                startWeekLabel,
                startYear: extractYear(startDate),
                startDate,
                breachWeekNumber,
                breachWeekLabel,
                breachYear: extractYear(breachDate),
                breachDate,
                leadTimeWeeks,
              });
            }
          } else {
            reorderCueByProductRef.current.delete(productId);
          }
        } else {
          reorderCueByProductRef.current.delete(productId);
        }
      }

      const changes: Array<[number, string, string]> = [];
      for (let i = 0; i < n; i += 1) {
        const row = nextData[i];

        const stockStartValue = Number.isFinite(nextStockStart[i])
          ? nextStockStart[i].toFixed(0)
          : '';
        const finalSalesValue = Number.isFinite(nextFinalSales[i])
          ? nextFinalSales[i].toFixed(0)
          : '';
        const stockEndValue = Number.isFinite(nextStockEnd[i]) ? nextStockEnd[i].toFixed(0) : '';
        const stockWeeksValue = Number.isFinite(nextStockWeeks[i])
          ? nextStockWeeks[i].toFixed(2)
          : '∞';
        const errorValue = nextError[i] == null ? '' : `${(nextError[i]! * 100).toFixed(1)}%`;
        const demandSourceKey = finalSalesKey.replace(/_finalSales$/, '_finalSalesSource');
        const demandSourceValue = nextDemandSource[i] ?? '';

        if (row?.[stockStartKey] !== stockStartValue)
          changes.push([i, stockStartKey, stockStartValue]);
        if (row?.[finalSalesKey] !== finalSalesValue)
          changes.push([i, finalSalesKey, finalSalesValue]);
        if (row?.[stockEndKey] !== stockEndValue) changes.push([i, stockEndKey, stockEndValue]);
        if (row?.[stockWeeksKey] !== stockWeeksValue)
          changes.push([i, stockWeeksKey, stockWeeksValue]);
        if (row?.[finalSalesErrorKey] !== errorValue)
          changes.push([i, finalSalesErrorKey, errorValue]);
        if (row?.[demandSourceKey] !== demandSourceValue)
          changes.push([i, demandSourceKey, demandSourceValue]);
      }

      const startIndex = Math.max(0, Math.min(n - 1, startRowIndex ?? 0));
      const slicedChanges =
        startIndex === 0 ? changes : changes.filter(([rowIndex]) => rowIndex >= startIndex);

      if (slicedChanges.length === 0) return nextData;

      const next = nextData.slice();
      const updatedRows = new Map<number, SalesRow>();
      for (const [rowIndex, prop, value] of slicedChanges) {
        const base = updatedRows.get(rowIndex) ?? { ...(next[rowIndex] ?? {}) };
        base[prop] = value;
        updatedRows.set(rowIndex, base);
      }
      updatedRows.forEach((row, rowIndex) => {
        next[rowIndex] = row;
      });
      return next;
    },
    [
      columnKeys,
      columnMeta,
      leadTimeByProduct,
      warningThreshold,
      weekDateByNumber,
      weekLabelByNumber,
    ],
  );

  const handleFlush = useCallback(
    async (payload: SalesUpdate[]) => {
      if (payload.length === 0) return;
      try {
        const response = await fetch(withAppBasePath('/api/v1/xplan/sales-weeks'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId, updates: payload }),
        });
        if (!response.ok) throw new Error('Failed to update sales planning');
        toast.success('Sales planning updated', { id: 'sales-planning-updated' });
      } catch (error) {
        console.error(error);
        toast.error('Unable to save sales planning changes');
      }
    },
    [strategyId],
  );

  const { pendingRef, scheduleFlush, flushNow } = useMutationQueue<string, SalesUpdate>({
    debounceMs: 600,
    onFlush: handleFlush,
  });

  useEffect(() => {
    return () => {
      flushNow().catch(() => {});
    };
  }, [flushNow]);

  const queueUpdate = useCallback(
    (productId: string, weekNumber: number, field: string, value: string) => {
      const key = `${productId}-${weekNumber}`;
      if (!pendingRef.current.has(key)) {
        pendingRef.current.set(key, { productId, weekNumber, values: {} });
      }
      const entry = pendingRef.current.get(key);
      if (!entry) return;
      entry.values[field] = value;
      scheduleFlush();
    },
    [pendingRef, scheduleFlush],
  );

  // Undo/redo functionality
  // For SalesGrid, rowKey is `${visibleRowIndex}-${columnId}` format
  const applyUndoRedoEdits = useCallback(
    (edits: CellEdit<string>[]) => {
      const editsByColumnId = new Map<
        string,
        { visibleRowIndex: number; columnId: string; value: string }
      >();

      for (const edit of edits) {
        // rowKey format: `${visibleRowIndex}-${columnId}`
        const dashIndex = edit.rowKey.indexOf('-');
        if (dashIndex === -1) continue;
        const visibleRowIndex = Number(edit.rowKey.slice(0, dashIndex));
        const columnId = edit.rowKey.slice(dashIndex + 1);

        if (!Number.isFinite(visibleRowIndex)) continue;

        editsByColumnId.set(`${visibleRowIndex}-${columnId}`, {
          visibleRowIndex,
          columnId,
          value: edit.newValue,
        });
      }

      if (editsByColumnId.size === 0) return;

      const absoluteEditsByProduct = new Map<
        string,
        {
          minRow: number;
          items: Array<{ absoluteRowIndex: number; columnId: string; value: string }>;
        }
      >();
      const queued: Array<{ productId: string; weekNumber: number; field: string; value: string }> =
        [];

      setData((prev) => {
        let next = prev.slice();

        for (const [, edit] of editsByColumnId) {
          const absoluteRowIndex = visibleRowIndices[edit.visibleRowIndex];
          const row = prev[absoluteRowIndex];
          if (!row) continue;

          const colMeta = columnMeta[edit.columnId];
          if (!colMeta || !isEditableMetric(colMeta.field)) continue;

          const weekNumber = Number(row.weekNumber);
          if (!Number.isFinite(weekNumber)) continue;

          // Update local state
          const current = next[absoluteRowIndex] ?? { ...row };
          current[edit.columnId] = edit.value;
          next[absoluteRowIndex] = current;

          // Track for derived field recalculation
          const existing = absoluteEditsByProduct.get(colMeta.productId);
          if (!existing) {
            absoluteEditsByProduct.set(colMeta.productId, {
              minRow: absoluteRowIndex,
              items: [{ absoluteRowIndex, columnId: edit.columnId, value: edit.value }],
            });
          } else {
            existing.items.push({ absoluteRowIndex, columnId: edit.columnId, value: edit.value });
            existing.minRow = Math.min(existing.minRow, absoluteRowIndex);
          }

          // Queue API update
          queued.push({
            productId: colMeta.productId,
            weekNumber,
            field: colMeta.field,
            value: edit.value,
          });
        }

        // Recompute derived fields
        for (const [productId, payload] of absoluteEditsByProduct.entries()) {
          next = recomputeDerivedForProduct(productId, next, payload.minRow);
        }

        return next;
      });

      // Queue API updates
      queued.forEach((item) =>
        queueUpdate(item.productId, item.weekNumber, item.field, item.value),
      );
    },
    [columnMeta, visibleRowIndices, recomputeDerivedForProduct, queueUpdate],
  );

  const { recordEdits, undo, redo } = useGridUndoRedo<string>({
    maxHistory: 50,
    onApplyEdits: applyUndoRedoEdits,
  });

  const applyEdits = useCallback(
    (edits: Array<{ visibleRowIndex: number; columnId: string; rawValue: string }>) => {
      if (edits.length === 0) return;

      const editsByProduct = new Map<string, { minRow: number; items: typeof edits }>();
      const queued: Array<{ productId: string; weekNumber: number; field: string; value: string }> =
        [];
      const normalizedEdits: Array<{ visibleRowIndex: number; columnId: string; value: string }> =
        [];

      edits.forEach((edit) => {
        const colMeta = columnMeta[edit.columnId];
        if (!colMeta || !isEditableMetric(colMeta.field)) return;

        const absoluteRowIndex = visibleRowIndices[edit.visibleRowIndex];
        const row = data[absoluteRowIndex];
        if (!row) return;
        const weekNumber = Number(row.weekNumber);
        if (!Number.isFinite(weekNumber)) return;

        const formatted = formatNumericInput(edit.rawValue, 0);
        const currentRaw = row[edit.columnId];
        const current = typeof currentRaw === 'string' ? currentRaw.trim() : '';
        if (formatted === current) return;

        queued.push({
          productId: colMeta.productId,
          weekNumber,
          field: colMeta.field,
          value: formatted,
        });
        normalizedEdits.push({
          visibleRowIndex: edit.visibleRowIndex,
          columnId: edit.columnId,
          value: formatted,
        });

        const existing = editsByProduct.get(colMeta.productId);
        if (!existing) {
          editsByProduct.set(colMeta.productId, { minRow: absoluteRowIndex, items: [edit] });
        } else {
          existing.items.push(edit);
          existing.minRow = Math.min(existing.minRow, absoluteRowIndex);
        }
      });

      if (queued.length === 0) return;

      // Record edits for undo/redo before applying
      const undoEdits: CellEdit<string>[] = normalizedEdits.map((edit) => {
        const absoluteRowIndex = visibleRowIndices[edit.visibleRowIndex];
        const currentValue = data[absoluteRowIndex]?.[edit.columnId] ?? '';
        return {
          rowKey: `${edit.visibleRowIndex}-${edit.columnId}`,
          field: edit.columnId,
          oldValue: typeof currentValue === 'string' ? currentValue : '',
          newValue: edit.value,
        };
      });
      if (undoEdits.length > 0) {
        recordEdits(undoEdits);
      }

      setData((prev) => {
        let next = prev.slice();

        const touchedRows = new Map<number, SalesRow>();
        normalizedEdits.forEach((edit) => {
          const colMeta = columnMeta[edit.columnId];
          if (!colMeta || !isEditableMetric(colMeta.field)) return;

          const absoluteRowIndex = visibleRowIndices[edit.visibleRowIndex];
          const current = touchedRows.get(absoluteRowIndex) ?? {
            ...(next[absoluteRowIndex] ?? {}),
          };
          current[edit.columnId] = edit.value;
          touchedRows.set(absoluteRowIndex, current);
        });

        touchedRows.forEach((rowValue, rowIndex) => {
          next[rowIndex] = rowValue;
        });

        for (const [productId, payload] of editsByProduct.entries()) {
          next = recomputeDerivedForProduct(productId, next, payload.minRow);
        }

        return next;
      });

      queued.forEach((item) =>
        queueUpdate(item.productId, item.weekNumber, item.field, item.value),
      );
    },
    [columnMeta, data, queueUpdate, recomputeDerivedForProduct, visibleRowIndices, recordEdits],
  );

  const startEditing = useCallback(
    (coords: CellCoords) => {
      const columnId = leafColumnIds[coords.col];
      if (!columnId) return;
      const meta = columnMeta[columnId];
      if (!meta || !isEditableMetric(meta.field)) return;

      const absoluteRowIndex = visibleRowIndices[coords.row];
      const row = data[absoluteRowIndex];
      if (!row) return;

      setEditingCell({
        coords,
        columnId,
        productId: meta.productId,
        field: meta.field,
        value: row[columnId] ?? '',
      });
    },
    [columnMeta, data, leafColumnIds, visibleRowIndices],
  );

  const commitEditing = useCallback(() => {
    if (!editingCell) return;
    applyEdits([
      {
        visibleRowIndex: editingCell.coords.row,
        columnId: editingCell.columnId,
        rawValue: editingCell.value,
      },
    ]);
    setEditingCell(null);
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, [applyEdits, editingCell]);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, []);

  const ensureCellVisible = useCallback(
    (coords: CellCoords) => {
      const holder = scrollRef.current;
      if (!holder) return;

      const headerHeight = holder.querySelector('thead')?.getBoundingClientRect().height ?? 72;
      const rowHeight = holder.querySelector('tbody tr')?.getBoundingClientRect().height ?? 32;

      const cellTop = headerHeight + coords.row * rowHeight;
      const cellBottom = cellTop + rowHeight;

      const viewTop = holder.scrollTop + headerHeight;
      const viewBottom = holder.scrollTop + holder.clientHeight;

      let nextScrollTop = holder.scrollTop;
      if (cellTop < viewTop) {
        nextScrollTop = Math.max(0, cellTop - headerHeight);
      } else if (cellBottom > viewBottom) {
        nextScrollTop = Math.max(0, cellBottom - holder.clientHeight);
      }
      const maxScrollTop = Math.max(0, holder.scrollHeight - holder.clientHeight);
      nextScrollTop = Math.min(nextScrollTop, maxScrollTop);

      let nextScrollLeft = holder.scrollLeft;
      if (coords.col >= columnLayout.pinnedCount) {
        const cellLeft = columnLayout.offsets[coords.col] ?? 0;
        const cellRight = cellLeft + (columnLayout.widths[coords.col] ?? 0);

        const viewLeft = holder.scrollLeft + columnLayout.pinnedWidth;
        const viewRight = holder.scrollLeft + holder.clientWidth;

        if (cellLeft < viewLeft) {
          nextScrollLeft = Math.max(0, cellLeft - columnLayout.pinnedWidth);
        } else if (cellRight > viewRight) {
          nextScrollLeft = Math.max(0, cellRight - holder.clientWidth);
        }
        const maxScrollLeft = Math.max(0, holder.scrollWidth - holder.clientWidth);
        nextScrollLeft = Math.min(nextScrollLeft, maxScrollLeft);
      }

      if (nextScrollTop !== holder.scrollTop || nextScrollLeft !== holder.scrollLeft) {
        holder.scrollTo({ top: nextScrollTop, left: nextScrollLeft, behavior: 'auto' });
      }
    },
    [columnLayout],
  );

  const buildClipboardText = useCallback(
    (range: CellRange) => {
      const normalized = normalizeRange(range);
      const lines: string[] = [];

      for (let rowIndex = normalized.top; rowIndex <= normalized.bottom; rowIndex += 1) {
        const absoluteRowIndex = visibleRowIndices[rowIndex];
        const row = data[absoluteRowIndex];
        if (!row) continue;

        const parts: string[] = [];
        for (let colIndex = normalized.left; colIndex <= normalized.right; colIndex += 1) {
          const columnId = leafColumnIds[colIndex];
          if (!columnId) continue;
          parts.push(row[columnId] ?? '');
        }
        lines.push(parts.join('\t'));
      }

      return lines.join('\n');
    },
    [data, leafColumnIds, visibleRowIndices],
  );

  const copySelectionToClipboard = useCallback(() => {
    const currentSelection =
      selectionRef.current ?? (activeCell ? { from: activeCell, to: activeCell } : null);
    if (!currentSelection) return;

    const text = buildClipboardText(currentSelection);
    if (!text) return;

    const clipboard = clipboardRef.current;
    if (!clipboard) {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => {});
      }
      return;
    }

    clipboard.value = text;
    clipboard.focus();
    clipboard.select();

    try {
      const didCopy = document.execCommand('copy');
      if (!didCopy && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => {});
      }
    } finally {
      clipboard.value = '';
      requestAnimationFrame(() => scrollRef.current?.focus());
    }
  }, [activeCell, buildClipboardText]);

  const updateActiveSelection = useCallback(
    (nextCoords: CellCoords, { extendSelection }: { extendSelection: boolean }) => {
      setActiveCell(nextCoords);

      if (extendSelection && selectionAnchorRef.current) {
        const nextRange = { from: selectionAnchorRef.current, to: nextCoords };
        setSelection(nextRange);
        setSelectionStats(
          computeSelectionStatsFromData(data, visibleRowIndices, leafColumnIds, nextRange),
        );
      } else {
        selectionAnchorRef.current = nextCoords;
        const nextRange = { from: nextCoords, to: nextCoords };
        setSelection(nextRange);
        setSelectionStats(
          computeSelectionStatsFromData(data, visibleRowIndices, leafColumnIds, nextRange),
        );
      }

      requestAnimationFrame(() => ensureCellVisible(nextCoords));
    },
    [data, ensureCellVisible, leafColumnIds, visibleRowIndices],
  );

  const moveActiveCell = useCallback(
    (deltaRow: number, deltaCol: number) => {
      if (!activeCell) return;
      const nextRow = Math.max(0, Math.min(visibleRows.length - 1, activeCell.row + deltaRow));
      const nextCol = Math.max(0, Math.min(leafColumnIds.length - 1, activeCell.col + deltaCol));
      const nextCoords = { row: nextRow, col: nextCol };
      setActiveCell(nextCoords);
      setSelection({ from: nextCoords, to: nextCoords });
      selectionAnchorRef.current = nextCoords;
      setSelectionStats(
        computeSelectionStatsFromData(data, visibleRowIndices, leafColumnIds, {
          from: nextCoords,
          to: nextCoords,
        }),
      );
      requestAnimationFrame(() => ensureCellVisible(nextCoords));
    },
    [activeCell, data, ensureCellVisible, leafColumnIds, visibleRowIndices, visibleRows.length],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditing();
        }
        return;
      }

      // Handle Ctrl+Z for undo and Ctrl+Shift+Z / Ctrl+Y for redo (even without active cell)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Handle Ctrl+Y for redo (Windows convention)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if (!activeCell) return;

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelectionToClipboard();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
        const clipboard = clipboardRef.current;
        if (!clipboard) return;
        pasteStartRef.current = activeCell;
        clipboard.value = '';
        clipboard.focus();
        clipboard.select();
        window.setTimeout(() => {
          if (pasteStartRef.current && document.activeElement === clipboard) {
            pasteStartRef.current = null;
            clipboard.value = '';
            scrollRef.current?.focus();
          }
        }, 250);
        return;
      }

      if (event.key === 'F2') {
        const columnId = leafColumnIds[activeCell.col];
        const meta = columnId ? columnMeta[columnId] : undefined;
        if (!meta || !isEditableMetric(meta.field)) return;
        event.preventDefault();
        startEditing(activeCell);
        return;
      }

      if (event.key === 'Enter') {
        const columnId = leafColumnIds[activeCell.col];
        const meta = columnId ? columnMeta[columnId] : undefined;
        if (meta && isEditableMetric(meta.field)) {
          event.preventDefault();
          startEditing(activeCell);
          return;
        }
        moveActiveCell(1, 0);
        return;
      }

      const isArrowKey = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key);
      if (isArrowKey) {
        const jump = event.ctrlKey || event.metaKey;
        const extendSelection = event.shiftKey;
        if (extendSelection && !selectionAnchorRef.current) {
          selectionAnchorRef.current = activeCell;
        }

        const lastRow = Math.max(0, visibleRows.length - 1);
        const lastCol = Math.max(0, leafColumnIds.length - 1);

        let nextRow = activeCell.row;
        let nextCol = activeCell.col;

        if (jump) {
          if (event.key === 'ArrowDown') nextRow = lastRow;
          if (event.key === 'ArrowUp') nextRow = 0;
          if (event.key === 'ArrowRight') nextCol = lastCol;
          if (event.key === 'ArrowLeft') nextCol = 0;
        } else {
          if (event.key === 'ArrowDown') nextRow += 1;
          if (event.key === 'ArrowUp') nextRow -= 1;
          if (event.key === 'ArrowRight') nextCol += 1;
          if (event.key === 'ArrowLeft') nextCol -= 1;
        }

        nextRow = Math.max(0, Math.min(lastRow, nextRow));
        nextCol = Math.max(0, Math.min(lastCol, nextCol));

        event.preventDefault();
        updateActiveSelection({ row: nextRow, col: nextCol }, { extendSelection });
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        const normalizedSelection = selectionRef.current
          ? normalizeRange(selectionRef.current)
          : normalizeRange({ from: activeCell, to: activeCell });

        const edits: Array<{ visibleRowIndex: number; columnId: string; rawValue: string }> = [];
        for (
          let rowIndex = normalizedSelection.top;
          rowIndex <= normalizedSelection.bottom;
          rowIndex += 1
        ) {
          if (rowIndex >= visibleRows.length) continue;
          for (
            let colIndex = normalizedSelection.left;
            colIndex <= normalizedSelection.right;
            colIndex += 1
          ) {
            if (colIndex >= leafColumnIds.length) continue;
            const columnId = leafColumnIds[colIndex];
            if (!columnId) continue;
            const meta = columnMeta[columnId];
            if (!meta || !isEditableMetric(meta.field)) continue;
            edits.push({ visibleRowIndex: rowIndex, columnId, rawValue: '' });
          }
        }

        if (edits.length === 0) return;

        applyEdits(edits);
        setSelectionStats(null);
        return;
      }

      if (/^[0-9.,-]$/.test(event.key)) {
        const columnId = leafColumnIds[activeCell.col];
        const meta = columnId ? columnMeta[columnId] : undefined;
        if (!meta || !isEditableMetric(meta.field)) return;
        event.preventDefault();
        setEditingCell({
          coords: activeCell,
          columnId,
          productId: meta.productId,
          field: meta.field,
          value: event.key,
        });
      }
    },
    [
      activeCell,
      applyEdits,
      cancelEditing,
      columnMeta,
      copySelectionToClipboard,
      editingCell,
      leafColumnIds,
      moveActiveCell,
      startEditing,
      updateActiveSelection,
      visibleRows.length,
      undo,
      redo,
    ],
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (!selectionRef.current) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', buildClipboardText(selectionRef.current));
    },
    [buildClipboardText],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      const normalizedSelection = selectionRef.current
        ? normalizeRange(selectionRef.current)
        : null;
      const hasMultiSelection =
        normalizedSelection &&
        (normalizedSelection.top !== normalizedSelection.bottom ||
          normalizedSelection.left !== normalizedSelection.right);
      const start = normalizedSelection
        ? { row: normalizedSelection.top, col: normalizedSelection.left }
        : activeCell;
      if (!start) return;

      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();

      const rowsMatrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (rowsMatrix.length === 0) return;

      const edits: Array<{ visibleRowIndex: number; columnId: string; rawValue: string }> = [];
      if (
        hasMultiSelection &&
        normalizedSelection &&
        rowsMatrix.length === 1 &&
        rowsMatrix[0]?.length === 1
      ) {
        const rawValue = rowsMatrix[0]?.[0] ?? '';
        for (
          let rowIndex = normalizedSelection.top;
          rowIndex <= normalizedSelection.bottom;
          rowIndex += 1
        ) {
          for (
            let colIndex = normalizedSelection.left;
            colIndex <= normalizedSelection.right;
            colIndex += 1
          ) {
            if (rowIndex >= visibleRows.length) continue;
            if (colIndex >= leafColumnIds.length) continue;
            const columnId = leafColumnIds[colIndex];
            if (!columnId) continue;
            edits.push({ visibleRowIndex: rowIndex, columnId, rawValue });
          }
        }
      } else {
        for (let r = 0; r < rowsMatrix.length; r += 1) {
          for (let c = 0; c < rowsMatrix[r]!.length; c += 1) {
            const targetRow = start.row + r;
            const targetCol = start.col + c;
            if (targetRow >= visibleRows.length) continue;
            if (targetCol >= leafColumnIds.length) continue;
            const columnId = leafColumnIds[targetCol];
            if (!columnId) continue;
            edits.push({
              visibleRowIndex: targetRow,
              columnId,
              rawValue: rowsMatrix[r]![c] ?? '',
            });
          }
        }
      }

      applyEdits(edits);
    },
    [activeCell, applyEdits, leafColumnIds, visibleRows.length],
  );

  const handleClipboardPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const normalizedSelection = selectionRef.current
        ? normalizeRange(selectionRef.current)
        : null;
      const hasMultiSelection =
        normalizedSelection &&
        (normalizedSelection.top !== normalizedSelection.bottom ||
          normalizedSelection.left !== normalizedSelection.right);
      const start = normalizedSelection
        ? { row: normalizedSelection.top, col: normalizedSelection.left }
        : (pasteStartRef.current ?? activeCell);
      pasteStartRef.current = null;

      const text = event.clipboardData.getData('text/plain');
      event.preventDefault();

      const clipboard = clipboardRef.current;
      const refocusClipboard = () => {
        if (clipboard) clipboard.value = '';
        requestAnimationFrame(() => scrollRef.current?.focus());
      };

      if (!start || !text) {
        refocusClipboard();
        return;
      }

      const rowsMatrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (rowsMatrix.length === 0) {
        refocusClipboard();
        return;
      }

      const edits: Array<{ visibleRowIndex: number; columnId: string; rawValue: string }> = [];
      if (
        hasMultiSelection &&
        normalizedSelection &&
        rowsMatrix.length === 1 &&
        rowsMatrix[0]?.length === 1
      ) {
        const rawValue = rowsMatrix[0]?.[0] ?? '';
        for (
          let rowIndex = normalizedSelection.top;
          rowIndex <= normalizedSelection.bottom;
          rowIndex += 1
        ) {
          for (
            let colIndex = normalizedSelection.left;
            colIndex <= normalizedSelection.right;
            colIndex += 1
          ) {
            if (rowIndex >= visibleRows.length) continue;
            if (colIndex >= leafColumnIds.length) continue;
            const columnId = leafColumnIds[colIndex];
            if (!columnId) continue;
            edits.push({ visibleRowIndex: rowIndex, columnId, rawValue });
          }
        }
      } else {
        for (let r = 0; r < rowsMatrix.length; r += 1) {
          for (let c = 0; c < rowsMatrix[r]!.length; c += 1) {
            const targetRow = start.row + r;
            const targetCol = start.col + c;
            if (targetRow >= visibleRows.length) continue;
            if (targetCol >= leafColumnIds.length) continue;
            const columnId = leafColumnIds[targetCol];
            if (!columnId) continue;
            edits.push({
              visibleRowIndex: targetRow,
              columnId,
              rawValue: rowsMatrix[r]![c] ?? '',
            });
          }
        }
      }

      applyEdits(edits);
      refocusClipboard();
    },
    [activeCell, applyEdits, leafColumnIds, visibleRows.length],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, row: number, col: number) => {
      if (event.pointerType === 'touch') return;
      if (event.button !== 0) return;
      if (isEditableTarget(event.target)) return;
      clearNativeSelection();
      scrollRef.current?.focus();

      const coords = { row, col };
      setActiveCell(coords);

      if (event.shiftKey && selectionAnchorRef.current) {
        const nextRange = { from: selectionAnchorRef.current, to: coords };
        setSelection(nextRange);
        return;
      }

      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
      setSelectionStats(null);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, row: number, col: number) => {
      if (event.pointerType === 'touch') return;
      if (!event.buttons) return;
      if (!selectionAnchorRef.current) return;
      setSelection({ from: selectionAnchorRef.current, to: { row, col } });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    if (!selectionRef.current) return;
    setSelectionStats(
      computeSelectionStatsFromData(data, visibleRowIndices, leafColumnIds, selectionRef.current),
    );
  }, [data, leafColumnIds, visibleRowIndices]);

  const handleDoubleClick = useCallback(
    (row: number, col: number) => {
      startEditing({ row, col });
    },
    [startEditing],
  );

  const getCellPresentation = useCallback(
    (visibleRowIndex: number, columnId: string) => {
      const absoluteRowIndex = visibleRowIndices[visibleRowIndex];
      const row = data[absoluteRowIndex];
      const colMeta = columnMeta[columnId];
      const weekNumber = Number(row?.weekNumber);
      const hasInbound = Number.isFinite(weekNumber) && hasInboundByWeek.has(weekNumber);

      if (!row) {
        return {
          display: '',
          isEditable: false,
          isWarning: false,
          isReorder: false,
          hasInbound,
          highlight: 'none' as const,
          tooltip: '',
          badge: null as string | null,
        };
      }

      if (columnId === 'weekLabel' || columnId === 'weekDate') {
        return {
          display: row[columnId] ?? '',
          isEditable: false,
          isWarning: false,
          isReorder: false,
          hasInbound,
          highlight: 'none' as const,
          tooltip: '',
          badge: null as string | null,
        };
      }

      if (columnId === 'arrivalDetail') {
        const reorderCueEntries: Array<{ productName: string; tooltip: string }> = [];

        if (Number.isFinite(weekNumber)) {
          for (const product of displayedProducts) {
            const reorderInfo = reorderCueByProductRef.current.get(product.id);
            if (!reorderInfo) continue;

            const reorderCueWeekNumber =
              visibleWeekRange.minWeekNumber != null &&
              visibleWeekRange.maxWeekNumber != null &&
              reorderInfo.startWeekNumber >= visibleWeekRange.minWeekNumber &&
              reorderInfo.startWeekNumber <= visibleWeekRange.maxWeekNumber
                ? reorderInfo.startWeekNumber
                : visibleWeekRange.minWeekNumber != null &&
                    reorderInfo.startWeekNumber < visibleWeekRange.minWeekNumber
                  ? visibleWeekRange.minWeekNumber
                  : null;
            const isReorderWeek =
              reorderCueWeekNumber != null && reorderCueWeekNumber === weekNumber;
            if (!isReorderWeek) continue;

            const leadProfile = leadTimeByProduct[product.id];
            const leadTimeWeeks = leadProfile
              ? Math.max(0, Math.ceil(Number(leadProfile.totalWeeks)))
              : reorderInfo.leadTimeWeeks;
            const leadParts = leadProfile
              ? [
                  `prod ${Math.max(0, Math.ceil(Number(leadProfile.productionWeeks)))}w`,
                  `source ${Math.max(0, Math.ceil(Number(leadProfile.sourceWeeks)))}w`,
                  `ocean ${Math.max(0, Math.ceil(Number(leadProfile.oceanWeeks)))}w`,
                  `final ${Math.max(0, Math.ceil(Number(leadProfile.finalWeeks)))}w`,
                ]
              : [];

            const startLabel = reorderInfo.startWeekLabel
              ? `W${reorderInfo.startWeekLabel}`
              : `week ${reorderInfo.startWeekNumber}`;
            const breachLabel = reorderInfo.breachWeekLabel
              ? `W${reorderInfo.breachWeekLabel}`
              : `week ${reorderInfo.breachWeekNumber}`;
            const lateByWeeks = Math.max(0, reorderCueWeekNumber - reorderInfo.startWeekNumber);
            const startLine =
              lateByWeeks > 0
                ? `Start production: now (late by ${lateByWeeks}w; recommended ${startLabel} · ${reorderInfo.startDate}).`
                : `Start production: ${startLabel} (${reorderInfo.startDate}).`;
            const breachLine = `Breach (coverage < ${warningThreshold}w): ${breachLabel} (${reorderInfo.breachDate}).`;

            const lines = [
              `Reorder signal (target ≥ ${warningThreshold}w coverage).`,
              startLine,
              breachLine,
              `Lead time: ${leadTimeWeeks}w${
                leadParts.length ? ` (${leadParts.join(' + ')})` : ''
              }.`,
            ];

            reorderCueEntries.push({ productName: product.name, tooltip: lines.join('\n') });
          }
        }

        const hasReorderCue = reorderCueEntries.length > 0;
        const reorderTooltip = hasReorderCue
          ? reorderCueEntries.length === 1
            ? `SKU: ${reorderCueEntries[0]!.productName}\n${reorderCueEntries[0]!.tooltip}`
            : (() => {
                const grouped = new Map<string, string[]>();
                for (const entry of reorderCueEntries) {
                  const existing = grouped.get(entry.tooltip);
                  if (existing) {
                    existing.push(entry.productName);
                  } else {
                    grouped.set(entry.tooltip, [entry.productName]);
                  }
                }

                const blocks = Array.from(grouped.entries()).map(([tooltip, skus]) => {
                  const label = skus.length === 1 ? 'SKU' : 'SKUs';
                  return `${label}: ${skus.join(', ')}\n${tooltip}`;
                });

                return blocks.join('\n\n');
              })()
          : '';
        const arrivalNote = row.arrivalNote ?? '';
        const tooltip = [reorderTooltip, arrivalNote].filter(Boolean).join('\n\n');
        const display = [(row.arrivalDetail ?? '').trim(), hasReorderCue ? 'Reorder now' : '']
          .filter(Boolean)
          .join(' · ');

        return {
          display,
          isEditable: false,
          isWarning: false,
          isReorder: hasReorderCue,
          hasInbound,
          highlight: hasReorderCue ? ('reorder' as const) : ('none' as const),
          tooltip,
          badge: null as string | null,
        };
      }

      const field = colMeta?.field;
      const editable = isEditableMetric(field);
      let tooltipText = '';
      let isWarning = false;
      let isReorder = false;
      let highlight: 'none' | 'warning' | 'reorder' | 'inbound' = 'none';
      let badge: string | null = null;

      const productId = colMeta?.productId;
      const reorderInfo = productId ? reorderCueByProductRef.current.get(productId) : undefined;
      const reorderCueWeekNumber =
        reorderInfo == null || !Number.isFinite(weekNumber)
          ? null
          : visibleWeekRange.minWeekNumber != null &&
              visibleWeekRange.maxWeekNumber != null &&
              reorderInfo.startWeekNumber >= visibleWeekRange.minWeekNumber &&
              reorderInfo.startWeekNumber <= visibleWeekRange.maxWeekNumber
            ? reorderInfo.startWeekNumber
            : visibleWeekRange.minWeekNumber != null &&
                reorderInfo.startWeekNumber < visibleWeekRange.minWeekNumber
              ? visibleWeekRange.minWeekNumber
              : null;
      const isReorderWeek = reorderCueWeekNumber != null && reorderCueWeekNumber === weekNumber;

      if (productId && isReorderWeek && field && visibleMetrics.has(field)) {
        isReorder = true;
      }

      const weeksKey = productId ? stockWeeksKeyByProduct.get(productId) : undefined;
      const rawWeeks = weeksKey ? row[weeksKey] : undefined;

      const isInboundWeek =
        productId && Number.isFinite(weekNumber)
          ? (inboundWeeksByProduct.get(productId)?.has(weekNumber) ?? false)
          : false;
      const isLowStockWeek =
        productId && Number.isFinite(weekNumber)
          ? (lowStockWeeksByProduct.get(productId)?.has(weekNumber) ?? false)
          : false;

      if (isInboundWeek) {
        highlight = 'inbound';
      } else if (isLowStockWeek) {
        highlight = 'warning';
      } else if (productId && isReorderWeek) {
        highlight = 'reorder';
      }

      if (field === 'stockWeeks' && rawWeeks === '∞') {
        const previousValue =
          visibleRowIndex > 0
            ? data[visibleRowIndices[visibleRowIndex - 1]]?.[weeksKey ?? '']
            : undefined;
        const isFirstInfinity = visibleRowIndex === 0 || previousValue !== '∞';
        if (isFirstInfinity) {
          tooltipText =
            `Cover (w) = projected Stock Start ÷ projected Demand.\n` +
            `∞ means Demand is 0 for that week.`;
        }
      }

      const isStockColumn = field === activeStockMetric;
      if (productId && isStockColumn && weeksKey) {
        const weeksNumeric = parseNumericInput(rawWeeks);
        const isBelowThreshold = weeksNumeric != null && weeksNumeric <= warningThreshold;
        if (isBelowThreshold) {
          isWarning = true;
          const leadProfile = leadTimeByProduct[productId];
          const leadTimeWeeks = leadProfile
            ? Math.max(0, Math.ceil(Number(leadProfile.totalWeeks)))
            : 0;
          if (Number.isFinite(weekNumber) && leadTimeWeeks > 0 && !tooltipText) {
            const startWeekRaw = weekNumber - leadTimeWeeks;
            const startDate =
              weekDateByNumber.get(startWeekRaw) || formatWeekDateFallback(startWeekRaw);
            const startWeekLabelRaw = weekLabelByNumber.get(startWeekRaw) || null;
            const startWeekLabel = startWeekLabelRaw
              ? `W${startWeekLabelRaw}`
              : `week ${startWeekRaw}`;
            tooltipText = `Low stock warning (≤ ${warningThreshold}w).\nStart production by ${startWeekLabel} (${startDate}).`;
          }
        }
      }

      if (field === 'finalSales') {
        const cellKey = `${weekNumber}-${columnId}`;
        const allocations = batchAllocations.get(cellKey);
        if (allocations && allocations.length > 0) {
          tooltipText = tooltipText || formatBatchComment(allocations);
        }

        const sourceKey = columnId.replace(/_finalSales$/, '_finalSalesSource');
        const systemVersionKey = columnId.replace(/_finalSales$/, '_systemForecastVersion');
        const sourceRaw = (row[sourceKey] ?? '').trim();
        const systemVersion = (row[systemVersionKey] ?? '').trim();

        const sourceLabel =
          sourceRaw === 'OVERRIDE'
            ? 'Override'
            : sourceRaw === 'ACTUAL'
              ? 'Actual'
              : sourceRaw === 'PLANNER'
                ? 'Planner'
                : sourceRaw === 'SYSTEM'
                  ? 'System'
                  : sourceRaw
                    ? sourceRaw
                    : '—';

        badge =
          sourceRaw === 'ACTUAL'
            ? 'Act'
            : sourceRaw === 'PLANNER'
              ? 'Plan'
              : sourceRaw === 'SYSTEM'
                ? 'Sys'
                : sourceRaw === 'OVERRIDE'
                  ? 'Ovr'
                  : null;

        const versionLine =
          sourceRaw === 'SYSTEM' && systemVersion ? `System version: ${systemVersion}` : '';
        const sourceLines = [`Demand source: ${sourceLabel}`, versionLine].filter(Boolean);
        const sourceInfo = sourceLines.join('\n');
        tooltipText = tooltipText ? `${tooltipText}\n\n${sourceInfo}` : sourceInfo;
      }

      if (field === 'systemForecastSales') {
        const systemVersionKey = columnId.replace(
          /_systemForecastSales$/,
          '_systemForecastVersion',
        );
        const systemVersion = (row[systemVersionKey] ?? '').trim();
        if (systemVersion) {
          const versionLine = `System version: ${systemVersion}`;
          tooltipText = tooltipText ? `${tooltipText}\n\n${versionLine}` : versionLine;
        }
      }

      const raw = row[columnId] ?? '';
      if (field === 'finalSalesError') {
        return {
          display: raw,
          isEditable: false,
          isWarning,
          isReorder,
          hasInbound,
          highlight,
          tooltip: tooltipText,
          badge,
        };
      }

      if (raw === '∞') {
        return {
          display: '∞',
          isEditable: editable,
          isWarning,
          isReorder,
          hasInbound,
          highlight,
          tooltip: tooltipText,
          badge,
        };
      }

      if (!raw) {
        return {
          display: '',
          isEditable: editable,
          isWarning,
          isReorder,
          hasInbound,
          highlight,
          tooltip: tooltipText,
          badge,
        };
      }

      return {
        display: formatNumberDisplay(raw, !editable, field === 'stockWeeks' ? 2 : 0),
        isEditable: editable,
        isWarning,
        isReorder,
        hasInbound,
        highlight,
        tooltip: tooltipText,
        badge,
      };
    },
    [
      activeStockMetric,
      batchAllocations,
      columnMeta,
      data,
      displayedProducts,
      hasInboundByWeek,
      inboundWeeksByProduct,
      leadTimeByProduct,
      lowStockWeeksByProduct,
      stockWeeksKeyByProduct,
      visibleMetrics,
      visibleWeekRange,
      visibleRowIndices,
      warningThreshold,
      weekDateByNumber,
      weekLabelByNumber,
    ],
  );

  const productMetricColumnIds = useMemo(() => {
    return displayedProducts.map((product) => {
      const keys = keyByProductField.get(product.id) ?? {};
      const columnIds = metricSequence.map((metric) => keys[metric]).filter(Boolean) as string[];
      return { product, columnIds };
    });
  }, [displayedProducts, keyByProductField, metricSequence]);

  // Compute which column indices are at the start of each product group for border styling
  const productBoundaryColumns = useMemo(() => {
    const firstColIndices = new Set<number>();
    const pinnedCount = 3; // weekLabel, weekDate, arrivalDetail
    let currentIndex = pinnedCount;

    for (const { columnIds } of productMetricColumnIds) {
      if (columnIds.length > 0) {
        firstColIndices.add(currentIndex);
        currentIndex += columnIds.length;
      }
    }

    return { firstColIndices };
  }, [productMetricColumnIds]);

  const baseHeaderColumns = useMemo(() => {
    const pinned = leafColumns.filter((column) => {
      const meta = column.columnDef.meta as { kind?: string } | undefined;
      return meta?.kind === 'pinned';
    });
    return pinned.length > 0 ? pinned : leafColumns.slice(0, 3);
  }, [leafColumns]);

  const renderProductGroupHeader = useCallback(
    (product: { id: string; name: string }) => {
      const currentProductIndex = productOptions.findIndex((option) => option.id === product.id);
      const hasPrev = currentProductIndex > 0;
      const hasNext = currentProductIndex >= 0 && currentProductIndex < productOptions.length - 1;

      return (
        <div className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-0"
            disabled={!hasPrev && focusProductId === 'ALL'}
            onClick={() => {
              preserveGridScroll(() => {
                if (!focusContext) return;
                if (focusProductId !== 'ALL' && !hasPrev) {
                  focusContext.setFocusProductId('ALL');
                  return;
                }
                const prevId = productOptions[currentProductIndex - 1]?.id;
                if (prevId) focusContext.setFocusProductId(prevId);
              });
            }}
          >
            {focusProductId !== 'ALL' && !hasPrev ? (
              <LayoutGrid className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="min-w-0 truncate text-xs font-semibold">{product.name}</span>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-0"
            disabled={!hasNext}
            onClick={() => {
              preserveGridScroll(() => {
                if (!focusContext || !hasNext) return;
                const nextId = productOptions[currentProductIndex + 1]?.id;
                if (nextId) focusContext.setFocusProductId(nextId);
              });
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    },
    [focusContext, focusProductId, preserveGridScroll, productOptions],
  );

  const renderMetricHeader = useCallback(
    (field: string) => {
      const labelMap: Record<string, string> = {
        stockStart: 'Stock Start',
        actualSales: 'Actual',
        forecastSales: 'Planner',
        systemForecastSales: 'System',
        finalSales: 'Demand',
        finalSalesError: '% Error',
        stockWeeks: 'Cover (w)',
        stockEnd: 'Stock Qty',
      };

      if (field === activeStockMetric) {
        return (
          <button
            type="button"
            className="rounded border bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-secondary/80"
            onClick={() =>
              preserveGridScroll(() =>
                setActiveStockMetric((prev) => (prev === 'stockWeeks' ? 'stockEnd' : 'stockWeeks')),
              )
            }
          >
            {labelMap[field]}
          </button>
        );
      }

      if (field === (showFinalError ? 'finalSalesError' : 'finalSales')) {
        return (
          <button
            type="button"
            className="rounded border bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-secondary/80"
            onClick={() => preserveGridScroll(() => setShowFinalError((prev) => !prev))}
          >
            {labelMap[field]}
          </button>
        );
      }

      return (
        <span className="text-xs font-medium text-muted-foreground">
          {labelMap[field] ?? field}
        </span>
      );
    },
    [
      activeStockMetric,
      preserveGridScroll,
      setActiveStockMetric,
      setShowFinalError,
      showFinalError,
    ],
  );

  return (
    <section className="space-y-4">
      <div
        className="relative overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10"
        style={{ height: 'calc(100vh - 180px)', minHeight: '420px' }}
      >
        <textarea
          ref={clipboardRef}
          tabIndex={-1}
          aria-hidden="true"
          className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
          onPaste={handleClipboardPaste}
        />
	        <div
	          ref={scrollRef}
	          tabIndex={0}
	          className="h-full select-none overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
	          onPointerDownCapture={() => {
	            if (!editingCell) {
	              scrollRef.current?.focus();
	            }
	          }}
          onKeyDown={handleKeyDown}
          onCopy={handleCopy}
          onPaste={handlePaste}
        >
          <Table
            className="relative w-full border-collapse table-fixed"
            style={{ minWidth: tableWidth }}
          >
            <colgroup>
              {leafColumns.map((column) => {
                const meta = column.columnDef.meta as { width?: number } | undefined;
                const width = typeof meta?.width === 'number' ? meta.width : 110;
                return <col key={column.id} style={{ width, minWidth: width, maxWidth: width }} />;
              })}
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {baseHeaderColumns.map((column) => {
                  const meta = column.columnDef.meta as
                    | { sticky?: boolean; stickyOffset?: number; width?: number }
                    | undefined;
                  const labelMap: Record<string, string> = {
                    weekLabel: 'Week',
                    weekDate: 'Date',
                    arrivalDetail: 'Inbound PO',
                  };
                  return (
                    <TableHead
                      key={column.id}
                      rowSpan={2}
                      className={cn(
                        'sticky top-0 z-40 h-10 whitespace-nowrap border-b border-r bg-muted px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 align-middle dark:text-cyan-300/80',
                        meta?.sticky && 'z-50',
                      )}
                      style={{
                        left: meta?.sticky ? meta.stickyOffset : undefined,
                        width: meta?.width,
                        minWidth: meta?.width,
                      }}
                    >
                      {labelMap[column.id] ?? column.id}
                    </TableHead>
                  );
                })}
                {productMetricColumnIds.map(({ product, columnIds }) => (
                  <TableHead
                    key={product.id}
                    colSpan={columnIds.length}
                    className="sticky top-0 z-20 h-10 whitespace-nowrap border-b bg-muted px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300/80"
                  >
                    {renderProductGroupHeader(product)}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="hover:bg-transparent">
                {productMetricColumnIds.flatMap(({ product, columnIds }) =>
                  columnIds.map((columnId) => {
                    const meta = columnMeta[columnId];
                    const field = meta?.field ?? '';
                    const isInputColumn = field === 'actualSales' || field === 'forecastSales';
                    return (
                      <TableHead
                        key={`${product.id}:${columnId}`}
                        className={cn(
                          'sticky top-10 z-20 h-10 whitespace-nowrap border-b border-r px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300/80',
                          isInputColumn ? 'bg-cyan-100/90 dark:bg-cyan-900/50' : 'bg-muted',
                        )}
                      >
                        {renderMetricHeader(field)}
                      </TableHead>
                    );
                  }),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row, visibleRowIndex) => (
                <TableRow
                  key={row.id}
                  className={cn('hover:bg-transparent', visibleRowIndex % 2 === 1 && 'bg-muted/30')}
                >
                  {leafColumns.map((column, colIndex) => {
                    const meta = column.columnDef.meta as
                      | { sticky?: boolean; stickyOffset?: number; width?: number; field?: string }
                      | undefined;
                    const presentation = getCellPresentation(visibleRowIndex, column.id);
                    const isSelected = selectionRange
                      ? visibleRowIndex >= selectionRange.top &&
                        visibleRowIndex <= selectionRange.bottom &&
                        colIndex >= selectionRange.left &&
                        colIndex <= selectionRange.right
                      : false;
                    const isCurrent =
                      activeCell?.row === visibleRowIndex && activeCell?.col === colIndex;
                    const isEditing =
                      editingCell?.coords.row === visibleRowIndex &&
                      editingCell?.coords.col === colIndex;

                    const isEvenRow = visibleRowIndex % 2 === 1;
                    const isPinned = colIndex <= 2;
                    const isWeekCellWithActualData =
                      column.id === 'weekLabel' && row.original.hasActualData === 'true';

                    const cellContent = isEditing ? (
                      <Input
                        autoFocus
                        value={editingCell.value}
                        onChange={(e) =>
                          setEditingCell((prev) =>
                            prev ? { ...prev, value: e.target.value } : prev,
                          )
                        }
                        onBlur={commitEditing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEditing();
                            moveActiveCell(1, 0);
                          } else if (e.key === 'Tab') {
                            e.preventDefault();
                            commitEditing();
                            moveActiveCell(0, e.shiftKey ? -1 : 1);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditing();
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="h-8 w-full min-w-0 select-text rounded-none border-0 bg-transparent px-0 text-right text-sm font-medium shadow-none focus:bg-background focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex min-w-0 items-center gap-1',
                          isPinned ? 'justify-start' : 'justify-end',
                        )}
                      >
                        <span className="block min-w-0 truncate tabular-nums">
                          {presentation.display}
                        </span>
                        {column.id === 'weekLabel' ? (
                          <RealWeekIndicator
                            hasActualData={isWeekCellWithActualData}
                            isIncompleteWeek={row.original.isCurrentWeek === 'true'}
                            className="shrink-0"
                          />
                        ) : null}
                        {presentation.badge ? (
                          <span className="shrink-0 text-2xs font-medium text-muted-foreground/70">
                            {presentation.badge}
                          </span>
                        ) : null}
                      </div>
                    );

                    const isFirstProductCol = productBoundaryColumns.firstColIndices.has(colIndex);
                    const boxShadow = getSelectionBorderBoxShadow(
                      selectionRange,
                      { row: visibleRowIndex, col: colIndex },
                      {
                        existingBoxShadow: isFirstProductCol ? 'inset 3px 0 0 0 #06b6d4' : null,
                      },
                    );

                    const cell = (
	                      <TableCell
	                        key={column.id}
	                        className={cn(
	                          'h-8 select-none whitespace-nowrap border-r px-2 py-0 text-sm overflow-hidden',
	                          meta?.sticky
	                            ? isEvenRow
	                              ? 'bg-muted'
	                              : 'bg-card'
                            : isEvenRow
                              ? 'bg-muted/30'
                              : 'bg-card',
                          isWeekCellWithActualData &&
                            'bg-cyan-100 dark:bg-cyan-900/50',
                          meta?.sticky && 'sticky z-10',
                          colIndex === 2 && 'border-r-2',
                          presentation.isEditable && 'cursor-text font-medium',
                          presentation.isEditable &&
                            presentation.highlight === 'none' &&
                            'bg-cyan-50/80 dark:bg-cyan-950/40',
                          presentation.highlight === 'warning' &&
                            'bg-danger-100/90 dark:bg-danger-500/25 dark:ring-1 dark:ring-inset dark:ring-danger-300/45',
                          presentation.isWarning && 'text-danger-700 dark:text-danger-200',
                          presentation.highlight === 'reorder' &&
                            'bg-warning-100/95 dark:bg-warning-500/25 dark:ring-1 dark:ring-inset dark:ring-warning-300/45',
                          presentation.highlight === 'inbound' &&
                            'bg-success-100/90 dark:bg-success-500/25 dark:ring-1 dark:ring-inset dark:ring-success-300/45',
                          isCurrent && 'ring-2 ring-inset ring-cyan-600 dark:ring-cyan-400',
                        )}
                        style={{
                          left: meta?.sticky ? meta.stickyOffset : undefined,
                          width: meta?.width,
                          minWidth: meta?.width,
                          maxWidth: meta?.width,
                          boxShadow,
                        }}
                        onPointerDown={(e) => handlePointerDown(e, visibleRowIndex, colIndex)}
                        onPointerMove={(e) => handlePointerMove(e, visibleRowIndex, colIndex)}
                        onPointerUp={handlePointerUp}
                        onDoubleClick={() => handleDoubleClick(visibleRowIndex, colIndex)}
                      >
                        {presentation.tooltip ? (
                          <Tooltip
                            content={presentation.tooltip}
                            position="right"
                            className="block h-full w-full"
                          >
                            {cellContent}
                          </Tooltip>
                        ) : (
                          cellContent
                        )}
                      </TableCell>
                    );

                    return cell;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <SelectionStatsBar stats={selectionStats} />
      </div>
    </section>
  );
}
