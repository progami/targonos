'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { usePersistentState } from '@/hooks/usePersistentState';
import {
  SHEET_TOOLBAR_GROUP,
  SHEET_TOOLBAR_LABEL,
  SHEET_TOOLBAR_SELECT,
} from '@/components/sheet-toolbar';
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
import {
  formatNumericInput,
  parseNumericInput,
  sanitizeNumeric,
} from '@/components/sheets/validators';
import { useGridUndoRedo, type CellEdit } from '@/hooks/useGridUndoRedo';
import { useMutationQueue } from '@/hooks/useMutationQueue';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { withAppBasePath } from '@/lib/base-path';
import type { SelectionStats } from '@/lib/selection-stats';
import { getSelectionBorderBoxShadow } from '@/lib/grid/selection-border';
import { currencyForRegion, localeForRegion, type StrategyRegion } from '@/lib/strategy-region';

// Context for P&L grid filters
type ProfitAndLossFiltersContextValue = {
  showGpAfterPpc: boolean;
  setShowGpAfterPpc: (value: boolean) => void;
};

const ProfitAndLossFiltersContext = createContext<ProfitAndLossFiltersContextValue | null>(null);

export function ProfitAndLossFiltersProvider({
  children,
  strategyId,
}: {
  children: ReactNode;
  strategyId: string;
}) {
  const [showGpAfterPpc, setShowGpAfterPpc] = usePersistentState<boolean>(
    `xplan:pnl:${strategyId}:show-gp-after-ppc`,
    false,
  );

  const value = useMemo(
    () => ({ showGpAfterPpc, setShowGpAfterPpc }),
    [showGpAfterPpc, setShowGpAfterPpc],
  );

  return (
    <ProfitAndLossFiltersContext.Provider value={value}>
      {children}
    </ProfitAndLossFiltersContext.Provider>
  );
}

export function ProfitAndLossHeaderControls() {
  const context = useContext(ProfitAndLossFiltersContext);
  if (!context) return null;

  const { showGpAfterPpc, setShowGpAfterPpc } = context;

  return (
    <div className={SHEET_TOOLBAR_GROUP}>
      <span className={SHEET_TOOLBAR_LABEL}>GP</span>
      <select
        value={showGpAfterPpc ? 'after-ppc' : 'before-ppc'}
        onChange={(event) => setShowGpAfterPpc(event.target.value === 'after-ppc')}
        className={SHEET_TOOLBAR_SELECT}
        aria-label="Show GP before or after PPC"
      >
        <option value="before-ppc">Before PPC</option>
        <option value="after-ppc">After PPC</option>
      </select>
    </div>
  );
}

type WeeklyRow = {
  weekNumber: string;
  weekLabel: string;
  weekDate: string;
  units: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  grossMargin: string;
  amazonFees: string;
  ppcSpend: string;
  fixedCosts: string;
  netProfit: string;
  netMargin: string;
  hasActualData?: string;
  isCurrentWeek?: string;
};

type DisplayColumnKey = Exclude<keyof WeeklyRow, 'hasActualData' | 'isCurrentWeek'>;

type UpdatePayload = {
  weekNumber: number;
  values: Partial<Record<DisplayColumnKey, string>>;
};

interface ProfitAndLossGridProps {
  strategyId: string;
  strategyRegion: StrategyRegion;
  weekly: WeeklyRow[];
}

const editableFields = new Set<DisplayColumnKey>([
  'units',
  'revenue',
  'cogs',
  'amazonFees',
  'ppcSpend',
  'fixedCosts',
]);

const columnConfig: Array<{
  key: DisplayColumnKey;
  label: string;
  width: number;
  format: 'text' | 'number' | 'currency' | 'percent';
  editable: boolean;
  align: 'left' | 'right';
  sticky?: boolean;
  stickyOffset?: number;
}> = [
  {
    key: 'weekLabel',
    label: 'Week',
    width: 80,
    format: 'text',
    editable: false,
    align: 'left',
    sticky: true,
    stickyOffset: 0,
  },
  {
    key: 'weekDate',
    label: 'Date',
    width: 120,
    format: 'text',
    editable: false,
    align: 'left',
    sticky: true,
    stickyOffset: 80,
  },
  { key: 'units', label: 'Units', width: 100, format: 'number', editable: true, align: 'right' },
  {
    key: 'revenue',
    label: 'Revenue',
    width: 120,
    format: 'currency',
    editable: true,
    align: 'right',
  },
  { key: 'cogs', label: 'COGS', width: 120, format: 'currency', editable: true, align: 'right' },
  {
    key: 'amazonFees',
    label: 'Amazon Costs',
    width: 120,
    format: 'currency',
    editable: true,
    align: 'right',
  },
  // PPC moved before GP - it's part of GP calculation, not OPEX
  { key: 'ppcSpend', label: 'PPC', width: 110, format: 'currency', editable: true, align: 'right' },
  {
    key: 'grossProfit',
    label: 'Gross Profit',
    width: 120,
    format: 'currency',
    editable: false,
    align: 'right',
  },
  {
    key: 'grossMargin',
    label: 'GP %',
    width: 80,
    format: 'percent',
    editable: false,
    align: 'right',
  },
  // OPEX = Fixed Costs only (PPC is part of GP, not OPEX)
  {
    key: 'fixedCosts',
    label: 'OPEX (est.)',
    width: 110,
    format: 'currency',
    editable: true,
    align: 'right',
  },
  {
    key: 'netProfit',
    label: 'Net Profit',
    width: 120,
    format: 'currency',
    editable: false,
    align: 'right',
  },
  {
    key: 'netMargin',
    label: 'NP %',
    width: 80,
    format: 'percent',
    editable: false,
    align: 'right',
  },
];

type CellCoords = { row: number; col: number };
type CellRange = { from: CellCoords; to: CellCoords };

function normalizeRange(range: CellRange): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  return {
    top: Math.min(range.from.row, range.to.row),
    bottom: Math.max(range.from.row, range.to.row),
    left: Math.min(range.from.col, range.to.col),
    right: Math.max(range.from.col, range.to.col),
  };
}

function formatDisplayValue(
  value: string,
  format: 'text' | 'number' | 'currency' | 'percent',
  options: { locale: string; currency: string },
): string {
  if (format === 'text') return value;
  const numeric = sanitizeNumeric(value);
  if (!Number.isFinite(numeric)) return '';
  if (format === 'percent') return `${(numeric * 100).toFixed(1)}%`;
  if (format === 'currency') {
    return numeric.toLocaleString(options.locale, {
      style: 'currency',
      currency: options.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return numeric.toLocaleString(options.locale, { maximumFractionDigits: 2 });
}

function parseNumericCandidate(value: unknown): number | null {
  const numeric = sanitizeNumeric(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeSelectionStats(
  data: WeeklyRow[],
  columnKeys: DisplayColumnKey[],
  range: CellRange | null,
): SelectionStats | null {
  if (!range) return null;
  const { top, bottom, left, right } = normalizeRange(range);
  if (top < 0 || left < 0) return null;

  let cellCount = 0;
  let numericCount = 0;
  let sum = 0;

  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    const row = data[rowIndex];
    if (!row) continue;
    for (let colIndex = left; colIndex <= right; colIndex += 1) {
      const key = columnKeys[colIndex];
      if (!key) continue;
      cellCount += 1;
      const numeric = parseNumericCandidate(row[key]);
      if (numeric != null) {
        numericCount += 1;
        sum += numeric;
      }
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

export function ProfitAndLossGrid({ strategyId, strategyRegion, weekly }: ProfitAndLossGridProps) {
  const filters = useContext(ProfitAndLossFiltersContext);
  const showGpAfterPpc = filters?.showGpAfterPpc ?? false;
  const columnHelper = useMemo(() => createColumnHelper<WeeklyRow>(), []);
  const locale = localeForRegion(strategyRegion);
  const currency = currencyForRegion(strategyRegion);

  const [data, setData] = useState<WeeklyRow[]>(() => weekly.map((row) => ({ ...row })));
  useEffect(() => {
    setData(weekly.map((row) => ({ ...row })));
  }, [weekly]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);
  const pasteStartRef = useRef<CellCoords | null>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  usePersistentScroll(`hot:profit-and-loss:${strategyId}`, true, getScrollElement);

  const columns = useMemo(() => {
    return columnConfig.map((config) =>
      columnHelper.accessor(config.key, {
        id: config.key,
        header: () => config.label,
        meta: {
          width: config.width,
          format: config.format,
          editable: config.editable,
          align: config.align,
          sticky: config.key === 'weekLabel' || config.key === 'weekDate',
          stickyOffset: config.key === 'weekLabel' ? 0 : config.key === 'weekDate' ? 80 : undefined,
        },
      }),
    );
  }, [columnHelper]);

  const columnKeys = useMemo(() => columnConfig.map((c) => c.key), []);

  const columnLayout = useMemo(() => {
    const widths = columnConfig.map((config) => config.width);
    const offsets: number[] = [];
    let runningTotal = 0;
    for (const width of widths) {
      offsets.push(runningTotal);
      runningTotal += width;
    }
    const pinnedCount = columnConfig.filter((config) => config.sticky).length;
    const pinnedWidth = columnConfig
      .filter((config) => config.sticky)
      .reduce((sum, config) => sum + config.width, 0);
    return { widths, offsets, pinnedCount, pinnedWidth };
  }, []);

  const tableWidth = useMemo(() => columnConfig.reduce((sum, c) => sum + c.width, 0), []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const [activeCell, setActiveCell] = useState<CellCoords | null>(null);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);
  const selectionRange = useMemo(() => (selection ? normalizeRange(selection) : null), [selection]);

  const [editingCell, setEditingCell] = useState<{
    coords: CellCoords;
    key: DisplayColumnKey;
    value: string;
  } | null>(null);

  const handleFlush = useCallback(
    async (payload: UpdatePayload[]) => {
      if (payload.length === 0) return;
      try {
        const res = await fetch(withAppBasePath('/api/v1/xplan/profit-and-loss'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId, updates: payload }),
        });
        if (!res.ok) throw new Error('Failed to update P&L');
        toast.success('P&L updated');
      } catch (error) {
        console.error(error);
        toast.error('Unable to save P&L changes');
      }
    },
    [strategyId],
  );

  const { pendingRef, scheduleFlush, flushNow } = useMutationQueue<number, UpdatePayload>({
    debounceMs: 600,
    onFlush: handleFlush,
  });

  useEffect(() => {
    return () => {
      flushNow().catch(() => {});
    };
  }, [flushNow]);

  const applyUndoRedoEdits = useCallback(
    (edits: CellEdit<string>[]) => {
      if (edits.length === 0) return;

      setData((prev) => {
        const next = prev.slice();

        for (const edit of edits) {
          const rowIndex = Number(edit.rowKey);
          if (!Number.isFinite(rowIndex)) continue;
          if (rowIndex < 0 || rowIndex >= next.length) continue;

          const key = edit.field as DisplayColumnKey;
          if (!editableFields.has(key)) continue;

          const row = next[rowIndex];
          if (!row) continue;
          if ((row[key] ?? '') === edit.newValue) continue;

          next[rowIndex] = { ...row, [key]: edit.newValue };

          const weekNumber = Number(row.weekNumber);
          if (Number.isFinite(weekNumber)) {
            if (!pendingRef.current.has(weekNumber)) {
              pendingRef.current.set(weekNumber, { weekNumber, values: {} });
            }
            const entry = pendingRef.current.get(weekNumber);
            if (entry) {
              entry.values[key] = edit.newValue;
            }
          }
        }

        return next;
      });

      scheduleFlush();
      requestAnimationFrame(() => scrollRef.current?.focus());
    },
    [pendingRef, scheduleFlush],
  );

  const { recordEdits, undo, redo } = useGridUndoRedo<string>({
    maxHistory: 50,
    onApplyEdits: applyUndoRedoEdits,
  });

  const commitEditing = useCallback(() => {
    if (!editingCell) return;
    const { coords, key, value } = editingCell;
    const rowIndex = coords.row;
    const row = data[rowIndex];
    if (!row) {
      setEditingCell(null);
      requestAnimationFrame(() => scrollRef.current?.focus());
      return;
    }

    const formatted = formatNumericInput(value, 2);
    const currentValue = row[key] ?? '';
    if (formatted === currentValue) {
      setEditingCell(null);
      requestAnimationFrame(() => scrollRef.current?.focus());
      return;
    }
    const weekNumber = Number(row.weekNumber);

    recordEdits({
      rowKey: String(rowIndex),
      field: key,
      oldValue: currentValue,
      newValue: formatted,
    });

    setData((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [key]: formatted };
      return next;
    });

    if (!pendingRef.current.has(weekNumber)) {
      pendingRef.current.set(weekNumber, { weekNumber, values: {} });
    }
    const entry = pendingRef.current.get(weekNumber);
    if (entry) {
      entry.values[key] = formatted;
    }
    scheduleFlush();
    setEditingCell(null);
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, [data, editingCell, pendingRef, recordEdits, scheduleFlush]);

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

  const updateActiveSelection = useCallback(
    (nextCoords: CellCoords, { extendSelection }: { extendSelection: boolean }) => {
      setActiveCell(nextCoords);

      if (extendSelection && selectionAnchorRef.current) {
        setSelection({ from: selectionAnchorRef.current, to: nextCoords });
      } else {
        selectionAnchorRef.current = nextCoords;
        setSelection({ from: nextCoords, to: nextCoords });
      }

      requestAnimationFrame(() => ensureCellVisible(nextCoords));
    },
    [ensureCellVisible],
  );

  const moveActiveCell = useCallback(
    (deltaRow: number, deltaCol: number, options: { extendSelection?: boolean } = {}) => {
      if (!activeCell) return;
      if (data.length === 0 || columnKeys.length === 0) return;
      const newRow = Math.max(0, Math.min(data.length - 1, activeCell.row + deltaRow));
      const newCol = Math.max(0, Math.min(columnKeys.length - 1, activeCell.col + deltaCol));
      const nextCoords = { row: newRow, col: newCol };
      updateActiveSelection(nextCoords, { extendSelection: Boolean(options.extendSelection) });
    },
    [activeCell, columnKeys.length, data.length, updateActiveSelection],
  );

  const buildClipboardText = useCallback(
    (range: CellRange): string => {
      const { top, bottom, left, right } = normalizeRange(range);
      const lines: string[] = [];
      for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
        const row = data[rowIndex];
        if (!row) continue;
        const cells: string[] = [];
        for (let colIndex = left; colIndex <= right; colIndex += 1) {
          const key = columnKeys[colIndex];
          cells.push(key ? row[key] : '');
        }
        lines.push(cells.join('\t'));
      }
      return lines.join('\n');
    },
    [data, columnKeys],
  );

  const copySelectionToClipboard = useCallback(() => {
    const range = selection ?? (activeCell ? { from: activeCell, to: activeCell } : null);
    if (!range) return;

    const text = buildClipboardText(range);
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
  }, [activeCell, selection, buildClipboardText]);

  const applyPastedText = useCallback(
    (text: string, start: CellCoords) => {
      const rows = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (rows.length === 0) return;

      const updates: Array<{ rowIndex: number; key: DisplayColumnKey; value: string }> = [];
      const undoEdits: CellEdit<string>[] = [];

      for (let r = 0; r < rows.length; r += 1) {
        for (let c = 0; c < rows[r]!.length; c += 1) {
          const targetRow = start.row + r;
          const targetCol = start.col + c;
          if (targetRow >= data.length) continue;
          if (targetCol >= columnConfig.length) continue;

          const config = columnConfig[targetCol];
          if (!config?.editable) continue;

          const row = data[targetRow];
          if (!row) continue;
          const currentValue = row[config.key] ?? '';

          const formatted = formatNumericInput(rows[r]![c] ?? '', 2);
          if (formatted === currentValue) continue;

          updates.push({ rowIndex: targetRow, key: config.key, value: formatted });
          undoEdits.push({
            rowKey: String(targetRow),
            field: config.key,
            oldValue: currentValue,
            newValue: formatted,
          });
        }
      }

      if (updates.length === 0) return;

      recordEdits(undoEdits);

      setData((prev) => {
        const next = prev.slice();
        for (const update of updates) {
          const row = next[update.rowIndex];
          if (!row) continue;

          next[update.rowIndex] = { ...row, [update.key]: update.value };

          const weekNumber = Number(row.weekNumber);
          if (Number.isFinite(weekNumber)) {
            if (!pendingRef.current.has(weekNumber)) {
              pendingRef.current.set(weekNumber, { weekNumber, values: {} });
            }
            const entry = pendingRef.current.get(weekNumber);
            if (entry) {
              entry.values[update.key] = update.value;
            }
          }
        }
        return next;
      });

      scheduleFlush();
      requestAnimationFrame(() => scrollRef.current?.focus());
    },
    [data, pendingRef, recordEdits, scheduleFlush],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (!activeCell) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'v') {
        const clipboard = clipboardRef.current;
        if (!clipboard) return;
        pasteStartRef.current = { ...activeCell };
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

      if (e.key === 'F2') {
        const config = columnConfig[activeCell.col];
        if (config?.editable) {
          e.preventDefault();
          selectionAnchorRef.current = activeCell;
          setSelection({ from: activeCell, to: activeCell });
          const row = data[activeCell.row];
          if (row) {
            setEditingCell({
              coords: activeCell,
              key: config.key,
              value: row[config.key],
            });
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        const config = columnConfig[activeCell.col];
        if (config?.editable) {
          e.preventDefault();
          selectionAnchorRef.current = activeCell;
          setSelection({ from: activeCell, to: activeCell });
          const row = data[activeCell.row];
          if (row) {
            setEditingCell({
              coords: activeCell,
              key: config.key,
              value: row[config.key],
            });
          }
          return;
        }

        e.preventDefault();
        moveActiveCell(1, 0);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const range = selection ?? { from: activeCell, to: activeCell };
        const { top, bottom, left, right } = normalizeRange(range);
        const updates: Array<{ rowIndex: number; key: DisplayColumnKey; oldValue: string }> = [];

        for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
          const row = data[rowIndex];
          if (!row) continue;

          for (let colIndex = left; colIndex <= right; colIndex += 1) {
            const config = columnConfig[colIndex];
            if (!config?.editable) continue;

            const currentValue = row[config.key] ?? '';
            if (!currentValue) continue;

            updates.push({ rowIndex, key: config.key, oldValue: currentValue });
          }
        }

        if (updates.length === 0) return;

        recordEdits(
          updates.map((update) => ({
            rowKey: String(update.rowIndex),
            field: update.key,
            oldValue: update.oldValue,
            newValue: '',
          })),
        );

        setData((prev) => {
          const next = prev.slice();
          for (const update of updates) {
            const row = next[update.rowIndex];
            if (!row) continue;

            next[update.rowIndex] = { ...row, [update.key]: '' };

            const weekNumber = Number(row.weekNumber);
            if (Number.isFinite(weekNumber)) {
              if (!pendingRef.current.has(weekNumber)) {
                pendingRef.current.set(weekNumber, { weekNumber, values: {} });
              }
              const entry = pendingRef.current.get(weekNumber);
              if (entry) {
                entry.values[update.key] = '';
              }
            }
          }
          return next;
        });

        scheduleFlush();
        return;
      }

      if (/^[0-9.,-]$/.test(e.key)) {
        const config = columnConfig[activeCell.col];
        if (!config?.editable) return;
        e.preventDefault();
        selectionAnchorRef.current = activeCell;
        setSelection({ from: activeCell, to: activeCell });
        setEditingCell({ coords: activeCell, key: config.key, value: e.key });
        return;
      }

      const jump = e.ctrlKey || e.metaKey;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveActiveCell(jump ? data.length : 1, 0, { extendSelection: e.shiftKey });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveActiveCell(jump ? -data.length : -1, 0, { extendSelection: e.shiftKey });
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        moveActiveCell(0, e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveActiveCell(0, jump ? columnKeys.length : 1, { extendSelection: e.shiftKey });
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveActiveCell(0, jump ? -columnKeys.length : -1, { extendSelection: e.shiftKey });
        return;
      }
      if (e.key === 'Escape') {
        selectionAnchorRef.current = null;
        setSelection(null);
        setActiveCell(null);
      }
    },
    [
      activeCell,
      columnKeys.length,
      copySelectionToClipboard,
      data,
      editingCell,
      moveActiveCell,
      pendingRef,
      recordEdits,
      redo,
      scheduleFlush,
      selection,
      undo,
    ],
  );

  useEffect(() => {
    if (!editingCell) return;
    const coords = editingCell.coords;
    selectionAnchorRef.current = coords;
    setActiveCell(coords);
    setSelection({ from: coords, to: coords });
    requestAnimationFrame(() => ensureCellVisible(coords));
  }, [editingCell, ensureCellVisible]);

  const handleCopy = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!selection) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', buildClipboardText(selection));
    },
    [selection, buildClipboardText],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      const clipboard = clipboardRef.current;
      const refocusClipboard = () => {
        if (clipboard) clipboard.value = '';
        requestAnimationFrame(() => scrollRef.current?.focus());
      };

      const fallbackStart = pasteStartRef.current ?? activeCell;
      pasteStartRef.current = null;

      const normalizedSelection = selection ? normalizeRange(selection) : null;
      const hasMultiSelection =
        normalizedSelection &&
        (normalizedSelection.top !== normalizedSelection.bottom ||
          normalizedSelection.left !== normalizedSelection.right);
      const start = normalizedSelection
        ? { row: normalizedSelection.top, col: normalizedSelection.left }
        : fallbackStart;

      if (!start) {
        refocusClipboard();
        return;
      }
      const text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (!text) {
        refocusClipboard();
        return;
      }

      const rows = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (rows.length === 0) {
        refocusClipboard();
        return;
      }

      if (hasMultiSelection && rows.length === 1 && rows[0]?.length === 1 && normalizedSelection) {
        const rawValue = rows[0]?.[0] ?? '';
        const rowCount = normalizedSelection.bottom - normalizedSelection.top + 1;
        const colCount = normalizedSelection.right - normalizedSelection.left + 1;
        const expandedText = new Array(rowCount)
          .fill(0)
          .map(() => new Array(colCount).fill(rawValue).join('\t'))
          .join('\n');
        applyPastedText(expandedText, start);
      } else {
        applyPastedText(text, start);
      }
      refocusClipboard();
    },
    [activeCell, applyPastedText, selection],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (editingCell) return;
      scrollRef.current?.focus();
      const coords = { row: rowIndex, col: colIndex };
      updateActiveSelection(coords, { extendSelection: e.shiftKey });
    },
    [editingCell, updateActiveSelection],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (!e.buttons) return;
      if (!selectionAnchorRef.current) return;
      setSelection({ from: selectionAnchorRef.current, to: { row: rowIndex, col: colIndex } });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {}, []);

  const handleDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      const config = columnConfig[colIndex];
      if (!config?.editable) return;
      const row = data[rowIndex];
      if (!row) return;
      setEditingCell({
        coords: { row: rowIndex, col: colIndex },
        key: config.key,
        value: row[config.key],
      });
    },
    [data],
  );

  useEffect(() => {
    setSelectionStats(computeSelectionStats(data, columnKeys, selection));
  }, [data, columnKeys, selection]);

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
          onPaste={handlePaste}
        />
        <div
          ref={scrollRef}
          tabIndex={0}
          className="h-full overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
              {columnConfig.map((config) => (
                <col
                  key={config.key}
                  style={{ width: config.width, minWidth: config.width, maxWidth: config.width }}
                />
              ))}
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columnConfig.map((config) => (
                  <TableHead
                    key={config.key}
                    className={cn(
                      'sticky top-0 z-20 h-10 whitespace-nowrap border-b border-r px-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80',
                      config.editable ? 'bg-cyan-100/90 dark:bg-cyan-900/50' : 'bg-muted',
                      config.sticky && 'z-30',
                    )}
                    style={{
                      left: config.sticky ? config.stickyOffset : undefined,
                      width: config.width,
                      minWidth: config.width,
                      maxWidth: config.width,
                    }}
                  >
                    {config.key === 'grossProfit' && showGpAfterPpc
                      ? 'GP (after PPC)'
                      : config.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  className={cn('hover:bg-transparent', rowIndex % 2 === 1 && 'bg-muted/30')}
                >
                  {columnConfig.map((config, colIndex) => {
                    const isSelected = selectionRange
                      ? rowIndex >= selectionRange.top &&
                        rowIndex <= selectionRange.bottom &&
                        colIndex >= selectionRange.left &&
                        colIndex <= selectionRange.right
                      : false;
                    const isCurrent = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                    const isEditing =
                      editingCell?.coords.row === rowIndex && editingCell?.coords.col === colIndex;
                    const isEvenRow = rowIndex % 2 === 1;
                    const isPinned = config.sticky;
                    const isWeekCellWithActualData =
                      config.key === 'weekLabel' && row.original.hasActualData === 'true';
                    const boxShadow = getSelectionBorderBoxShadow(selectionRange, {
                      row: rowIndex,
                      col: colIndex,
                    });

                    // Adjust GP and GP% when showGpAfterPpc is enabled
                    let rawValue = row.original[config.key];
                    if (showGpAfterPpc && config.key === 'grossProfit') {
                      const gp = sanitizeNumeric(row.original.grossProfit);
                      const ppc = sanitizeNumeric(row.original.ppcSpend);
                      rawValue = String(gp - ppc);
                    } else if (showGpAfterPpc && config.key === 'grossMargin') {
                      const gp = sanitizeNumeric(row.original.grossProfit);
                      const ppc = sanitizeNumeric(row.original.ppcSpend);
                      const revenue = sanitizeNumeric(row.original.revenue);
                      const adjustedGp = gp - ppc;
                      rawValue = revenue > 0 ? String(adjustedGp / revenue) : '0';
                    }
                    const displayValue = formatDisplayValue(rawValue, config.format, { locale, currency });

                    const cellContent = isEditing ? (
                      <input
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
                        className="h-8 w-full min-w-0 rounded-none border-0 bg-transparent p-0 text-right text-sm font-medium shadow-none focus:bg-background focus:outline-none"
                      />
                    ) : config.key === 'weekLabel' ? (
                      <span className="flex items-center gap-1">
                        {displayValue}
                        <RealWeekIndicator
                          hasActualData={row.original.hasActualData === 'true'}
                          isIncompleteWeek={row.original.isCurrentWeek === 'true'}
                        />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'block min-w-0 truncate tabular-nums',
                          config.align === 'left' ? 'text-left' : 'text-right',
                        )}
                      >
                        {displayValue}
                      </span>
                    );

                    return (
                      <TableCell
                        key={config.key}
                        className={cn(
                          'h-8 whitespace-nowrap border-r px-2 py-0 text-sm overflow-hidden',
                          isPinned
                            ? isEvenRow
                              ? 'bg-muted'
                              : 'bg-card'
                            : isEvenRow
                              ? 'bg-muted/30'
                              : 'bg-card',
                          isWeekCellWithActualData &&
                            'bg-cyan-100 dark:bg-cyan-900/50',
                          isPinned && 'sticky z-10',
                          colIndex === 1 && 'border-r-2',
                          config.editable &&
                            'cursor-text font-medium bg-cyan-50/80 dark:bg-cyan-950/40',
                          isSelected && 'bg-accent',
                          isCurrent && 'ring-2 ring-inset ring-cyan-600 dark:ring-cyan-400',
                        )}
                        style={{
                          left: isPinned ? config.stickyOffset : undefined,
                          width: config.width,
                          minWidth: config.width,
                          maxWidth: config.width,
                          boxShadow,
                        }}
                        onPointerDown={(e) => handlePointerDown(e, rowIndex, colIndex)}
                        onPointerMove={(e) => handlePointerMove(e, rowIndex, colIndex)}
                        onPointerUp={handlePointerUp}
                        onDoubleClick={() => handleDoubleClick(rowIndex, colIndex)}
                      >
                        {cellContent}
                      </TableCell>
                    );
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
