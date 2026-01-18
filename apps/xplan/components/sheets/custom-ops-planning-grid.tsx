'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { toast } from 'sonner';
import Flatpickr from 'react-flatpickr';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { useMutationQueue } from '@/hooks/useMutationQueue';
import { useGridUndoRedo, type CellEdit } from '@/hooks/useGridUndoRedo';
import { toIsoDate, formatDateDisplay } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import { getSelectionBorderBoxShadow } from '@/lib/grid/selection-border';
import { formatNumericInput, sanitizeNumeric } from '@/components/sheets/validators';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { withAppBasePath } from '@/lib/base-path';

export type OpsInputRow = {
  id: string;
  productId: string;
  orderCode: string;
  poDate: string;
  productionStart: string;
  productionComplete: string;
  sourceDeparture: string;
  portEta: string;
  availableDate: string;
  shipName: string;
  containerNumber: string;
  productName: string;
  quantity: string;
  pay1Date: string;
  productionWeeks: string;
  sourceWeeks: string;
  oceanWeeks: string;
  finalWeeks: string;
  sellingPrice: string;
  manufacturingCost: string;
  freightCost: string;
  tariffRate: string;
  tacosPercent: string;
  fbaFee: string;
  referralRate: string;
  storagePerMonth: string;
  status: string;
};

interface CustomOpsPlanningGridProps {
  rows: OpsInputRow[];
  activeOrderId?: string | null;
  scrollKey?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onRowsChange?: (rows: OpsInputRow[]) => void;
  onCreateOrder?: () => void;
  onImportFromTalos?: () => void;
  onDuplicateOrder?: (orderId: string) => void;
  onDeleteOrder?: (orderId: string) => void;
  disableCreate?: boolean;
  disableImport?: boolean;
  disableDuplicate?: boolean;
  disableDelete?: boolean;
}

const STAGE_CONFIG = [
  { weeksKey: 'productionWeeks', overrideKey: 'productionComplete' },
  { weeksKey: 'sourceWeeks', overrideKey: 'sourceDeparture' },
  { weeksKey: 'oceanWeeks', overrideKey: 'portEta' },
  { weeksKey: 'finalWeeks', overrideKey: 'availableDate' },
] as const;

type StageWeeksKey = (typeof STAGE_CONFIG)[number]['weeksKey'];
type StageOverrideKey = (typeof STAGE_CONFIG)[number]['overrideKey'];

const STAGE_OVERRIDE_FIELDS: Record<StageWeeksKey, StageOverrideKey> = STAGE_CONFIG.reduce(
  (map, item) => {
    map[item.weeksKey] = item.overrideKey;
    return map;
  },
  {} as Record<StageWeeksKey, StageOverrideKey>,
);

const NUMERIC_PRECISION: Partial<Record<keyof OpsInputRow, number>> = {
  quantity: 0,
  productionWeeks: 2,
  sourceWeeks: 2,
  oceanWeeks: 2,
  finalWeeks: 2,
  sellingPrice: 2,
  manufacturingCost: 2,
  freightCost: 2,
  tariffRate: 2,
  tacosPercent: 2,
  fbaFee: 2,
  referralRate: 2,
  storagePerMonth: 2,
};

const NUMERIC_FIELDS = new Set<keyof OpsInputRow>([
  'quantity',
  'productionWeeks',
  'sourceWeeks',
  'oceanWeeks',
  'finalWeeks',
  'sellingPrice',
  'manufacturingCost',
  'freightCost',
  'tariffRate',
  'tacosPercent',
  'fbaFee',
  'referralRate',
  'storagePerMonth',
]);

const DATE_FIELDS = new Set<keyof OpsInputRow>([
  'poDate',
  'productionStart',
  'pay1Date',
  'productionComplete',
  'sourceDeparture',
  'portEta',
  'availableDate',
]);

function addWeeks(base: Date, weeks: number): Date {
  const ms = base.getTime() + weeks * 7 * 24 * 60 * 60 * 1000;
  return new Date(ms);
}

function parseWeeks(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveStageStart(row: OpsInputRow, stage: StageWeeksKey): Date | null {
  const index = STAGE_CONFIG.findIndex((item) => item.weeksKey === stage);
  if (index <= 0) {
    return parseIsoDate(row.poDate);
  }
  const previous = STAGE_CONFIG[index - 1];
  const override = parseIsoDate(row[previous.overrideKey]);
  if (override) return override;
  const previousStart = resolveStageStart(row, previous.weeksKey);
  if (!previousStart) return null;
  const previousWeeks = parseWeeks(row[previous.weeksKey]);
  if (previousWeeks == null) return null;
  return addWeeks(previousStart, previousWeeks);
}

function resolveStageEnd(row: OpsInputRow, stage: StageWeeksKey): Date | null {
  const override = parseIsoDate(row[STAGE_OVERRIDE_FIELDS[stage]]);
  if (override) return override;
  const start = resolveStageStart(row, stage);
  if (!start) return null;
  const weeks = parseWeeks(row[stage]);
  if (weeks == null) return null;
  return addWeeks(start, weeks);
}

/**
 * Calculate weeks from date differences (for read-only weeks display).
 * - productionWeeks = (productionComplete - productionStart) / 7
 * - sourceWeeks = (sourceDeparture - productionComplete) / 7
 * - oceanWeeks = (portEta - sourceDeparture) / 7
 * - finalWeeks = (availableDate - portEta) / 7
 */
function calculateWeeksFromDates(row: OpsInputRow, stageKey: StageWeeksKey): number | null {
  const stageIndex = STAGE_CONFIG.findIndex((s) => s.weeksKey === stageKey);
  if (stageIndex < 0) return null;

  const stage = STAGE_CONFIG[stageIndex];
  const endDate = parseIsoDate(row[stage.overrideKey]);
  if (!endDate) return null;

  let startDate: Date | null = null;

  if (stageKey === 'productionWeeks') {
    // Manufacturing weeks: from productionStart to productionComplete
    startDate = parseIsoDate(row.productionStart);
  } else {
    // Other stages: from previous stage end to this stage end
    const prevStage = STAGE_CONFIG[stageIndex - 1];
    if (prevStage) {
      startDate = parseIsoDate(row[prevStage.overrideKey]);
    }
  }

  if (!startDate) return null;

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const diffMs = endDate.getTime() - startDate.getTime();
  return diffMs / MS_PER_WEEK;
}

function validateStageDates(row: OpsInputRow): string | null {
  const poDate = parseIsoDate(row.poDate);
  const productionStart = parseIsoDate(row.productionStart);
  const productionComplete = parseIsoDate(row.productionComplete);
  const sourceDeparture = parseIsoDate(row.sourceDeparture);
  const portEta = parseIsoDate(row.portEta);
  const warehouse = parseIsoDate(row.availableDate);

  if (poDate) {
    const checks = [
      { label: 'Mfg Start', date: productionStart },
      { label: 'Mfg Done', date: productionComplete },
      { label: 'Departure', date: sourceDeparture },
      { label: 'Port Arrival', date: portEta },
      { label: 'Warehouse', date: warehouse },
    ] as const;

    for (const check of checks) {
      if (check.date && check.date.getTime() < poDate.getTime()) {
        return `${check.label} must be on or after PO Date`;
      }
    }
  }

  if (
    productionStart &&
    productionComplete &&
    productionComplete.getTime() < productionStart.getTime()
  ) {
    return 'Mfg Done must be on or after Mfg Start';
  }

  if (
    productionComplete &&
    sourceDeparture &&
    sourceDeparture.getTime() < productionComplete.getTime()
  ) {
    return 'Departure must be on or after Mfg Done';
  }

  if (sourceDeparture && portEta && portEta.getTime() < sourceDeparture.getTime()) {
    return 'Port Arrival must be on or after Departure';
  }

  if (portEta && warehouse && warehouse.getTime() < portEta.getTime()) {
    return 'Warehouse must be on or after Port Arrival';
  }

  return null;
}

function recomputeStageDates(
  record: OpsInputRow,
  entry: { values: Record<string, string | null> },
  options: { anchorStage?: StageWeeksKey | null } = {},
): OpsInputRow {
  const anchorStage = options.anchorStage ?? null;
  let working = { ...record };

  const baseStart = parseIsoDate(working.poDate);
  if (!baseStart) {
    for (const stage of STAGE_CONFIG) {
      if (working[stage.overrideKey] !== '') {
        working = { ...working, [stage.overrideKey]: '' as OpsInputRow[StageOverrideKey] };
        entry.values[stage.overrideKey] = '';
      }
    }
    return working;
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let currentStart = baseStart;

  for (const stage of STAGE_CONFIG) {
    const weeksKey = stage.weeksKey;
    const overrideKey = stage.overrideKey;

    let stageEnd: Date | null = null;

    // If the user just edited a stage end date, treat it as the anchor for this stage and
    // recompute its weeks to match exactly, then derive all downstream stages from it.
    if (anchorStage === weeksKey) {
      const anchored = parseIsoDate(working[overrideKey]);
      if (anchored) {
        stageEnd = anchored;
        const diffDays = (anchored.getTime() - currentStart.getTime()) / MS_PER_DAY;
        const weeks = Math.max(0, diffDays / 7);
        const normalizedWeeks = formatNumericInput(weeks, 2);
        if (working[weeksKey] !== normalizedWeeks) {
          working = { ...working, [weeksKey]: normalizedWeeks as OpsInputRow[StageWeeksKey] };
          entry.values[weeksKey] = normalizedWeeks;
        }
      }
    }

    if (!stageEnd) {
      const weeks = parseWeeks(working[weeksKey]) ?? 0;
      stageEnd = addWeeks(currentStart, weeks);
    }

    const iso = stageEnd ? (toIsoDate(stageEnd) ?? '') : '';
    if (working[overrideKey] !== iso) {
      working = { ...working, [overrideKey]: iso as OpsInputRow[StageOverrideKey] };
      entry.values[overrideKey] = iso;
    }

    currentStart = stageEnd;
  }

  return working;
}

function normalizeNumeric(value: unknown, fractionDigits = 2): string {
  return formatNumericInput(value, fractionDigits);
}

function validateNumeric(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const parsed = sanitizeNumeric(value);
  return !Number.isNaN(parsed);
}

function validatePositiveNumeric(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const parsed = sanitizeNumeric(value);
  return !Number.isNaN(parsed) && parsed > 0;
}

function validateDate(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const date = parseIsoDate(value);
  return date !== null;
}

type ColumnDef = {
  key: keyof OpsInputRow;
  header: string;
  headerWeeks?: string;
  headerDates?: string;
  width: number;
  type: 'text' | 'numeric' | 'date' | 'stage' | 'dropdown';
  editable?: boolean;
  precision?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
};

const PURCHASE_ORDER_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'OCEAN', label: 'Ocean' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'SHIPPED', label: 'Shipped' },
] as const;

type PurchaseOrderStatusValue = (typeof PURCHASE_ORDER_STATUS_OPTIONS)[number]['value'];

function normalizePurchaseOrderStatus(value: string): PurchaseOrderStatusValue | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase().replace(/[^A-Z]/g, '');
  switch (normalized) {
    case 'DRAFT':
      return 'DRAFT';
    case 'ISSUED':
    case 'PLANNED':
      return 'ISSUED';
    case 'MANUFACTURING':
    case 'PRODUCTION':
      return 'MANUFACTURING';
    case 'OCEAN':
    case 'INTRANSIT':
    case 'TRANSIT':
      return 'OCEAN';
    case 'WAREHOUSE':
    case 'ARRIVED':
      return 'WAREHOUSE';
    case 'SHIPPED':
    case 'ARCHIVED':
    case 'CLOSED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'SHIPPED';
    default:
      return null;
  }
}

function formatPurchaseOrderStatus(value: string): string {
  const normalized = normalizePurchaseOrderStatus(value);
  if (!normalized) return value;
  return (
    PURCHASE_ORDER_STATUS_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized
  );
}

const COLUMNS: ColumnDef[] = [
  { key: 'orderCode', header: 'PO Code', width: 150, type: 'text', editable: true },
  { key: 'poDate', header: 'PO Date', width: 130, type: 'date', editable: true },
  { key: 'shipName', header: 'Ship', width: 160, type: 'text', editable: true },
  { key: 'containerNumber', header: 'Container #', width: 160, type: 'text', editable: true },
  {
    key: 'status',
    header: 'Status',
    width: 130,
    type: 'dropdown',
    editable: true,
    options: PURCHASE_ORDER_STATUS_OPTIONS,
  },
  { key: 'productionStart', header: 'Mfg Start', width: 130, type: 'date', editable: true },
  {
    key: 'productionWeeks',
    header: 'Manufacturing',
    headerWeeks: 'Mfg (wk)',
    headerDates: 'Mfg Done',
    width: 130,
    type: 'stage',
    editable: true,
    precision: 2,
  },
  {
    key: 'sourceWeeks',
    header: 'Ocean Departure',
    headerWeeks: 'Depart (wk)',
    headerDates: 'Departure',
    width: 130,
    type: 'stage',
    editable: true,
    precision: 2,
  },
  {
    key: 'oceanWeeks',
    header: 'Ocean Transit',
    headerWeeks: 'Arrival (wk)',
    headerDates: 'Port Arrival',
    width: 130,
    type: 'stage',
    editable: true,
    precision: 2,
  },
  {
    key: 'finalWeeks',
    header: 'Final Delivery',
    headerWeeks: 'WH (wk)',
    headerDates: 'Warehouse',
    width: 130,
    type: 'stage',
    editable: true,
    precision: 2,
  },
];

type StageMode = 'weeks' | 'dates';

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

function parseNumericCandidate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const CELL_ID_PREFIX = 'xplan-ops-po';

function sanitizeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cellDomId(rowId: string, colKey: keyof OpsInputRow): string {
  return `${CELL_ID_PREFIX}:${sanitizeDomId(rowId)}:${String(colKey)}`;
}

function isGridEditableColumn(column: ColumnDef, _stageMode: StageMode): boolean {
  if ((column.editable ?? true) === false) return false;
  return true;
}

function getCellEditValue(row: OpsInputRow, column: ColumnDef, stageMode: StageMode): string {
  if (column.type === 'stage') {
    if (stageMode === 'dates') {
      // Return the date override field directly for editing
      const stageField = column.key as StageWeeksKey;
      const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
      return row[overrideField] ?? '';
    } else {
      // Weeks mode shows the derived duration between milestone dates.
      const weeks = calculateWeeksFromDates(row, column.key as StageWeeksKey);
      return weeks !== null ? formatNumericInput(weeks, 2) : '';
    }
  }

  if (column.type === 'date') {
    return toIsoDate(row[column.key]) ?? '';
  }

  if (column.type === 'dropdown') {
    const currentValue = row[column.key] ?? '';
    return normalizePurchaseOrderStatus(currentValue) ?? 'ISSUED';
  }

  return row[column.key] ?? '';
}

function getCellFormattedValue(row: OpsInputRow, column: ColumnDef, stageMode: StageMode): string {
  if (column.type === 'stage') {
    if (stageMode === 'weeks') {
      // Calculate weeks from dates (derived value)
      const weeks = calculateWeeksFromDates(row, column.key as StageWeeksKey);
      if (weeks === null) return '';
      return formatNumericInput(weeks, 2);
    } else {
      // Show the date
      const stageField = column.key as StageWeeksKey;
      const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
      const dateValue = row[overrideField];
      return dateValue ? formatDateDisplay(dateValue) : '';
    }
  }

  if (column.type === 'date') {
    const isoValue = row[column.key];
    return isoValue ? formatDateDisplay(isoValue) : '';
  }

  if (column.type === 'dropdown') {
    return formatPurchaseOrderStatus(row[column.key] ?? '');
  }

  return row[column.key] ?? '';
}

type CustomOpsPlanningRowProps = {
  row: OpsInputRow;
  rowIndex: number;
  stageMode: StageMode;
  isActive: boolean;
  activeColKey: keyof OpsInputRow | null;
  editingColKey: keyof OpsInputRow | null;
  editValue: string;
  selection: CellRange | null;
  inputRef: { current: HTMLInputElement | HTMLSelectElement | null };
  onSelectCell: (rowId: string, colKey: keyof OpsInputRow) => void;
  onStartEditing: (rowId: string, colKey: keyof OpsInputRow, currentValue: string) => void;
  onSetEditValue: (value: string) => void;
  onCommitEdit?: (nextValue?: string) => void;
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onPointerDown?: (
    e: PointerEvent<HTMLTableCellElement>,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onPointerMove?: (
    e: PointerEvent<HTMLTableCellElement>,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onPointerUp?: () => void;
};

const CustomOpsPlanningRow = memo(function CustomOpsPlanningRow({
  row,
  rowIndex,
  stageMode,
  isActive,
  activeColKey,
  editingColKey,
  editValue,
  selection,
  inputRef,
  onSelectCell,
  onStartEditing,
  onSetEditValue,
  onCommitEdit,
  onInputKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: CustomOpsPlanningRowProps) {
  const isEvenRow = rowIndex % 2 === 1;
  const selectionRange = selection ? normalizeRange(selection) : null;
  const datePickerOpenRef = useRef(false);

  // Check if this cell is in selection range
  const isCellInSelection = (colIndex: number): boolean => {
    if (!selectionRange) return false;
    return (
      rowIndex >= selectionRange.top &&
      rowIndex <= selectionRange.bottom &&
      colIndex >= selectionRange.left &&
      colIndex <= selectionRange.right
    );
  };

  return (
    <TableRow
      className={cn(
        'hover:bg-transparent',
        isEvenRow ? 'bg-muted/30' : 'bg-card',
        isActive && 'bg-cyan-50/70 dark:bg-cyan-900/20',
      )}
    >
      {COLUMNS.map((column, colIndex) => {
        const isEditing = editingColKey === column.key;
        const isEditable = column.editable !== false;
        const isDateCell =
          column.type === 'date' || (column.type === 'stage' && stageMode === 'dates');
        const isDropdownCell = column.type === 'dropdown';
        const isNumericCell =
          column.type === 'numeric' || (column.type === 'stage' && stageMode === 'weeks');

        const isCurrentCell = activeColKey === column.key;
        const isSelected = isCellInSelection(colIndex);
        const boxShadow = getSelectionBorderBoxShadow(selectionRange, {
          row: rowIndex,
          col: colIndex,
        });

        const cellClassName = cn(
          'h-8 overflow-hidden whitespace-nowrap border-r p-0 align-middle text-sm',
          colIndex === 0 && isActive && 'border-l-4 border-cyan-600 dark:border-cyan-400',
          isNumericCell && 'text-right',
          isEditable
            ? isDropdownCell
              ? 'cursor-pointer bg-accent/50 font-medium'
              : 'cursor-text bg-accent/50 font-medium'
            : 'bg-muted/50 text-muted-foreground',
          isSelected && 'bg-accent',
          (isEditing || isCurrentCell) && 'ring-2 ring-inset ring-cyan-600 dark:ring-cyan-400',
          colIndex === COLUMNS.length - 1 && 'border-r-0',
        );

        const inputClassName = cn(
          'h-8 w-full bg-transparent px-3 text-sm font-semibold text-foreground outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring',
          isNumericCell && 'text-right',
        );

        if (isEditing && onCommitEdit) {
          return (
            <TableCell
              key={column.key}
              className={cellClassName}
              style={{ width: column.width, minWidth: column.width, boxShadow }}
            >
              {isDropdownCell ? (
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={editValue}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onSetEditValue(event.target.value)
                  }
                  onKeyDown={onInputKeyDown}
                  onBlur={() => onCommitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="h-8 w-full bg-transparent px-3 text-sm font-medium text-foreground outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring"
                >
                  {column.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : isDateCell ? (
                <Flatpickr
                  value={editValue}
                  options={{
                    dateFormat: 'Y-m-d',
                    allowInput: true,
                    disableMobile: true,
                    onReady: (_selectedDates: Date[], _dateStr: string, instance: any) => {
                      datePickerOpenRef.current = true;
                      requestAnimationFrame(() => instance.open());
                    },
                    onOpen: () => {
                      datePickerOpenRef.current = true;
                    },
                    onClose: (_dates: Date[], dateStr: string) => {
                      datePickerOpenRef.current = false;
                      onCommitEdit(dateStr || editValue);
                    },
                  }}
                  onChange={(_dates: Date[], dateStr: string) => {
                    onSetEditValue(dateStr);
                  }}
                  render={(_props: any, handleNodeChange: (node: HTMLElement | null) => void) => (
                    <input
                      ref={(node) => {
                        handleNodeChange(node);
                        inputRef.current = node as HTMLInputElement | null;
                      }}
                      type="text"
                      value={editValue}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onSetEditValue(event.target.value)
                      }
                      onKeyDown={onInputKeyDown}
                      onBlur={() => {
                        if (!datePickerOpenRef.current) {
                          onCommitEdit();
                        }
                      }}
                      className={inputClassName}
                      placeholder="YYYY-MM-DD"
                    />
                  )}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={editValue}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onSetEditValue(event.target.value)
                  }
                  onKeyDown={onInputKeyDown}
                  onBlur={() => onCommitEdit()}
                  className={inputClassName}
                />
              )}
            </TableCell>
          );
        }

        const formattedValue = getCellFormattedValue(row, column, stageMode);
        const showPlaceholder = isDateCell && !formattedValue;

        return (
          <TableCell
            key={column.key}
            id={cellDomId(row.id, column.key)}
            className={cellClassName}
            style={{ width: column.width, minWidth: column.width, boxShadow }}
            title={showPlaceholder ? undefined : formattedValue}
            onPointerDown={(e) => onPointerDown?.(e, rowIndex, colIndex)}
            onPointerMove={(e) => onPointerMove?.(e, rowIndex, colIndex)}
            onPointerUp={onPointerUp}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (!isEditable) return;
              onStartEditing(row.id, column.key, getCellEditValue(row, column, stageMode));
            }}
          >
            <div
              className={cn('flex h-8 min-w-0 items-center px-3', isNumericCell && 'justify-end')}
            >
              {showPlaceholder ? (
                <span className="px-3 text-xs italic text-muted-foreground">
                  Click to select date
                </span>
              ) : (
                <span className={cn('block min-w-0 truncate', isNumericCell && 'tabular-nums')}>
                  {formattedValue}
                </span>
              )}
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
});

export function CustomOpsPlanningGrid({
  rows,
  activeOrderId,
  scrollKey,
  onSelectOrder,
  onRowsChange,
  onCreateOrder,
  onImportFromTalos,
  onDuplicateOrder,
  onDeleteOrder,
  disableCreate,
  disableImport,
  disableDuplicate,
  disableDelete,
}: CustomOpsPlanningGridProps) {
  const [stageMode, setStageMode] = useState<StageMode>('dates');
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: keyof OpsInputRow;
  } | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: keyof OpsInputRow } | null>(
    null,
  );
  const [editValue, setEditValue] = useState<string>('');
  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const selectOnFocusRef = useRef(true);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);
  const pasteStartRef = useRef<{ rowId: string; colKey: keyof OpsInputRow } | null>(null);

  usePersistentScroll(scrollKey ?? null, true, () => tableScrollRef.current);

  const handleFlush = useCallback(
    async (payload: Array<{ id: string; values: Record<string, string> }>) => {
      if (payload.length === 0) return;
      // Filter out items that no longer exist in the current rows
      const existingIds = new Set(rows.map((r) => r.id));
      const validPayload = payload.filter((item) => existingIds.has(item.id));
      if (validPayload.length === 0) return;
      const url = withAppBasePath('/api/v1/xplan/purchase-orders');
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: validPayload }),
        });
        if (!response.ok) {
          let errorMessage = 'Failed to update purchase orders';
          try {
            const text = await response.text();
            if (text) {
              const errorData = JSON.parse(text);
              if (errorData?.error) {
                errorMessage = errorData.error;
              }
            }
          } catch (parseError) {
            // ignore parse error
          }
          toast.error(errorMessage, { duration: 5000, id: 'po-update-error' });
          return;
        }
        toast.success('PO inputs saved', { id: 'po-inputs-saved' });
      } catch (error) {
        console.error('[CustomOpsPlanningGrid] Failed to update purchase orders:', error);
        toast.error('Unable to save purchase order inputs', {
          duration: 5000,
          id: 'po-update-error',
        });
      }
    },
    [rows],
  );

  const { pendingRef, scheduleFlush, flushNow } = useMutationQueue<
    string,
    { id: string; values: Record<string, string> }
  >({
    debounceMs: 500,
    onFlush: handleFlush,
  });

  // Undo/redo functionality
  const applyUndoRedoEdits = useCallback(
    (edits: CellEdit<string>[]) => {
      let updatedRows = [...rows];
      for (const edit of edits) {
        const rowIndex = updatedRows.findIndex((r) => r.id === edit.rowKey);
        if (rowIndex < 0) continue;
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [edit.field]: edit.newValue };

        // Queue for API update
        if (!pendingRef.current.has(edit.rowKey)) {
          pendingRef.current.set(edit.rowKey, { id: edit.rowKey, values: {} });
        }
        const entry = pendingRef.current.get(edit.rowKey)!;
        entry.values[edit.field] = edit.newValue;
      }
      onRowsChange?.(updatedRows);
      scheduleFlush();
    },
    [rows, pendingRef, scheduleFlush, onRowsChange],
  );

  const { recordEdits, undo, redo, canUndo, canRedo } = useGridUndoRedo<string>({
    maxHistory: 50,
    onApplyEdits: applyUndoRedoEdits,
  });

  // Use ref pattern to avoid cleanup running on every re-render
  const flushNowRef = useRef(flushNow);
  useEffect(() => {
    flushNowRef.current = flushNow;
  }, [flushNow]);

  useEffect(() => {
    return () => {
      flushNowRef.current().catch(() => {});
    };
  }, []); // Only run cleanup on unmount

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        if (selectOnFocusRef.current) {
          inputRef.current.select();
        } else {
          // Position cursor at end when started by typing
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }
      // Reset for next edit
      selectOnFocusRef.current = true;
    }
  }, [editingCell]);

  const handleDeleteClick = () => {
    if (!onDeleteOrder || !activeOrderId || disableDelete) return;
    onDeleteOrder(activeOrderId);
  };

  const handleDuplicateClick = () => {
    if (!onDuplicateOrder || !activeOrderId || disableDuplicate) return;
    onDuplicateOrder(activeOrderId);
  };

  const startEditing = useCallback(
    (rowId: string, colKey: keyof OpsInputRow, currentValue: string) => {
      setActiveCell({ rowId, colKey });
      setEditingCell({ rowId, colKey });
      setEditValue(currentValue);
    },
    [],
  );

  const selectCell = useCallback(
    (rowId: string, colKey: keyof OpsInputRow) => {
      tableScrollRef.current?.focus();
      setActiveCell({ rowId, colKey });
      onSelectOrder?.(rowId);
    },
    [onSelectOrder],
  );

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
    requestAnimationFrame(() => {
      tableScrollRef.current?.focus();
    });
  }, []);

  const commitEdit = useCallback(
    (nextValue?: string) => {
      if (!editingCell) return;

      const { rowId, colKey } = editingCell;
      const row = rows.find((r) => r.id === rowId);
      if (!row) {
        cancelEditing();
        return;
      }

      const column = COLUMNS.find((c) => c.key === colKey);
      if (!column) {
        cancelEditing();
        return;
      }

      if (!isGridEditableColumn(column, stageMode)) {
        cancelEditing();
        return;
      }

      let finalValue = nextValue ?? editValue;

      // Validate and normalize based on column type
      if (column.type === 'numeric') {
        const validator = validateNumeric;
        if (!validator(finalValue)) {
          toast.error('Invalid number');
          cancelEditing();
          return;
        }
        const precision = column.precision ?? NUMERIC_PRECISION[colKey] ?? 2;
        finalValue = normalizeNumeric(finalValue, precision);
      } else if (column.type === 'stage' && stageMode === 'weeks') {
        const trimmed = finalValue.trim();
        if (!trimmed) {
          finalValue = '';
        } else {
          const validator = validateNumeric;
          if (!validator(finalValue)) {
            toast.error('Invalid number');
            cancelEditing();
            return;
          }
          const precision = column.precision ?? NUMERIC_PRECISION[colKey] ?? 2;
          finalValue = normalizeNumeric(finalValue, precision);
          const parsed = sanitizeNumeric(finalValue);
          if (!Number.isFinite(parsed) || parsed < 0) {
            toast.error('Weeks must be a non-negative number');
            cancelEditing();
            return;
          }
        }
      } else if (column.type === 'date') {
        if (!finalValue || finalValue.trim() === '') {
          finalValue = '';
        } else {
          const iso = toIsoDate(finalValue);
          if (!iso) {
            toast.error('Invalid date');
            cancelEditing();
            return;
          }
          finalValue = iso;
        }
      } else if (column.type === 'stage' && stageMode === 'dates') {
        if (!validateDate(finalValue)) {
          toast.error('Invalid date');
          cancelEditing();
          return;
        }
      } else if (column.type === 'dropdown') {
        if (colKey === 'status') {
          const normalized = normalizePurchaseOrderStatus(finalValue);
          if (!normalized) {
            toast.error('Select a valid status');
            cancelEditing();
            return;
          }
          finalValue = normalized;
        } else if (column.options?.length) {
          const isValid = column.options.some((option) => option.value === finalValue);
          if (!isValid) {
            toast.error('Select a valid option');
            cancelEditing();
            return;
          }
        }
      }

      // Treat stage/date cells as the resolved stage end date, not the underlying weeks value.
      if (column.type === 'stage' && stageMode === 'dates') {
        const stageField = colKey as StageWeeksKey;
        const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
        const currentIso = toIsoDate(resolveStageEnd(row, stageField)) ?? '';

        if (!finalValue || finalValue.trim() === '') {
          finalValue = '';
          if ((row[overrideField] ?? '') === '') {
            cancelEditing();
            return;
          }
        } else {
          const iso = toIsoDate(finalValue);
          if (!iso) {
            toast.error('Invalid date');
            cancelEditing();
            return;
          }
          finalValue = iso;
          if (finalValue === currentIso) {
            cancelEditing();
            return;
          }
        }
      } else if (column.type === 'stage' && stageMode === 'weeks') {
        const stageField = colKey as StageWeeksKey;
        const currentWeeks = calculateWeeksFromDates(row, stageField);
        const currentNormalized = currentWeeks !== null ? formatNumericInput(currentWeeks, 2) : '';

        if (!finalValue || finalValue.trim() === '') {
          cancelEditing();
          return;
        }

        if (finalValue === currentNormalized) {
          cancelEditing();
          return;
        }
      } else if (column.type === 'date') {
        const currentIso = row[colKey] ? (toIsoDate(row[colKey]) ?? '') : '';
        if (currentIso === finalValue) {
          cancelEditing();
          return;
        }
      } else if (row[colKey] === finalValue) {
        cancelEditing();
        return;
      }

      // Client-side validation for duplicate orderCode
      if (colKey === 'orderCode' && finalValue) {
        const isDuplicate = rows.some(
          (r) => r.id !== rowId && r.orderCode.toLowerCase() === finalValue.toLowerCase(),
        );
        if (isDuplicate) {
          toast.warning(`Order code "${finalValue}" is already in use`, {
            description: 'Please choose a unique order code.',
            duration: 4000,
          });
          cancelEditing();
          return;
        }
      }

      // Prepare mutation entry
      const entryExisted = pendingRef.current.has(rowId);
      if (!entryExisted) pendingRef.current.set(rowId, { id: rowId, values: {} });
      const entry = pendingRef.current.get(rowId)!;
      const previousEntryValues = { ...entry.values };

      // Handle stage columns in date mode (date <-> weeks sync)
      if (column.type === 'stage' && stageMode === 'dates') {
        const stageField = colKey as StageWeeksKey;
        const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
        const iso = finalValue;

        if (!iso) {
          // Clear the date
          if ((row[overrideField] ?? '') !== '') {
            entry.values[overrideField] = '';
            entry.values[colKey] = ''; // Also clear the weeks
          }
        } else {
          // Save the date and calculate weeks from date difference
          const endDate = new Date(`${iso}T00:00:00Z`);

          // Determine start date based on stage
          let startDate: Date | null = null;
          if (stageField === 'productionWeeks') {
            // Manufacturing: from productionStart to productionComplete
            startDate = parseIsoDate(row.productionStart);
          } else {
            // Other stages: from previous stage end date
            const stageIndex = STAGE_CONFIG.findIndex((s) => s.weeksKey === stageField);
            if (stageIndex > 0) {
              const prevStage = STAGE_CONFIG[stageIndex - 1];
              startDate = parseIsoDate(row[prevStage.overrideKey]);
            }
          }

          if (startDate && endDate.getTime() < startDate.getTime()) {
            toast.error('End date must be on or after the start date');
            cancelEditing();
            return;
          }

          // Save the date
          if ((row[overrideField] ?? '') !== iso) {
            entry.values[overrideField] = iso;
          }

          // Calculate and save weeks (for database consistency)
          if (startDate) {
            const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
            const weeks = (endDate.getTime() - startDate.getTime()) / MS_PER_WEEK;
            const normalized = formatNumericInput(Math.max(0, weeks), 2);
            if (row[colKey] !== normalized) {
              entry.values[colKey] = normalized;
            }
          }
        }
      } else if (column.type === 'stage' && stageMode === 'weeks') {
        const stageField = colKey as StageWeeksKey;
        const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
        if (!finalValue) {
          cancelEditing();
          return;
        }

        const weeks = sanitizeNumeric(finalValue);
        if (!Number.isFinite(weeks) || weeks < 0) {
          toast.error('Weeks must be a non-negative number');
          cancelEditing();
          return;
        }

        const stageIndex = STAGE_CONFIG.findIndex((s) => s.weeksKey === stageField);

        let startDate: Date | null = null;
        if (stageField === 'productionWeeks') {
          startDate = parseIsoDate(row.productionStart);
        } else if (stageIndex > 0) {
          const prevStage = STAGE_CONFIG[stageIndex - 1];
          startDate = parseIsoDate(row[prevStage.overrideKey]);
        }

        if (!startDate) {
          toast.error(
            stageField === 'productionWeeks'
              ? 'Set Mfg Start before editing weeks'
              : 'Set the previous stage date before editing weeks',
          );
          cancelEditing();
          return;
        }

        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const days = Math.max(0, Math.round(weeks * 7));
        const endDate = new Date(startDate.getTime() + days * MS_PER_DAY);

        if (endDate.getTime() < startDate.getTime()) {
          toast.error('End date must be on or after the start date');
          cancelEditing();
          return;
        }

        const iso = toIsoDate(endDate) ?? '';
        const oldEndDate = parseIsoDate(row[overrideField]);
        const deltaMs = oldEndDate ? endDate.getTime() - oldEndDate.getTime() : null;

        if (row[colKey] !== finalValue) {
          entry.values[colKey] = finalValue;
        }
        if ((row[overrideField] ?? '') !== iso) {
          entry.values[overrideField] = iso;
        }

        // Shift downstream stage dates to preserve their durations.
        if (deltaMs !== null && stageIndex >= 0 && deltaMs !== 0) {
          for (let i = stageIndex + 1; i < STAGE_CONFIG.length; i += 1) {
            const downstreamOverride = STAGE_CONFIG[i].overrideKey;
            const existing = parseIsoDate(row[downstreamOverride]);
            if (!existing) continue;
            const shifted = new Date(existing.getTime() + deltaMs);
            const shiftedIso = toIsoDate(shifted) ?? '';
            if ((row[downstreamOverride] ?? '') !== shiftedIso) {
              entry.values[downstreamOverride] = shiftedIso;
            }
          }
        }
      } else if (NUMERIC_FIELDS.has(colKey)) {
        entry.values[colKey] = finalValue;
      } else if (DATE_FIELDS.has(colKey)) {
        entry.values[colKey] = finalValue;
      } else {
        entry.values[colKey] = finalValue;
      }

      // Create updated row
      let updatedRow = { ...row };
      for (const [key, val] of Object.entries(entry.values)) {
        updatedRow[key as keyof OpsInputRow] = val as any;
      }

      // Recalculate weeks when relevant dates change (for database consistency)
      // productionStart affects productionWeeks
      // Each stage date affects the next stage's weeks
      if (colKey === 'productionStart') {
        const weeks = calculateWeeksFromDates(updatedRow, 'productionWeeks');
        if (weeks !== null) {
          const normalized = formatNumericInput(weeks, 2);
          if (updatedRow.productionWeeks !== normalized) {
            entry.values.productionWeeks = normalized;
            updatedRow.productionWeeks = normalized;
          }
        }
      }

      const shouldValidateStageOrder =
        colKey === 'poDate' ||
        colKey === 'productionStart' ||
        column.type === 'stage';

      if (shouldValidateStageOrder) {
        const stageError = validateStageDates(updatedRow);
        if (stageError) {
          toast.error(stageError);
          entry.values = previousEntryValues;
          if (!entryExisted && Object.keys(previousEntryValues).length === 0) {
            pendingRef.current.delete(rowId);
          }
          cancelEditing();
          return;
        }
      }

      if (Object.keys(entry.values).length === 0) {
        pendingRef.current.delete(rowId);
        cancelEditing();
        return;
      }

      // Record edits for undo/redo
      const undoEdits: CellEdit<string>[] = Object.entries(entry.values).map(
        ([field, newValue]) => ({
          rowKey: rowId,
          field,
          oldValue: row[field as keyof OpsInputRow] ?? '',
          newValue: newValue as string,
        }),
      );
      recordEdits(undoEdits);

      // Update rows
      const updatedRows = rows.map((r) => (r.id === rowId ? updatedRow : r));
      onRowsChange?.(updatedRows);

      scheduleFlush();
      cancelEditing();
    },
    [
      editingCell,
      editValue,
      rows,
      stageMode,
      pendingRef,
      scheduleFlush,
      onRowsChange,
      cancelEditing,
      recordEdits,
    ],
  );

  const scrollToCell = useCallback((rowId: string, colKey: keyof OpsInputRow) => {
    requestAnimationFrame(() => {
      const node = document.getElementById(cellDomId(rowId, colKey));
      node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number, options: { extendSelection?: boolean } = {}) => {
      if (!activeCell) return;

      const currentRowIndex = rows.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = COLUMNS.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      const nextRowIndex = Math.max(0, Math.min(rows.length - 1, currentRowIndex + deltaRow));
      const nextColIndex = Math.max(0, Math.min(COLUMNS.length - 1, currentColIndex + deltaCol));

      const nextRowId = rows[nextRowIndex]?.id;
      const nextColKey = COLUMNS[nextColIndex]?.key;
      if (!nextRowId || !nextColKey) return;

      const coords = { row: nextRowIndex, col: nextColIndex };
      const currentCoords = { row: currentRowIndex, col: currentColIndex };
      const extendSelection = Boolean(options.extendSelection);

      const anchor = extendSelection ? (selectionAnchorRef.current ?? currentCoords) : coords;

      if (extendSelection && !selectionAnchorRef.current) {
        selectionAnchorRef.current = currentCoords;
      }
      if (!extendSelection) {
        selectionAnchorRef.current = coords;
      }

      setSelection({ from: anchor, to: coords });
      setActiveCell({ rowId: nextRowId, colKey: nextColKey });
      onSelectOrder?.(nextRowId);
      scrollToCell(nextRowId, nextColKey);
    },
    [activeCell, rows, onSelectOrder, scrollToCell],
  );

  const moveSelectionTab = useCallback(
    (direction: 1 | -1) => {
      if (!activeCell) return;

      const currentRowIndex = rows.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = COLUMNS.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      let nextRowIndex = currentRowIndex;
      let nextColIndex = currentColIndex + direction;

      if (nextColIndex >= COLUMNS.length) {
        nextColIndex = 0;
        nextRowIndex = Math.min(rows.length - 1, currentRowIndex + 1);
      } else if (nextColIndex < 0) {
        nextColIndex = COLUMNS.length - 1;
        nextRowIndex = Math.max(0, currentRowIndex - 1);
      }

      const nextRowId = rows[nextRowIndex]?.id;
      const nextColKey = COLUMNS[nextColIndex]?.key;
      if (!nextRowId || !nextColKey) return;

      const coords = { row: nextRowIndex, col: nextColIndex };
      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
      setActiveCell({ rowId: nextRowId, colKey: nextColKey });
      onSelectOrder?.(nextRowId);
      scrollToCell(nextRowId, nextColKey);
    },
    [activeCell, rows, onSelectOrder, scrollToCell],
  );

  const startEditingActiveCell = useCallback(() => {
    if (!activeCell) return;
    const row = rows.find((r) => r.id === activeCell.rowId);
    const column = COLUMNS.find((c) => c.key === activeCell.colKey);
    if (!row || !column) return;
    if (!isGridEditableColumn(column, stageMode)) return;
    startEditing(row.id, column.key, getCellEditValue(row, column, stageMode));
  }, [activeCell, rows, stageMode, startEditing]);

  const findNextEditableColumn = (startIndex: number, direction: 1 | -1): number => {
    let idx = startIndex + direction;
    while (idx >= 0 && idx < COLUMNS.length) {
      if (isGridEditableColumn(COLUMNS[idx]!, stageMode)) return idx;
      idx += direction;
    }
    return -1;
  };

  const moveToCell = (rowIndex: number, colIndex: number) => {
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    if (colIndex < 0 || colIndex >= COLUMNS.length) return;
    const column = COLUMNS[colIndex];
    if (!isGridEditableColumn(column, stageMode)) return;
    const row = rows[rowIndex];
    startEditing(row.id, column.key, getCellEditValue(row, column, stageMode));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    const overrideValue =
      e.currentTarget instanceof HTMLSelectElement ? e.currentTarget.value : undefined;

    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(overrideValue);
      moveSelection(1, 0);
      requestAnimationFrame(() => {
        tableScrollRef.current?.focus();
      });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
      requestAnimationFrame(() => {
        tableScrollRef.current?.focus();
      });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit(overrideValue);
      moveSelectionTab(e.shiftKey ? -1 : 1);
      requestAnimationFrame(() => {
        tableScrollRef.current?.focus();
      });
    } else if (e.currentTarget instanceof HTMLSelectElement) {
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commitEdit();
      if (editingCell) {
        const currentRowIndex = rows.findIndex((r) => r.id === editingCell.rowId);
        const currentColIndex = COLUMNS.findIndex((c) => c.key === editingCell.colKey);
        moveToCell(currentRowIndex - 1, currentColIndex);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commitEdit();
      if (editingCell) {
        const currentRowIndex = rows.findIndex((r) => r.id === editingCell.rowId);
        const currentColIndex = COLUMNS.findIndex((c) => c.key === editingCell.colKey);
        moveToCell(currentRowIndex + 1, currentColIndex);
      }
    } else if (e.key === 'ArrowLeft') {
      // Only move to prev cell if cursor is at start of input
      const input = e.currentTarget;
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        commitEdit();
        if (editingCell) {
          const currentRowIndex = rows.findIndex((r) => r.id === editingCell.rowId);
          const currentColIndex = COLUMNS.findIndex((c) => c.key === editingCell.colKey);
          const prevColIndex = findNextEditableColumn(currentColIndex, -1);
          if (prevColIndex !== -1) {
            moveToCell(currentRowIndex, prevColIndex);
          } else if (currentRowIndex > 0) {
            // Move to last editable column of previous row
            const lastEditableColIndex = findNextEditableColumn(COLUMNS.length, -1);
            if (lastEditableColIndex !== -1) {
              moveToCell(currentRowIndex - 1, lastEditableColIndex);
            }
          }
        }
      }
    } else if (e.key === 'ArrowRight') {
      // Only move to next cell if cursor is at end of input
      const input = e.currentTarget;
      const len = input.value.length;
      if (input.selectionStart === len && input.selectionEnd === len) {
        e.preventDefault();
        commitEdit();
        if (editingCell) {
          const currentRowIndex = rows.findIndex((r) => r.id === editingCell.rowId);
          const currentColIndex = COLUMNS.findIndex((c) => c.key === editingCell.colKey);
          const nextColIndex = findNextEditableColumn(currentColIndex, 1);
          if (nextColIndex !== -1) {
            moveToCell(currentRowIndex, nextColIndex);
          } else if (currentRowIndex < rows.length - 1) {
            // Move to first editable column of next row
            const firstEditableColIndex = findNextEditableColumn(-1, 1);
            if (firstEditableColIndex !== -1) {
              moveToCell(currentRowIndex + 1, firstEditableColIndex);
            }
          }
        }
      }
    }
  };

  // Pointer event handlers for drag selection
  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (editingCell) return;
      tableScrollRef.current?.focus();
      const coords = { row: rowIndex, col: colIndex };
      // Also update activeCell to match
      const row = rows[rowIndex];
      const column = COLUMNS[colIndex];
      if (row && column) {
        setActiveCell({ rowId: row.id, colKey: column.key });
        onSelectOrder?.(row.id);
      }

      if (e.shiftKey && selectionAnchorRef.current) {
        setSelection({ from: selectionAnchorRef.current, to: coords });
        return;
      }

      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
    },
    [editingCell, rows, onSelectOrder],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (!e.buttons) return;
      if (!selectionAnchorRef.current) return;
      const newRange = { from: selectionAnchorRef.current, to: { row: rowIndex, col: colIndex } };
      setSelection(newRange);
    },
    [],
  );

  const handlePointerUp = useCallback(() => {}, []);

  // Copy handler - use display values for clipboard (user-friendly format)
  const buildClipboardText = useCallback(
    (range: CellRange): string => {
      const { top, bottom, left, right } = normalizeRange(range);
      const lines: string[] = [];
      for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
        const row = rows[rowIndex];
        if (!row) continue;
        const cells: string[] = [];
        for (let colIndex = left; colIndex <= right; colIndex += 1) {
          const column = COLUMNS[colIndex];
          if (!column) continue;
          // Use formatted display value for clipboard so dates show as "Feb 22 2026" not "2026-02-22"
          cells.push(getCellFormattedValue(row, column, stageMode));
        }
        lines.push(cells.join('\t'));
      }
      return lines.join('\n');
    },
    [rows, stageMode],
  );

  // Programmatic copy to clipboard (for Ctrl+C shortcut)
  const copySelectionToClipboard = useCallback(() => {
    const currentSelection =
      selection ??
      (activeCell
        ? (() => {
            const rowIndex = rows.findIndex((r) => r.id === activeCell.rowId);
            const colIndex = COLUMNS.findIndex((c) => c.key === activeCell.colKey);
            if (rowIndex < 0 || colIndex < 0) return null;
            const coords = { row: rowIndex, col: colIndex };
            return { from: coords, to: coords };
          })()
        : null);

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
      requestAnimationFrame(() => tableScrollRef.current?.focus());
    }
  }, [activeCell, rows, selection, buildClipboardText]);

  const clearSelectionValues = useCallback(() => {
    const currentSelection =
      selection ??
      (activeCell
        ? (() => {
            const rowIndex = rows.findIndex((r) => r.id === activeCell.rowId);
            const colIndex = COLUMNS.findIndex((c) => c.key === activeCell.colKey);
            if (rowIndex < 0 || colIndex < 0) return null;
            const coords = { row: rowIndex, col: colIndex };
            return { from: coords, to: coords };
          })()
        : null);

    if (!currentSelection) return;

    const { top, bottom, left, right } = normalizeRange(currentSelection);
    if (top < 0 || left < 0) return;

    let updatedRows = [...rows];
    const undoEdits: CellEdit<string>[] = [];

    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const row = updatedRows[rowIndex];
      if (!row) continue;

      for (let colIndex = left; colIndex <= right; colIndex += 1) {
        const column = COLUMNS[colIndex];
        if (!column || column.editable === false) continue;
        if (column.type === 'stage') continue;
        if (column.type === 'dropdown') continue;

        const colKey = column.key;
        const oldValue = row[colKey] ?? '';
        if (oldValue === '') continue;

        if (!pendingRef.current.has(row.id)) {
          pendingRef.current.set(row.id, { id: row.id, values: {} });
        }
        const entry = pendingRef.current.get(row.id)!;
        entry.values[colKey] = '';

        undoEdits.push({
          rowKey: row.id,
          field: colKey,
          oldValue,
          newValue: '',
        });

        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [colKey]: '' };
      }
    }

    if (undoEdits.length === 0) return;

    recordEdits(undoEdits);
    onRowsChange?.(updatedRows);
    scheduleFlush();
  }, [activeCell, onRowsChange, pendingRef, recordEdits, rows, scheduleFlush, selection]);

  const applyPastedText = useCallback(
    (text: string, start: { rowId: string; colKey: keyof OpsInputRow }) => {
      const pasteRows = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (pasteRows.length === 0) return;

      const startRowIndex = rows.findIndex((r) => r.id === start.rowId);
      const startColIndex = COLUMNS.findIndex((c) => c.key === start.colKey);
      if (startRowIndex < 0 || startColIndex < 0) return;

      const updatesByRowIndex = new Map<
        number,
        Array<{ colKey: keyof OpsInputRow; column: ColumnDef; value: string }>
      >();

      for (let r = 0; r < pasteRows.length; r += 1) {
        for (let c = 0; c < pasteRows[r]!.length; c += 1) {
          const targetRowIndex = startRowIndex + r;
          const targetColIndex = startColIndex + c;
          if (targetRowIndex >= rows.length) continue;
          if (targetColIndex >= COLUMNS.length) continue;

          const column = COLUMNS[targetColIndex];
          if (!column || column.editable === false) continue;

          const row = rows[targetRowIndex];
          if (!row) continue;

          const rowUpdates = updatesByRowIndex.get(targetRowIndex) ?? [];
          rowUpdates.push({
            colKey: column.key,
            column,
            value: pasteRows[r]![c] ?? '',
          });
          updatesByRowIndex.set(targetRowIndex, rowUpdates);
        }
      }

      if (updatesByRowIndex.size === 0) return;

      let updatedRows = [...rows];
      const undoEdits: CellEdit<string>[] = [];
      const stageValidationErrors: string[] = [];

      for (const [rowIndex, rowUpdates] of updatesByRowIndex.entries()) {
        const baseRow = updatedRows[rowIndex];
        if (!baseRow) continue;
        const rowId = baseRow.id;
        const originalRow = rows[rowIndex];
        if (!originalRow || originalRow.id !== rowId) {
          // Fallback if indices drift (shouldn't happen)
          // eslint-disable-next-line no-continue
          continue;
        }

        const nextValues: Record<string, string> = {};
        let nextRow = { ...baseRow };

        for (const update of rowUpdates) {
          const { column, colKey } = update;
          let rawValue = update.value;

          // Stage columns: allow paste in both date and weeks modes.
          if (column.type === 'stage') {
            const stageField = colKey as StageWeeksKey;
            const overrideField = STAGE_OVERRIDE_FIELDS[stageField];
            const trimmed = rawValue.trim();

            if (stageMode === 'weeks') {
              if (!trimmed) continue;

              const precision = column.precision ?? NUMERIC_PRECISION[colKey] ?? 2;
              const normalizedWeeks = normalizeNumeric(trimmed, precision);
              const parsedWeeks = parseWeeks(normalizedWeeks);
              if (parsedWeeks == null || parsedWeeks < 0) continue;

              const stageIndex = STAGE_CONFIG.findIndex((s) => s.weeksKey === stageField);
              let startDate: Date | null = null;

              if (stageField === 'productionWeeks') {
                startDate = parseIsoDate(nextRow.productionStart);
              } else if (stageIndex > 0) {
                const prevStage = STAGE_CONFIG[stageIndex - 1];
                startDate = parseIsoDate(nextRow[prevStage.overrideKey]);
              }

              if (!startDate) continue;

              const MS_PER_DAY = 24 * 60 * 60 * 1000;
              const days = Math.max(0, Math.round(parsedWeeks * 7));
              const endDate = new Date(startDate.getTime() + days * MS_PER_DAY);

              if (endDate.getTime() < startDate.getTime()) continue;

              const iso = toIsoDate(endDate);
              if (!iso) continue;

              const existingEnd = parseIsoDate(nextRow[overrideField]);
              const deltaMs = existingEnd ? endDate.getTime() - existingEnd.getTime() : null;

              nextRow = { ...nextRow, [stageField]: normalizedWeeks, [overrideField]: iso };
              nextValues[stageField] = normalizedWeeks;
              nextValues[overrideField] = iso;

              if (deltaMs !== null && deltaMs !== 0 && stageIndex >= 0) {
                for (let i = stageIndex + 1; i < STAGE_CONFIG.length; i += 1) {
                  const downstreamOverride = STAGE_CONFIG[i].overrideKey;
                  const downstreamDate = parseIsoDate(nextRow[downstreamOverride]);
                  if (!downstreamDate) continue;
                  const shifted = new Date(downstreamDate.getTime() + deltaMs);
                  const shiftedIso = toIsoDate(shifted);
                  if (!shiftedIso) continue;

                  nextRow = { ...nextRow, [downstreamOverride]: shiftedIso };
                  nextValues[downstreamOverride] = shiftedIso;
                }
              }

              continue;
            }

            if (!trimmed) {
              const hadOverride = (nextRow[overrideField] ?? '') !== '';
              const hadWeeks = (nextRow[stageField] ?? '') !== '';
              if (!hadOverride && !hadWeeks) continue;

              nextRow = { ...nextRow, [overrideField]: '', [stageField]: '' };
              nextValues[overrideField] = '';
              nextValues[stageField] = '';
              continue;
            }

            const pastedDate = toIsoDate(rawValue);
            if (!pastedDate) continue;

            nextRow = { ...nextRow, [overrideField]: pastedDate };
            nextValues[overrideField] = pastedDate;

            // Calculate weeks from dates (for database consistency)
            const endDate = new Date(`${pastedDate}T00:00:00Z`);
            let startDate: Date | null = null;

            if (stageField === 'productionWeeks') {
              startDate = parseIsoDate(nextRow.productionStart);
            } else {
              const stageIndex = STAGE_CONFIG.findIndex((s) => s.weeksKey === stageField);
              if (stageIndex > 0) {
                const prevStage = STAGE_CONFIG[stageIndex - 1];
                startDate = parseIsoDate(nextRow[prevStage.overrideKey]);
              }
            }

            if (startDate) {
              const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
              const weeks = Math.max(0, (endDate.getTime() - startDate.getTime()) / MS_PER_WEEK);
              const normalizedWeeks = formatNumericInput(weeks, 2);
              nextRow = { ...nextRow, [stageField]: normalizedWeeks };
              nextValues[stageField] = normalizedWeeks;
            }

            continue;
          }

          if (column.type === 'date') {
            const trimmed = rawValue.trim();
            if (!trimmed) {
              rawValue = '';
            } else {
              const iso = toIsoDate(trimmed);
              if (!iso) continue;
              rawValue = iso;
            }
          }

          if (column.type === 'numeric') {
            const precision = column.precision ?? NUMERIC_PRECISION[colKey] ?? 2;
            rawValue = normalizeNumeric(rawValue, precision);
          }

          if (column.type === 'dropdown') {
            if (colKey === 'status') {
              const normalized = normalizePurchaseOrderStatus(rawValue);
              if (!normalized) continue;
              rawValue = normalized;
            } else if (column.options?.length) {
              const isValid = column.options.some((option) => option.value === rawValue);
              if (!isValid) continue;
            }
          }

          if ((nextRow[colKey] ?? '') === rawValue) continue;

          nextRow = { ...nextRow, [colKey]: rawValue } as OpsInputRow;
          nextValues[colKey] = rawValue;
        }

        if (Object.keys(nextValues).length === 0) continue;

        const stageError = validateStageDates(nextRow);
        if (stageError) {
          stageValidationErrors.push(stageError);
          continue;
        }

        // Apply changes + queue for API update
        if (!pendingRef.current.has(rowId)) {
          pendingRef.current.set(rowId, { id: rowId, values: {} });
        }
        const entry = pendingRef.current.get(rowId)!;

        for (const [field, newValue] of Object.entries(nextValues)) {
          const oldValue = originalRow[field as keyof OpsInputRow] ?? '';
          if (oldValue === newValue) continue;
          undoEdits.push({ rowKey: rowId, field, oldValue, newValue });
          entry.values[field] = newValue;
        }

        updatedRows[rowIndex] = nextRow;
      }

      if (stageValidationErrors.length > 0) {
        toast.error('Paste skipped: invalid stage date order', {
          description: stageValidationErrors[0],
          duration: 5000,
        });
      }

      if (undoEdits.length === 0) return;

      recordEdits(undoEdits);
      onRowsChange?.(updatedRows);
      scheduleFlush();
      toast.success(`Pasted ${undoEdits.length} value${undoEdits.length === 1 ? '' : 's'}`);
      requestAnimationFrame(() => tableScrollRef.current?.focus());
    },
    [onRowsChange, pendingRef, recordEdits, rows, scheduleFlush, stageMode],
  );

  const handleGridKeyDown = useCallback(
    (event: {
      key: string;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      preventDefault: () => void;
    }) => {
      if (editingCell) return;

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

      // Handle Ctrl+C for copy
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelectionToClipboard();
        return;
      }

      // Handle Ctrl+V for paste via hidden clipboard textarea
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
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
            tableScrollRef.current?.focus();
          }
        }, 250);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearSelectionValues();
        return;
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startEditingActiveCell();
        return;
      }

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        activeCell
      ) {
        const row = rows.find((r) => r.id === activeCell.rowId);
        const column = COLUMNS.find((c) => c.key === activeCell.colKey);
        if (!row || !column) return;
        if (!isGridEditableColumn(column, stageMode)) return;

        event.preventDefault();
        // Don't select all when starting edit by typing - cursor at end
        selectOnFocusRef.current = false;
        startEditing(
          row.id,
          column.key,
          column.type === 'dropdown' ? getCellEditValue(row, column, stageMode) : event.key,
        );
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        moveSelectionTab(event.shiftKey ? -1 : 1);
        return;
      }

      const isArrowKey = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key);
      if (isArrowKey) {
        event.preventDefault();
        const jump = event.ctrlKey || event.metaKey;
        if (event.key === 'ArrowDown') {
          moveSelection(jump ? rows.length : 1, 0, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowUp') {
          moveSelection(jump ? -rows.length : -1, 0, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowRight') {
          moveSelection(0, jump ? COLUMNS.length : 1, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowLeft') {
          moveSelection(0, jump ? -COLUMNS.length : -1, { extendSelection: event.shiftKey });
        }
        return;
      }
    },
    [
      activeCell,
      clearSelectionValues,
      copySelectionToClipboard,
      editingCell,
      moveSelection,
      moveSelectionTab,
      redo,
      rows,
      startEditingActiveCell,
      stageMode,
      startEditing,
      undo,
    ],
  );

  const handleTableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      handleGridKeyDown(event);
    },
    [handleGridKeyDown],
  );

  const handleCopy = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const currentSelection =
        selection ??
        (activeCell
          ? (() => {
              const rowIndex = rows.findIndex((r) => r.id === activeCell.rowId);
              const colIndex = COLUMNS.findIndex((c) => c.key === activeCell.colKey);
              if (rowIndex < 0 || colIndex < 0) return null;
              const coords = { row: rowIndex, col: colIndex };
              return { from: coords, to: coords };
            })()
          : null);

      if (!currentSelection) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', buildClipboardText(currentSelection));
    },
    [activeCell, buildClipboardText, rows, selection],
  );

  // Paste handler
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      const clipboard = clipboardRef.current;
      const refocusClipboard = () => {
        if (clipboard) clipboard.value = '';
        requestAnimationFrame(() => tableScrollRef.current?.focus());
      };

      const fallbackStart = pasteStartRef.current ?? activeCell;
      pasteStartRef.current = null;

      const normalizedSelection = selection ? normalizeRange(selection) : null;
      const hasMultiSelection =
        normalizedSelection &&
        (normalizedSelection.top !== normalizedSelection.bottom ||
          normalizedSelection.left !== normalizedSelection.right);
      const selectionStart = normalizedSelection
        ? (() => {
            const row = rows[normalizedSelection.top];
            const column = COLUMNS[normalizedSelection.left];
            if (!row || !column) return null;
            return { rowId: row.id, colKey: column.key };
          })()
        : null;

      const start = selectionStart ?? fallbackStart;
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

      if (
        hasMultiSelection &&
        normalizedSelection &&
        rowsMatrix.length === 1 &&
        rowsMatrix[0]?.length === 1
      ) {
        const rawValue = rowsMatrix[0]?.[0] ?? '';
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
    [activeCell, applyPastedText, rows, selection],
  );

  const getHeaderLabel = (column: ColumnDef): string => {
    if (column.type === 'stage') {
      return stageMode === 'weeks'
        ? (column.headerWeeks ?? column.header)
        : (column.headerDates ?? column.header);
    }
    return column.header;
  };

  const toggleStageMode = () => {
    setStageMode((prev) => (prev === 'weeks' ? 'dates' : 'weeks'));
  };

  const renderHeader = (column: ColumnDef) => {
    const isStageColumn = column.type === 'stage';
    const headerLabel = getHeaderLabel(column);

    return (
      <TableHead
        key={column.key}
        style={{ width: column.width, minWidth: column.width }}
        className="sticky top-0 z-10 h-10 whitespace-nowrap border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80"
      >
        {isStageColumn ? (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700 transition hover:bg-cyan-500/20 dark:border-cyan-300/35 dark:bg-cyan-300/10 dark:text-cyan-200 dark:hover:bg-cyan-300/20"
            title={`Click to switch to ${stageMode === 'weeks' ? 'dates' : 'weeks'} view`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleStageMode();
            }}
          >
            {headerLabel}
          </button>
        ) : (
          headerLabel
        )}
      </TableHead>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
            PO Table
          </h2>
        </div>
        {(onCreateOrder || onImportFromTalos || onDuplicateOrder || onDeleteOrder) && (
          <div className="flex flex-wrap gap-2">
            {onCreateOrder ? (
              <button
                type="button"
                onClick={onCreateOrder}
                disabled={Boolean(disableCreate)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10"
              >
                Add purchase order
              </button>
            ) : null}
            {onImportFromTalos ? (
              <button
                type="button"
                onClick={onImportFromTalos}
                disabled={Boolean(disableImport)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10"
              >
                Import from Talos
              </button>
            ) : null}
            {onDuplicateOrder ? (
              <button
                type="button"
                onClick={handleDuplicateClick}
                disabled={Boolean(disableDuplicate) || !activeOrderId}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10"
              >
                Duplicate selected
              </button>
            ) : null}
            {onDeleteOrder ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={Boolean(disableDelete) || !activeOrderId}
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 enabled:hover:border-rose-500 enabled:hover:bg-rose-100 enabled:hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-300 dark:focus:ring-rose-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-rose-500/80 dark:enabled:hover:bg-rose-500/20"
              >
                Remove selected
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10">
        <textarea
          ref={clipboardRef}
          tabIndex={-1}
          aria-hidden="true"
          className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
          onPaste={handlePaste}
        />
        <div
          ref={tableScrollRef}
          tabIndex={0}
          onPointerDownCapture={() => {
            if (!editingCell) {
              tableScrollRef.current?.focus();
            }
          }}
          onKeyDown={handleTableKeyDown}
          onCopy={handleCopy}
          onPaste={handlePaste}
          className="max-h-[400px] overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Table className="table-fixed border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">{COLUMNS.map(renderHeader)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={COLUMNS.length}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    No purchase orders yet. Click &ldquo;Add purchase order&rdquo; to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, rowIndex) => {
                  const isEditingRow = editingCell?.rowId === row.id;
                  return (
                    <CustomOpsPlanningRow
                      key={row.id}
                      row={row}
                      rowIndex={rowIndex}
                      stageMode={stageMode}
                      isActive={activeOrderId === row.id}
                      activeColKey={activeCell?.rowId === row.id ? activeCell.colKey : null}
                      editingColKey={isEditingRow ? editingCell!.colKey : null}
                      editValue={isEditingRow ? editValue : ''}
                      selection={selection}
                      inputRef={inputRef}
                      onSelectCell={selectCell}
                      onStartEditing={startEditing}
                      onSetEditValue={setEditValue}
                      onCommitEdit={isEditingRow ? commitEdit : undefined}
                      onInputKeyDown={isEditingRow ? handleKeyDown : undefined}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
