'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { toast } from 'sonner';
import Flatpickr from 'react-flatpickr';
import { useMutationQueue } from '@/hooks/useMutationQueue';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { cn } from '@/lib/utils';
import { getSelectionBorderBoxShadow } from '@/lib/grid/selection-border';
import {
  planningWeekDateIsoForWeekNumber,
  weekLabelForIsoDate,
  weekNumberForYearWeekLabel,
  type PlanningWeekConfig,
} from '@/lib/calculations/planning-week';
import { formatDateDisplay, toIsoDate } from '@/lib/utils/dates';
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

export type PurchasePaymentRow = {
  id: string;
  purchaseOrderId: string;
  orderCode: string;
  category: string;
  label: string;
  weekNumber: string;
  paymentIndex: number;
  dueDate: string;
  dueDateValue?: Date | null;
  dueDateIso: string | null;
  dueDateDefault: string;
  dueDateDefaultIso: string | null;
  dueDateSource: 'SYSTEM' | 'USER';
  percentage: string;
  amountExpected: string;
  amountPaid: string;
};

type PaymentUpdate = {
  id: string;
  values: Partial<Record<string, string>>;
};

export interface PaymentSummary {
  plannedAmount: number;
  plannedPercent: number;
  actualAmount: number;
  actualPercent: number;
  remainingAmount: number;
  remainingPercent: number;
}

interface CustomPurchasePaymentsGridProps {
  payments: PurchasePaymentRow[];
  activeOrderId?: string | null;
  activeYear?: number | null;
  planningWeekConfig?: PlanningWeekConfig | null;
  scrollKey?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onAddPayment?: () => void;
  onRemovePayment?: (paymentId: string) => Promise<void> | void;
  onRowsChange?: (rows: PurchasePaymentRow[]) => void;
  onSynced?: () => void;
  isLoading?: boolean;
  orderSummaries?: Map<string, PaymentSummary>;
  summaryLine?: string | null;
}

type ColumnDef = {
  key: keyof PurchasePaymentRow;
  header: string;
  headerWeeks?: string;
  headerDates?: string;
  width: number;
  type: 'text' | 'numeric' | 'percent' | 'date' | 'currency' | 'schedule';
  editable: boolean;
  precision?: number;
};

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

const COLUMNS: ColumnDef[] = [
  { key: 'orderCode', header: 'PO Code', width: 120, type: 'text', editable: false },
  { key: 'label', header: 'Invoice', width: 140, type: 'text', editable: false },
  {
    key: 'weekNumber',
    header: 'Week',
    headerWeeks: 'Week',
    headerDates: 'Due Date',
    width: 130,
    type: 'schedule',
    editable: true,
  },
  {
    key: 'percentage',
    header: 'Percent',
    width: 90,
    type: 'percent',
    editable: false,
    precision: 2,
  },
  {
    key: 'amountExpected',
    header: 'Expected $',
    width: 110,
    type: 'currency',
    editable: false,
    precision: 2,
  },
  {
    key: 'amountPaid',
    header: 'Paid $',
    width: 110,
    type: 'currency',
    editable: true,
    precision: 2,
  },
];

type ScheduleMode = 'weeks' | 'dates';

const CELL_ID_PREFIX = 'xplan-ops-payments';

function sanitizeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cellDomId(rowId: string, colKey: keyof PurchasePaymentRow): string {
  return `${CELL_ID_PREFIX}:${sanitizeDomId(rowId)}:${String(colKey)}`;
}

function normalizeNumeric(value: unknown, fractionDigits = 2): string {
  return formatNumericInput(value, fractionDigits);
}

function validateNumeric(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const parsed = sanitizeNumeric(value);
  return !Number.isNaN(parsed);
}

function parseNumericInput(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,$%\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function parseWeekNumber(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function getHeaderLabel(column: ColumnDef, scheduleMode: ScheduleMode): string {
  if (column.type === 'schedule') {
    return scheduleMode === 'weeks'
      ? (column.headerWeeks ?? column.header)
      : (column.headerDates ?? column.header);
  }
  return column.header;
}

function getCellEditValue(
  row: PurchasePaymentRow,
  column: ColumnDef,
  scheduleMode: ScheduleMode,
): string {
  if (column.type === 'schedule') {
    return scheduleMode === 'weeks' ? row.weekNumber : (row.dueDateIso ?? '');
  }

  if (column.type === 'date') {
    const raw = row[column.key];
    return raw === null || raw === undefined ? '' : String(raw);
  }

  const raw = row[column.key];
  return raw === null || raw === undefined ? '' : String(raw);
}

export function CustomPurchasePaymentsGrid({
  payments,
  activeOrderId,
  activeYear,
  planningWeekConfig,
  scrollKey,
  onSelectOrder,
  onAddPayment,
  onRemovePayment,
  onRowsChange,
  onSynced,
  isLoading,
  orderSummaries,
  summaryLine,
}: CustomPurchasePaymentsGridProps) {
  const [scheduleMode, setScheduleMode] = usePersistentState<ScheduleMode>(
    'xplan:ops:payments-schedule-mode',
    'dates',
  );
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: keyof PurchasePaymentRow;
  } | null>(null);
  const [activeCell, setActiveCell] = useState<{
    rowId: string;
    colKey: keyof PurchasePaymentRow;
  } | null>(null);
  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const selectionRange = useMemo(() => (selection ? normalizeRange(selection) : null), [selection]);
  const [editValue, setEditValue] = useState<string>('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const datePickerOpenRef = useRef(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectOnFocusRef = useRef(true);
  const rowsRef = useRef<PurchasePaymentRow[]>(payments);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);
  const pasteStartRef = useRef<{ rowId: string; colKey: keyof PurchasePaymentRow } | null>(null);

  usePersistentScroll(scrollKey ?? null, true, () => tableScrollRef.current);

  useEffect(() => {
    rowsRef.current = payments;
  }, [payments]);

  const handleFlush = useCallback(
    async (payload: PaymentUpdate[]) => {
      if (payload.length === 0) return;
      // Filter out items that no longer exist in the current payments
      const existingIds = new Set(payments.map((p) => p.id));
      const validPayload = payload.filter((item) => existingIds.has(item.id));
      if (validPayload.length === 0) return;
      try {
        const res = await fetch(withAppBasePath('/api/v1/x-plan/purchase-order-payments'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: validPayload }),
        });
        if (!res.ok) throw new Error('Failed to update payments');
        toast.success('Payment schedule updated', { id: 'payment-updated' });
        onSynced?.();
      } catch (error) {
        console.error(error);
        toast.error('Unable to update payment schedule', { id: 'payment-error' });
      }
    },
    [onSynced, payments],
  );

  const { pendingRef, scheduleFlush, flushNow } = useMutationQueue<string, PaymentUpdate>({
    debounceMs: 400,
    onFlush: handleFlush,
  });

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
      if (selectOnFocusRef.current) {
        inputRef.current.select();
      } else {
        // Position cursor at end when started by typing
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
      // Reset for next edit
      selectOnFocusRef.current = true;
    }
  }, [editingCell]);

  useEffect(() => {
    setSelectedPaymentId(null);
    setActiveCell(null);
    selectionAnchorRef.current = null;
    setSelection(null);
  }, [activeOrderId]);

  useEffect(() => {
    if (!selectedPaymentId) return;
    const stillExists = payments.some((payment) => payment.id === selectedPaymentId);
    if (!stillExists) setSelectedPaymentId(null);
  }, [payments, selectedPaymentId]);

  // Scoped data based on active order
  const data = useMemo(() => {
    return activeOrderId ? payments.filter((p) => p.purchaseOrderId === activeOrderId) : payments;
  }, [activeOrderId, payments]);

  const summary = activeOrderId ? orderSummaries?.get(activeOrderId) : undefined;

  const computedSummaryLine = useMemo(() => {
    if (!summary) return null;
    const parts: string[] = [];
    parts.push(`Plan ${summary.plannedAmount.toFixed(2)}`);
    if (summary.plannedAmount > 0) {
      const paidPercent = Math.max(summary.actualPercent * 100, 0).toFixed(1);
      parts.push(`Paid ${summary.actualAmount.toFixed(2)} (${paidPercent}%)`);
      if (summary.remainingAmount > 0.01) {
        parts.push(`Remaining ${summary.remainingAmount.toFixed(2)}`);
      } else if (summary.remainingAmount < -0.01) {
        parts.push(`Cleared (+$${Math.abs(summary.remainingAmount).toFixed(2)})`);
      } else {
        parts.push('Cleared');
      }
    } else {
      parts.push(`Paid ${summary.actualAmount.toFixed(2)}`);
    }
    return parts.join(' • ');
  }, [summary]);

  const summaryText = summaryLine ?? computedSummaryLine;

  const toggleScheduleMode = useCallback(() => {
    datePickerOpenRef.current = false;
    setEditingCell(null);
    setActiveCell(null);
    setEditValue('');
    setScheduleMode((previous) => (previous === 'weeks' ? 'dates' : 'weeks'));
  }, [setScheduleMode]);

  const startEditing = useCallback(
    (rowId: string, colKey: keyof PurchasePaymentRow, currentValue: string) => {
      datePickerOpenRef.current = false;
      setActiveCell({ rowId, colKey });
      setEditingCell({ rowId, colKey });
      setEditValue(currentValue);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (editingCell) return;
      tableScrollRef.current?.focus();

      const row = data[rowIndex];
      const column = COLUMNS[colIndex];
      if (!row || !column) return;

      onSelectOrder?.(row.purchaseOrderId);
      setSelectedPaymentId(row.id);
      setActiveCell({ rowId: row.id, colKey: column.key });

      const coords = { row: rowIndex, col: colIndex };
      if (event.shiftKey && selectionAnchorRef.current) {
        setSelection({ from: selectionAnchorRef.current, to: coords });
        return;
      }

      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
    },
    [data, editingCell, onSelectOrder],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (!event.buttons) return;
      if (!selectionAnchorRef.current) return;
      setSelection({ from: selectionAnchorRef.current, to: { row: rowIndex, col: colIndex } });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {}, []);

  const cancelEditing = () => {
    datePickerOpenRef.current = false;
    setEditingCell(null);
    setEditValue('');
    requestAnimationFrame(() => {
      tableScrollRef.current?.focus();
    });
  };

  const commitEdit = useCallback(
    (nextValue?: string) => {
      if (!editingCell) return;

      const { rowId, colKey } = editingCell;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) {
        cancelEditing();
        return;
      }

      const column = COLUMNS.find((c) => c.key === colKey);
      if (!column) {
        cancelEditing();
        return;
      }

      let finalValue = nextValue ?? editValue;

      // Validate and normalize based on column type
      if (column.type === 'currency') {
        if (!validateNumeric(finalValue)) {
          toast.error('Invalid number');
          cancelEditing();
          return;
        }
        finalValue = normalizeNumeric(finalValue, column.precision ?? 2);
      } else if (column.type === 'schedule') {
        if (scheduleMode === 'dates') {
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
        } else {
          if (!finalValue || finalValue.trim() === '') {
            finalValue = '';
          } else {
            const weekNumber = parseWeekNumber(finalValue);
            if (!weekNumber || weekNumber > 53) {
              toast.error('Invalid week number');
              cancelEditing();
              return;
            }
            finalValue = String(weekNumber);
          }
        }
      }

      // Get the current value for comparison
      const currentValueStr =
        colKey === 'weekNumber' && column.type === 'schedule'
          ? scheduleMode === 'dates'
            ? (row.dueDateIso ?? '')
            : (row.weekNumber ?? '')
          : row[colKey] === null || row[colKey] === undefined
            ? ''
            : String(row[colKey]);

      // Don't update if value hasn't changed
      if (currentValueStr === finalValue) {
        cancelEditing();
        return;
      }

      // Prepare mutation entry
      if (!pendingRef.current.has(rowId)) {
        pendingRef.current.set(rowId, { id: rowId, values: {} });
      }
      const entry = pendingRef.current.get(rowId)!;

      // Create updated row
      const updatedRow = { ...row };

      if (colKey === 'weekNumber') {
        if (scheduleMode === 'dates') {
          const iso = finalValue;
          entry.values.dueDate = iso;
          entry.values.dueDateSource = iso ? 'USER' : 'SYSTEM';
          updatedRow.dueDateIso = iso || null;
          updatedRow.dueDate = iso ? formatDateDisplay(iso) : '';
          updatedRow.dueDateSource = iso ? 'USER' : 'SYSTEM';
          updatedRow.weekNumber = planningWeekConfig
            ? weekLabelForIsoDate(iso, planningWeekConfig)
            : (row.weekNumber ?? '');
        } else {
          if (!finalValue || finalValue.trim() === '') {
            entry.values.dueDate = '';
            entry.values.dueDateSource = 'SYSTEM';
            updatedRow.dueDateIso = null;
            updatedRow.dueDate = '';
            updatedRow.dueDateSource = 'SYSTEM';
            updatedRow.weekNumber = '';
          } else {
            if (!planningWeekConfig) {
              toast.error('Planning calendar unavailable');
              cancelEditing();
              return;
            }
            const year = activeYear ?? new Date().getFullYear();
            const weekLabel = parseWeekNumber(finalValue);
            const globalWeekNumber = weekNumberForYearWeekLabel(
              year,
              weekLabel,
              planningWeekConfig,
            );
            const iso = planningWeekDateIsoForWeekNumber(globalWeekNumber, planningWeekConfig);
            if (!iso) {
              toast.error('Invalid week number for selected year');
              cancelEditing();
              return;
            }
            entry.values.dueDate = iso;
            entry.values.dueDateSource = 'USER';
            updatedRow.dueDateIso = iso;
            updatedRow.dueDate = formatDateDisplay(iso);
            updatedRow.dueDateSource = 'USER';
            updatedRow.weekNumber = finalValue;
          }
        }
      } else if (colKey === 'amountPaid') {
        // Validate that amount doesn't exceed planned
        const plannedAmount = orderSummaries?.get(row.purchaseOrderId)?.plannedAmount ?? 0;
        const numericAmount = parseNumericInput(finalValue) ?? 0;

        if (plannedAmount > 0 && Number.isFinite(numericAmount)) {
          const amountTolerance = Math.max(plannedAmount * 0.001, 0.01);
          const otherPayments = rowsRef.current
            .filter((r) => r.purchaseOrderId === row.purchaseOrderId && r.id !== rowId)
            .reduce((sum, r) => sum + (parseNumericInput(r.amountPaid) ?? 0), 0);
          const totalAmount = otherPayments + numericAmount;

          if (totalAmount > plannedAmount + amountTolerance) {
            toast.error(
              'Amount paid exceeds the expected total. Adjust the values before continuing.',
            );
            cancelEditing();
            return;
          }

          // Derive percentage from amount
          const derivedPercent = numericAmount / plannedAmount;
          const normalizedPercent = (derivedPercent * 100).toFixed(2) + '%';
          entry.values.percentage = String(derivedPercent);
          updatedRow.percentage = normalizedPercent;
        }

        entry.values.amountPaid = finalValue;
        updatedRow.amountPaid = finalValue;
      }

      // Update rows
      const updatedRows = rowsRef.current.map((r) => (r.id === rowId ? updatedRow : r));
      rowsRef.current = updatedRows;
      onRowsChange?.(updatedRows);

      scheduleFlush();
      cancelEditing();
    },
    [
      activeYear,
      editingCell,
      editValue,
      pendingRef,
      scheduleFlush,
      onRowsChange,
      orderSummaries,
      planningWeekConfig,
      scheduleMode,
    ],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
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
      commitEdit();
      moveSelectionTab(e.shiftKey ? -1 : 1);
      requestAnimationFrame(() => {
        tableScrollRef.current?.focus();
      });
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleCellBlur = () => {
    commitEdit();
  };

  const scrollToCell = useCallback((rowId: string, colKey: keyof PurchasePaymentRow) => {
    requestAnimationFrame(() => {
      const node = document.getElementById(cellDomId(rowId, colKey));
      node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number, options: { extendSelection?: boolean } = {}) => {
      if (!activeCell) return;

      const currentRowIndex = data.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = COLUMNS.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      const nextRowIndex = Math.max(0, Math.min(data.length - 1, currentRowIndex + deltaRow));
      const nextColIndex = Math.max(0, Math.min(COLUMNS.length - 1, currentColIndex + deltaCol));

      const nextRow = data[nextRowIndex];
      const nextColKey = COLUMNS[nextColIndex]?.key;
      if (!nextRow || !nextColKey) return;

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
      onSelectOrder?.(nextRow.purchaseOrderId);
      setSelectedPaymentId(nextRow.id);
      setActiveCell({ rowId: nextRow.id, colKey: nextColKey });
      scrollToCell(nextRow.id, nextColKey);
    },
    [activeCell, data, onSelectOrder, scrollToCell],
  );

  const moveSelectionTab = useCallback(
    (direction: 1 | -1) => {
      if (!activeCell) return;

      const currentRowIndex = data.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = COLUMNS.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      let nextRowIndex = currentRowIndex;
      let nextColIndex = currentColIndex + direction;

      if (nextColIndex >= COLUMNS.length) {
        nextColIndex = 0;
        nextRowIndex = Math.min(data.length - 1, currentRowIndex + 1);
      } else if (nextColIndex < 0) {
        nextColIndex = COLUMNS.length - 1;
        nextRowIndex = Math.max(0, currentRowIndex - 1);
      }

      const nextRow = data[nextRowIndex];
      const nextColKey = COLUMNS[nextColIndex]?.key;
      if (!nextRow || !nextColKey) return;

      const coords = { row: nextRowIndex, col: nextColIndex };
      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
      onSelectOrder?.(nextRow.purchaseOrderId);
      setSelectedPaymentId(nextRow.id);
      setActiveCell({ rowId: nextRow.id, colKey: nextColKey });
      scrollToCell(nextRow.id, nextColKey);
    },
    [activeCell, data, onSelectOrder, scrollToCell],
  );

  const startEditingActiveCell = useCallback(() => {
    if (!activeCell) return;
    const row = data.find((r) => r.id === activeCell.rowId);
    const column = COLUMNS.find((c) => c.key === activeCell.colKey);
    if (!row || !column) return;
    if (!column.editable) return;
    startEditing(row.id, column.key, getCellEditValue(row, column, scheduleMode));
  }, [activeCell, data, scheduleMode, startEditing]);

  const buildClipboardText = useCallback(() => {
    const range = selection ?? null;
    if (!range && !activeCell) return '';

    const resolvedRange = (() => {
      if (range) return range;
      const rowIndex = data.findIndex((row) => row.id === activeCell?.rowId);
      const colIndex = COLUMNS.findIndex((column) => column.key === activeCell?.colKey);
      if (rowIndex < 0 || colIndex < 0) return null;
      const coords = { row: rowIndex, col: colIndex };
      return { from: coords, to: coords };
    })();

    if (!resolvedRange) return '';

    const { top, bottom, left, right } = normalizeRange(resolvedRange);
    const lines: string[] = [];

    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const visibleRow = data[rowIndex];
      if (!visibleRow) continue;
      const row = rowsRef.current.find((item) => item.id === visibleRow.id);
      if (!row) continue;

      const cells: string[] = [];
      for (let colIndex = left; colIndex <= right; colIndex += 1) {
        const column = COLUMNS[colIndex];
        if (!column) {
          cells.push('');
          continue;
        }
        cells.push(getCellEditValue(row, column, scheduleMode));
      }
      lines.push(cells.join('\t'));
    }

    return lines.join('\n');
  }, [activeCell, data, scheduleMode, selection]);

  const copySelectionToClipboard = useCallback(() => {
    const text = buildClipboardText();
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
  }, [buildClipboardText]);

  const clearSelectionValues = useCallback(() => {
    const range = selection ?? null;
    if (!range && !activeCell) return;

    const resolvedRange = (() => {
      if (range) return range;
      const rowIndex = data.findIndex((row) => row.id === activeCell?.rowId);
      const colIndex = COLUMNS.findIndex((column) => column.key === activeCell?.colKey);
      if (rowIndex < 0 || colIndex < 0) return null;
      const coords = { row: rowIndex, col: colIndex };
      return { from: coords, to: coords };
    })();

    if (!resolvedRange) return;

    const { top, bottom, left, right } = normalizeRange(resolvedRange);
    let updatedRows = [...rowsRef.current];
    const indexById = new Map(updatedRows.map((row, idx) => [row.id, idx]));
    let cleared = 0;

    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const visibleRow = data[rowIndex];
      if (!visibleRow) continue;

      const targetIndex = indexById.get(visibleRow.id);
      if (targetIndex == null) continue;

      const row = updatedRows[targetIndex];
      if (!row) continue;

      let updatedRow = row;
      let rowChanged = false;

      for (let colIndex = left; colIndex <= right; colIndex += 1) {
        const column = COLUMNS[colIndex];
        if (!column?.editable) continue;

        const colKey = column.key;
        const currentValue =
          colKey === 'weekNumber' && column.type === 'schedule'
            ? scheduleMode === 'dates'
              ? (updatedRow.dueDateIso ?? '')
              : (updatedRow.weekNumber ?? '')
            : updatedRow[colKey] === null || updatedRow[colKey] === undefined
              ? ''
              : String(updatedRow[colKey]);

        if (currentValue === '') continue;

        if (!pendingRef.current.has(updatedRow.id)) {
          pendingRef.current.set(updatedRow.id, { id: updatedRow.id, values: {} });
        }
        const entry = pendingRef.current.get(updatedRow.id)!;

        if (colKey === 'weekNumber') {
          entry.values.dueDate = '';
          entry.values.dueDateSource = 'SYSTEM';
          updatedRow = {
            ...updatedRow,
            dueDateIso: null,
            dueDate: '',
            dueDateSource: 'SYSTEM',
            weekNumber: '',
          };
          rowChanged = true;
          cleared += 1;
          continue;
        }

        if (colKey === 'amountPaid') {
          const plannedAmount = orderSummaries?.get(updatedRow.purchaseOrderId)?.plannedAmount ?? 0;
          const numericAmount = 0;

          if (plannedAmount > 0) {
            const derivedPercent = numericAmount / plannedAmount;
            const normalizedPercent = `${(derivedPercent * 100).toFixed(2)}%`;
            entry.values.percentage = String(derivedPercent);
            updatedRow = { ...updatedRow, percentage: normalizedPercent };
          }

          entry.values.amountPaid = '';
          updatedRow = { ...updatedRow, amountPaid: '' };
          rowChanged = true;
          cleared += 1;
        }
      }

      if (rowChanged) {
        updatedRows[targetIndex] = updatedRow;
      }
    }

    if (cleared === 0) return;

    rowsRef.current = updatedRows;
    onRowsChange?.(updatedRows);
    scheduleFlush();
  }, [
    activeCell,
    data,
    onRowsChange,
    orderSummaries,
    pendingRef,
    scheduleFlush,
    scheduleMode,
    selection,
  ]);

  const applyPastedText = useCallback(
    (text: string, start: { rowId: string; colKey: keyof PurchasePaymentRow }) => {
      const startRowIndex = data.findIndex((row) => row.id === start.rowId);
      const startColIndex = COLUMNS.findIndex((column) => column.key === start.colKey);
      if (startRowIndex < 0 || startColIndex < 0) return;

      const matrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (matrix.length === 0) return;

      let updatedRows = [...rowsRef.current];
      const indexById = new Map(updatedRows.map((row, idx) => [row.id, idx]));
      let applied = 0;
      let skipped = 0;

      for (let r = 0; r < matrix.length; r += 1) {
        for (let c = 0; c < matrix[r]!.length; c += 1) {
          const targetRow = data[startRowIndex + r];
          if (!targetRow) continue;

          const column = COLUMNS[startColIndex + c];
          if (!column?.editable) continue;

          const rowIndex = indexById.get(targetRow.id);
          if (rowIndex == null) continue;

          const row = updatedRows[rowIndex];
          if (!row) continue;

          const rawValue = matrix[r]![c] ?? '';
          let finalValue = rawValue;

          if (column.type === 'currency') {
            if (!validateNumeric(finalValue)) {
              skipped += 1;
              continue;
            }
            finalValue = normalizeNumeric(finalValue, column.precision ?? 2);
          } else if (column.type === 'schedule') {
            if (scheduleMode === 'dates') {
              if (!finalValue || finalValue.trim() === '') {
                finalValue = '';
              } else {
                const iso = toIsoDate(finalValue);
                if (!iso) {
                  skipped += 1;
                  continue;
                }
                finalValue = iso;
              }
            } else {
              if (!finalValue || finalValue.trim() === '') {
                finalValue = '';
              } else {
                const weekNumber = parseWeekNumber(finalValue);
                if (!weekNumber || weekNumber > 53) {
                  skipped += 1;
                  continue;
                }
                finalValue = String(weekNumber);
              }
            }
          }

          const currentValueStr =
            column.key === 'weekNumber' && column.type === 'schedule'
              ? scheduleMode === 'dates'
                ? (row.dueDateIso ?? '')
                : (row.weekNumber ?? '')
              : row[column.key] === null || row[column.key] === undefined
                ? ''
                : String(row[column.key]);

          if (currentValueStr === finalValue) continue;

          if (!pendingRef.current.has(row.id)) {
            pendingRef.current.set(row.id, { id: row.id, values: {} });
          }
          const entry = pendingRef.current.get(row.id)!;

          const nextRow = { ...row };

          if (column.key === 'weekNumber') {
            if (scheduleMode === 'dates') {
              const iso = finalValue;
              entry.values.dueDate = iso;
              entry.values.dueDateSource = iso ? 'USER' : 'SYSTEM';
              nextRow.dueDateIso = iso || null;
              nextRow.dueDate = iso ? formatDateDisplay(iso) : '';
              nextRow.dueDateSource = iso ? 'USER' : 'SYSTEM';
              nextRow.weekNumber = iso
                ? planningWeekConfig
                  ? weekLabelForIsoDate(iso, planningWeekConfig)
                  : (row.weekNumber ?? '')
                : '';
            } else {
              if (!finalValue || finalValue.trim() === '') {
                entry.values.dueDate = '';
                entry.values.dueDateSource = 'SYSTEM';
                nextRow.dueDateIso = null;
                nextRow.dueDate = '';
                nextRow.dueDateSource = 'SYSTEM';
                nextRow.weekNumber = '';
              } else {
                if (!planningWeekConfig) {
                  skipped += 1;
                  continue;
                }
                const year = activeYear ?? new Date().getFullYear();
                const weekLabel = parseWeekNumber(finalValue);
                const globalWeekNumber = weekNumberForYearWeekLabel(
                  year,
                  weekLabel,
                  planningWeekConfig,
                );
                const iso = planningWeekDateIsoForWeekNumber(globalWeekNumber, planningWeekConfig);
                if (!iso) {
                  skipped += 1;
                  continue;
                }
                entry.values.dueDate = iso;
                entry.values.dueDateSource = 'USER';
                nextRow.dueDateIso = iso;
                nextRow.dueDate = formatDateDisplay(iso);
                nextRow.dueDateSource = 'USER';
                nextRow.weekNumber = finalValue;
              }
            }
          } else if (column.key === 'amountPaid') {
            const plannedAmount = orderSummaries?.get(row.purchaseOrderId)?.plannedAmount ?? 0;
            const numericAmount = parseNumericInput(finalValue) ?? 0;

            if (plannedAmount > 0 && Number.isFinite(numericAmount)) {
              const amountTolerance = Math.max(plannedAmount * 0.001, 0.01);
              const otherPayments = updatedRows
                .filter(
                  (item) => item.purchaseOrderId === row.purchaseOrderId && item.id !== row.id,
                )
                .reduce((sum, item) => sum + (parseNumericInput(item.amountPaid) ?? 0), 0);
              const totalAmount = otherPayments + numericAmount;

              if (totalAmount > plannedAmount + amountTolerance) {
                skipped += 1;
                continue;
              }

              const derivedPercent = numericAmount / plannedAmount;
              const normalizedPercent = (derivedPercent * 100).toFixed(2) + '%';
              entry.values.percentage = String(derivedPercent);
              nextRow.percentage = normalizedPercent;
            }

            entry.values.amountPaid = finalValue;
            nextRow.amountPaid = finalValue;
          }

          updatedRows[rowIndex] = nextRow;
          applied += 1;
        }
      }

      if (applied === 0) return;

      rowsRef.current = updatedRows;
      onRowsChange?.(updatedRows);
      scheduleFlush();

      toast.success(`Pasted ${applied} cell${applied === 1 ? '' : 's'}`);
      if (skipped > 0) {
        toast.warning(`Skipped ${skipped} cell${skipped === 1 ? '' : 's'}`, {
          description: 'Some values could not be applied.',
        });
      }
    },
    [
      activeYear,
      data,
      onRowsChange,
      orderSummaries,
      pendingRef,
      planningWeekConfig,
      scheduleFlush,
      scheduleMode,
    ],
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      const text = buildClipboardText();
      if (!text) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
    },
    [buildClipboardText],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      const clipboard = clipboardRef.current;
      const refocus = () => {
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
            const row = data[normalizedSelection.top];
            const column = COLUMNS[normalizedSelection.left];
            if (!row || !column) return null;
            return { rowId: row.id, colKey: column.key };
          })()
        : null;
      const start = selectionStart ?? fallbackStart;

      if (!start) {
        refocus();
        return;
      }

      const text = event.clipboardData.getData('text/plain');
      event.preventDefault();
      if (!text) {
        refocus();
        return;
      }

      const matrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (matrix.length === 0) {
        refocus();
        return;
      }

      if (
        hasMultiSelection &&
        normalizedSelection &&
        matrix.length === 1 &&
        matrix[0]?.length === 1
      ) {
        const rawValue = matrix[0]?.[0] ?? '';
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
      refocus();
    },
    [activeCell, applyPastedText, data, selection],
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
      if (!activeCell) return;

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelectionToClipboard();
        return;
      }

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
        const row = data.find((r) => r.id === activeCell.rowId);
        const column = COLUMNS.find((c) => c.key === activeCell.colKey);
        if (!row || !column) return;
        if (!column.editable) return;

        event.preventDefault();
        // Don't select all when starting edit by typing - cursor at end
        selectOnFocusRef.current = false;
        startEditing(row.id, column.key, event.key);
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
          moveSelection(jump ? data.length : 1, 0, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowUp') {
          moveSelection(jump ? -data.length : -1, 0, { extendSelection: event.shiftKey });
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
      data,
      editingCell,
      moveSelection,
      moveSelectionTab,
      startEditing,
      startEditingActiveCell,
    ],
  );

  const handleTableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      handleGridKeyDown(event);
    },
    [handleGridKeyDown],
  );

  const formatDisplayValue = (row: PurchasePaymentRow, column: ColumnDef): string => {
    if (column.type === 'schedule') {
      if (scheduleMode === 'dates') {
        return row.dueDateIso ? formatDateDisplay(row.dueDateIso) : '';
      }
      return row.weekNumber ?? '';
    }

    const value = row[column.key];
    if (value === null || value === undefined || value === '') return '';

    if (column.type === 'date') {
      const isoValue = typeof value === 'string' ? value : null;
      return isoValue ? formatDateDisplay(isoValue) : '';
    }

    if (column.type === 'currency') {
      const num = sanitizeNumeric(String(value));
      if (Number.isNaN(num)) return String(value);
      return `$${num.toFixed(column.precision ?? 2)}`;
    }

    if (column.type === 'percent') {
      const num = sanitizeNumeric(String(value));
      if (Number.isNaN(num)) return String(value);
      return `${(num * 100).toFixed(column.precision ?? 2)}%`;
    }

    return String(value);
  };

  const renderCell = (
    row: PurchasePaymentRow,
    rowIndex: number,
    column: ColumnDef,
    colIndex: number,
  ) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === column.key;
    const isCurrent = activeCell?.rowId === row.id && activeCell?.colKey === column.key;
    const displayValue = formatDisplayValue(row, column);
    const isSelected = selectionRange
      ? rowIndex >= selectionRange.top &&
        rowIndex <= selectionRange.bottom &&
        colIndex >= selectionRange.left &&
        colIndex <= selectionRange.right
      : false;
    const boxShadow = getSelectionBorderBoxShadow(selectionRange, { row: rowIndex, col: colIndex });
    const isScheduleDate = column.type === 'schedule' && scheduleMode === 'dates';
    const isWeekLabel = column.type === 'schedule' && scheduleMode === 'weeks';
    const isNumericCell = column.type === 'currency' || column.type === 'percent';
    const rowSelected = isRowActive(row);

    const cellClassName = cn(
      'h-8 overflow-hidden whitespace-nowrap border-r p-0 align-middle text-sm',
      colIndex === 0 && rowSelected && 'border-l-4 border-cyan-600 dark:border-cyan-400',
      isNumericCell && 'text-right',
      isWeekLabel && 'text-center',
      column.editable
        ? 'cursor-text bg-accent/50 font-medium'
        : 'bg-muted/50 text-muted-foreground',
      isSelected && 'bg-accent',
      (isEditing || isCurrent) && 'ring-2 ring-inset ring-cyan-600 dark:ring-cyan-400',
      colIndex === COLUMNS.length - 1 && 'border-r-0',
    );

    const inputClassName = cn(
      'h-8 w-full bg-transparent px-3 text-sm font-semibold text-foreground outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring',
      isNumericCell && 'text-right',
      isWeekLabel && 'text-center',
    );

    if (isEditing) {
      return (
        <TableCell
          key={column.key}
          id={cellDomId(row.id, column.key)}
          className={cellClassName}
          style={{ width: column.width, minWidth: column.width, boxShadow }}
        >
          {column.type === 'date' || isScheduleDate ? (
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
                  commitEdit(dateStr || editValue);
                },
              }}
              onChange={(_dates: Date[], dateStr: string) => {
                setEditValue(dateStr);
              }}
              render={(_props: any, handleNodeChange: (node: HTMLElement | null) => void) => (
                <input
                  ref={(node) => {
                    handleNodeChange(node);
                    inputRef.current = node as HTMLInputElement | null;
                  }}
                  type="text"
                  value={editValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    if (!datePickerOpenRef.current) {
                      handleCellBlur();
                    }
                  }}
                  className={inputClassName}
                  placeholder="YYYY-MM-DD"
                />
              )}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleCellBlur}
              className={inputClassName}
            />
          )}
        </TableCell>
      );
    }

    const showPlaceholder = (column.type === 'date' || isScheduleDate) && !displayValue;

    return (
      <TableCell
        key={column.key}
        id={cellDomId(row.id, column.key)}
        className={cellClassName}
        style={{ width: column.width, minWidth: column.width, boxShadow }}
        title={showPlaceholder ? undefined : displayValue || undefined}
        onPointerDown={(event) => handlePointerDown(event, rowIndex, colIndex)}
        onPointerMove={(event) => handlePointerMove(event, rowIndex, colIndex)}
        onPointerUp={handlePointerUp}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!column.editable) return;
          startEditing(row.id, column.key, getCellEditValue(row, column, scheduleMode));
        }}
      >
        <div
          className={cn(
            'flex h-8 min-w-0 items-center px-3',
            isNumericCell && 'justify-end',
            isWeekLabel && 'justify-center',
          )}
        >
          {showPlaceholder ? (
            <span className="text-xs italic text-muted-foreground">Click to select</span>
          ) : (
            <span
              className={cn(
                'block min-w-0 truncate',
                isWeekLabel
                  ? 'text-center'
                  : isNumericCell
                    ? 'text-right tabular-nums'
                    : 'text-left',
              )}
            >
              {displayValue}
            </span>
          )}
        </div>
      </TableCell>
    );
  };

  const isRowActive = (row: PurchasePaymentRow): boolean => {
    if (selectedPaymentId && row.id === selectedPaymentId) return true;
    if (!selectedPaymentId && activeOrderId && row.purchaseOrderId === activeOrderId) return true;
    return false;
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
          Payments
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-200/80">
          {summaryText && <span>{summaryText}</span>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onAddPayment) void onAddPayment();
              }}
              disabled={!activeOrderId || isLoading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10"
            >
              Add Payment
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedPaymentId || !onRemovePayment) return;
                setIsRemoving(true);
                Promise.resolve(onRemovePayment(selectedPaymentId))
                  .then(() => setSelectedPaymentId(null))
                  .catch((error) => {
                    console.error(error);
                    toast.error('Unable to delete payment');
                  })
                  .finally(() => setIsRemoving(false));
              }}
              disabled={!selectedPaymentId || isLoading || isRemoving}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 enabled:hover:border-rose-500 enabled:hover:bg-rose-100 enabled:hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-300 dark:focus:ring-rose-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-rose-500/80 dark:enabled:hover:bg-rose-500/20"
            >
              Remove Payment
            </button>
          </div>
        </div>
      </header>

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
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    style={{ width: column.width, minWidth: column.width }}
                    className="sticky top-0 z-10 h-10 whitespace-nowrap border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80"
                  >
                    {column.type === 'schedule' ? (
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700 transition hover:bg-cyan-500/20 dark:border-cyan-300/35 dark:bg-cyan-300/10 dark:text-cyan-200 dark:hover:bg-cyan-300/20"
                        title={`Click to switch to ${scheduleMode === 'weeks' ? 'date' : 'week'} input`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleScheduleMode();
                        }}
                      >
                        {getHeaderLabel(column, scheduleMode)}
                      </button>
                    ) : (
                      getHeaderLabel(column, scheduleMode)
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={COLUMNS.length}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    {activeOrderId
                      ? 'No payments for this order. Click "Add Payment" to schedule one.'
                      : 'Select a purchase order above to view or add payments.'}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, rowIndex) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'hover:bg-transparent',
                      rowIndex % 2 === 1 && 'bg-muted/30',
                      isRowActive(row) && 'bg-cyan-50/70 dark:bg-cyan-900/20',
                    )}
                    onClick={() => {
                      onSelectOrder?.(row.purchaseOrderId);
                      setSelectedPaymentId(row.id);
                    }}
                  >
                    {COLUMNS.map((column, colIndex) => renderCell(row, rowIndex, column, colIndex))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
