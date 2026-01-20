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
import { useMutationQueue } from '@/hooks/useMutationQueue';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { useGridUndoRedo, type CellEdit } from '@/hooks/useGridUndoRedo';
import { cn } from '@/lib/utils';
import { getSelectionBorderBoxShadow } from '@/lib/grid/selection-border';
import {
  formatNumericInput,
  formatPercentInput,
  sanitizeNumeric,
} from '@/components/sheets/validators';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { withAppBasePath } from '@/lib/base-path';

export type OpsBatchRow = {
  id: string;
  purchaseOrderId: string;
  orderCode: string;
  batchCode?: string;
  productId: string;
  productName: string;
  quantity: string;
  sellingPrice: string;
  manufacturingCost: string;
  freightCost: string;
  tariffRate: string;
  tariffCost: string;
  tacosPercent: string;
  fbaFee: string;
  referralRate: string;
  storagePerMonth: string;
  // Carton dimensions for CBM
  cartonSide1Cm: string;
  cartonSide2Cm: string;
  cartonSide3Cm: string;
  cartonWeightKg: string;
  unitsPerCarton: string;
  // Computed fields
  cbm?: string;
  grossProfit?: string;
  netProfit?: string;
};

interface CustomOpsCostGridProps {
  rows: OpsBatchRow[];
  activeOrderId?: string | null;
  activeBatchId?: string | null;
  scrollKey?: string | null;
  onSelectOrder?: (orderId: string) => void;
  onSelectBatch?: (batchId: string) => void;
  onRowsChange?: (rows: OpsBatchRow[]) => void;
  onAddBatch?: () => void;
  onDeleteBatch?: () => void;
  disableAdd?: boolean;
  disableDelete?: boolean;
  products: Array<{ id: string; name: string }>;
  onSync?: () => void;
}

const NUMERIC_FIELDS = [
  'quantity',
  'sellingPrice',
  'manufacturingCost',
  'freightCost',
  'tariffCost',
  'fbaFee',
  'storagePerMonth',
  'cartonSide1Cm',
  'cartonSide2Cm',
  'cartonSide3Cm',
  'cartonWeightKg',
  'unitsPerCarton',
] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

const NUMERIC_PRECISION: Record<NumericField, number> = {
  quantity: 0,
  sellingPrice: 2,
  manufacturingCost: 3,
  freightCost: 3,
  tariffCost: 3,
  fbaFee: 3,
  storagePerMonth: 3,
  cartonSide1Cm: 2,
  cartonSide2Cm: 2,
  cartonSide3Cm: 2,
  cartonWeightKg: 3,
  unitsPerCarton: 0,
};

const PERCENT_FIELDS = ['tariffRate', 'tacosPercent', 'referralRate'] as const;
type PercentField = (typeof PERCENT_FIELDS)[number];

const PERCENT_PRECISION: Record<PercentField, number> = {
  tariffRate: 2,
  tacosPercent: 2,
  referralRate: 2,
};

const NUMERIC_FIELD_SET = new Set<string>(NUMERIC_FIELDS);
const PERCENT_FIELD_SET = new Set<string>(PERCENT_FIELDS);

const SERVER_FIELD_MAP: Partial<Record<keyof OpsBatchRow, string>> = {
  quantity: 'quantity',
  sellingPrice: 'overrideSellingPrice',
  manufacturingCost: 'overrideManufacturingCost',
  freightCost: 'overrideFreightCost',
  tariffRate: 'overrideTariffRate',
  tariffCost: 'overrideTariffCost',
  tacosPercent: 'overrideTacosPercent',
  fbaFee: 'overrideFbaFee',
  referralRate: 'overrideReferralRate',
  storagePerMonth: 'overrideStoragePerMonth',
  cartonSide1Cm: 'cartonSide1Cm',
  cartonSide2Cm: 'cartonSide2Cm',
  cartonSide3Cm: 'cartonSide3Cm',
  cartonWeightKg: 'cartonWeightKg',
  unitsPerCarton: 'unitsPerCarton',
};

function isNumericField(field: keyof OpsBatchRow): field is NumericField {
  return NUMERIC_FIELD_SET.has(field as string);
}

function isPercentField(field: keyof OpsBatchRow): field is PercentField {
  return PERCENT_FIELD_SET.has(field as string);
}

function normalizeCurrency(value: unknown, fractionDigits = 2): string {
  return formatNumericInput(value, fractionDigits);
}

function normalizePercent(value: unknown, fractionDigits = 4): string {
  return formatPercentInput(value, fractionDigits);
}

function validateNumeric(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const parsed = sanitizeNumeric(value);
  return !Number.isNaN(parsed);
}

type ColumnDef = {
  key: keyof OpsBatchRow;
  header: string;
  width: number;
  type: 'text' | 'numeric' | 'percent' | 'dropdown';
  editable: boolean;
  precision?: number;
  computed?: boolean;
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

const COLUMNS_BEFORE_TARIFF: ColumnDef[] = [
  { key: 'orderCode', header: 'PO Code', width: 140, type: 'text', editable: false },
  { key: 'productName', header: 'Product', width: 140, type: 'dropdown', editable: true },
  { key: 'quantity', header: 'Qty', width: 110, type: 'numeric', editable: true, precision: 0 },
  {
    key: 'sellingPrice',
    header: 'Sell $',
    width: 120,
    type: 'numeric',
    editable: true,
    precision: 2,
  },
  {
    key: 'manufacturingCost',
    header: 'Mfg $',
    width: 120,
    type: 'numeric',
    editable: true,
    precision: 3,
  },
  {
    key: 'freightCost',
    header: 'Freight $',
    width: 120,
    type: 'numeric',
    editable: true,
    precision: 3,
  },
];

const TARIFF_RATE_COLUMN: ColumnDef = {
  key: 'tariffRate',
  header: 'Tariff %',
  width: 110,
  type: 'percent',
  editable: true,
  precision: 2,
};

const TARIFF_COST_COLUMN: ColumnDef = {
  key: 'tariffCost',
  header: 'Tariff $',
  width: 120,
  type: 'numeric',
  editable: true,
  precision: 3,
};

const COLUMNS_AFTER_TARIFF: ColumnDef[] = [
  {
    key: 'tacosPercent',
    header: 'TACoS %',
    width: 110,
    type: 'percent',
    editable: true,
    precision: 2,
  },
  { key: 'fbaFee', header: 'FBA $', width: 110, type: 'numeric', editable: true, precision: 3 },
  {
    key: 'referralRate',
    header: 'Referral %',
    width: 110,
    type: 'percent',
    editable: true,
    precision: 2,
  },
  {
    key: 'storagePerMonth',
    header: 'Storage $',
    width: 120,
    type: 'numeric',
    editable: true,
    precision: 3,
  },
];

// Carton dimensions are editable but displayed in the CBM column
const CBM_COLUMNS: ColumnDef[] = [
  {
    key: 'unitsPerCarton',
    header: 'Units/Ctn',
    width: 100,
    type: 'numeric',
    editable: true,
    precision: 0,
  },
  {
    key: 'cartonSide1Cm',
    header: 'L (cm)',
    width: 85,
    type: 'numeric',
    editable: true,
    precision: 2,
  },
  {
    key: 'cartonSide2Cm',
    header: 'W (cm)',
    width: 85,
    type: 'numeric',
    editable: true,
    precision: 2,
  },
  {
    key: 'cartonSide3Cm',
    header: 'H (cm)',
    width: 85,
    type: 'numeric',
    editable: true,
    precision: 2,
  },
];

/**
 * Compute total CBM for a batch row.
 * Formula: (side1 * side2 * side3) / 1,000,000 * (quantity / unitsPerCarton)
 */
function computeCbm(row: OpsBatchRow): number | null {
  const side1 = sanitizeNumeric(row.cartonSide1Cm);
  const side2 = sanitizeNumeric(row.cartonSide2Cm);
  const side3 = sanitizeNumeric(row.cartonSide3Cm);
  const unitsPerCarton = sanitizeNumeric(row.unitsPerCarton);
  const quantity = sanitizeNumeric(row.quantity);

  if (
    Number.isNaN(side1) ||
    Number.isNaN(side2) ||
    Number.isNaN(side3) ||
    Number.isNaN(unitsPerCarton) ||
    Number.isNaN(quantity) ||
    side1 <= 0 ||
    side2 <= 0 ||
    side3 <= 0 ||
    unitsPerCarton <= 0
  ) {
    return null;
  }

  const cbmPerCarton = (side1 * side2 * side3) / 1_000_000;
  const totalCartons = Math.ceil(quantity / unitsPerCarton);
  return cbmPerCarton * totalCartons;
}

type TariffInputMode = 'rate' | 'cost';
type ProfitDisplayMode = 'unit' | 'total' | 'percent';

const CELL_ID_PREFIX = 'xplan-ops-batch';

function sanitizeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cellDomId(rowId: string, colKey: keyof OpsBatchRow): string {
  return `${CELL_ID_PREFIX}:${sanitizeDomId(rowId)}:${String(colKey)}`;
}

export function CustomOpsCostGrid({
  rows,
  activeOrderId,
  activeBatchId,
  scrollKey,
  onSelectOrder,
  onSelectBatch,
  onRowsChange,
  onAddBatch,
  onDeleteBatch,
  disableAdd,
  disableDelete,
  products,
  onSync,
}: CustomOpsCostGridProps) {
  const [tariffInputMode, setTariffInputMode] = usePersistentState<TariffInputMode>(
    'xplan:ops:batch-tariff-mode',
    'rate',
  );
  const [profitDisplayMode, setProfitDisplayMode] = usePersistentState<ProfitDisplayMode>(
    'xplan:ops:batch-profit-display-mode',
    'unit',
  );

  const setProfitMode = useCallback(
    (next: ProfitDisplayMode) => {
      setProfitDisplayMode(next);
    },
    [setProfitDisplayMode],
  );

  const columns = useMemo(() => {
    const tariffColumn = tariffInputMode === 'cost' ? TARIFF_COST_COLUMN : TARIFF_RATE_COLUMN;
    const profitColumns: ColumnDef[] =
      profitDisplayMode === 'percent'
        ? [
            {
              key: 'grossProfit',
              header: 'GP %',
              width: 110,
              type: 'percent',
              editable: false,
              precision: 2,
              computed: true,
            },
            {
              key: 'netProfit',
              header: 'NP %',
              width: 110,
              type: 'percent',
              editable: false,
              precision: 2,
              computed: true,
            },
          ]
        : [
              {
                key: 'grossProfit',
                header: 'GP $',
                width: 130,
                type: 'numeric',
                editable: false,
                precision: profitDisplayMode === 'total' ? 0 : 2,
                computed: true,
              },
              {
                key: 'netProfit',
                header: 'NP $',
                width: 130,
                type: 'numeric',
                editable: false,
                precision: profitDisplayMode === 'total' ? 0 : 2,
                computed: true,
              },
            ];

    // Add computed CBM column
    const cbmColumn: ColumnDef = {
      key: 'cbm',
      header: 'CBM',
      width: 90,
      type: 'numeric',
      editable: false,
      precision: 3,
      computed: true,
    };

    return [...COLUMNS_BEFORE_TARIFF, tariffColumn, ...COLUMNS_AFTER_TARIFF, ...CBM_COLUMNS, cbmColumn, ...profitColumns];
  }, [profitDisplayMode, tariffInputMode]);

  const [localRows, setLocalRows] = useState<OpsBatchRow[]>(rows);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: keyof OpsBatchRow;
  } | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: keyof OpsBatchRow } | null>(
    null,
  );
  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<CellCoords | null>(null);
  const selectionRange = useMemo(() => (selection ? normalizeRange(selection) : null), [selection]);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const selectOnFocusRef = useRef(true);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);
  const pasteStartRef = useRef<{ rowId: string; colKey: keyof OpsBatchRow } | null>(null);

  usePersistentScroll(scrollKey ?? null, true, () => tableScrollRef.current);

  // Keep a local copy to avoid UI flicker when parent props refresh after saving.
  useEffect(() => {
    setLocalRows((previous) => {
      if (previous.length === 0) return rows;
      const byId = new Map(previous.map((row) => [row.id, row]));
      let changed = previous.length !== rows.length;

      const next = rows.map((row, index) => {
        const existing = byId.get(row.id);
        if (!existing) {
          changed = true;
          return row;
        }

        if (!changed && previous[index]?.id !== row.id) {
          changed = true;
        }

        const serializedExisting = JSON.stringify(existing);
        const serializedIncoming = JSON.stringify(row);
        if (serializedExisting !== serializedIncoming) {
          changed = true;
          return row;
        }
        return existing;
      });

      return changed ? next : previous;
    });
  }, [rows]);

  const handleFlush = useCallback(
    async (payload: Array<{ id: string; values: Record<string, string | null> }>) => {
      if (payload.length === 0) return;
      // Filter out items that no longer exist in the current rows
      const existingIds = new Set(localRows.map((r) => r.id));
      const validPayload = payload.filter((item) => existingIds.has(item.id));
      if (validPayload.length === 0) return;
      try {
        const response = await fetch(withAppBasePath('/api/v1/xplan/purchase-orders/batches'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: validPayload }),
        });
        if (!response.ok) throw new Error('Failed to update batch cost overrides');
        toast.success('Batch cost saved', { id: 'batch-cost-saved' });
        onSync?.();
      } catch (error) {
        console.error(error);
        toast.error('Unable to save batch costs', { id: 'batch-cost-error' });
      }
    },
    [localRows, onSync],
  );

  const { pendingRef, scheduleFlush, flushNow } = useMutationQueue<
    string,
    { id: string; values: Record<string, string | null> }
  >({
    debounceMs: 500,
    onFlush: handleFlush,
  });

  // Undo/redo functionality
  const applyUndoRedoEdits = useCallback(
    (edits: CellEdit<string>[]) => {
      let updatedRows = [...localRows];
      for (const edit of edits) {
        const rowIndex = updatedRows.findIndex((r) => r.id === edit.rowKey);
        if (rowIndex < 0) continue;
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [edit.field]: edit.newValue };

        // Queue for API update
        if (!pendingRef.current.has(edit.rowKey)) {
          pendingRef.current.set(edit.rowKey, { id: edit.rowKey, values: {} });
        }
        const entry = pendingRef.current.get(edit.rowKey)!;
        const serverKey = SERVER_FIELD_MAP[edit.field as keyof OpsBatchRow];
        if (serverKey) {
          entry.values[serverKey] = edit.newValue === '' ? null : edit.newValue;
        } else if (edit.field === 'productId') {
          entry.values.productId = edit.newValue;
        }
      }
      setLocalRows(updatedRows);
      onRowsChange?.(updatedRows);
      scheduleFlush();
    },
    [localRows, pendingRef, scheduleFlush, onRowsChange],
  );

  const { recordEdits, undo, redo } = useGridUndoRedo<string>({
    maxHistory: 50,
    onApplyEdits: applyUndoRedoEdits,
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

  const startEditing = useCallback(
    (rowId: string, colKey: keyof OpsBatchRow, currentValue: string) => {
      setActiveCell({ rowId, colKey });
      setEditingCell({ rowId, colKey });
      setEditValue(currentValue);
    },
    [],
  );

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
    requestAnimationFrame(() => {
      tableScrollRef.current?.focus();
    });
  }, []);

  const toggleTariffInputMode = useCallback(() => {
    cancelEditing();
    setTariffInputMode((previous) => (previous === 'rate' ? 'cost' : 'rate'));
  }, [cancelEditing, setTariffInputMode]);

  const commitEdit = useCallback(
    (overrideValue?: string) => {
      if (!editingCell) return;

      const { rowId, colKey } = editingCell;
      const row = localRows.find((r) => r.id === rowId);
      if (!row) {
        cancelEditing();
        return;
      }

      const column = columns.find((c) => c.key === colKey);
      if (!column) {
        cancelEditing();
        return;
      }

      let finalValue = overrideValue ?? editValue;

      // Validate and normalize based on column type
      if (column.type === 'numeric') {
        if (!validateNumeric(finalValue)) {
          toast.error('Invalid number');
          cancelEditing();
          return;
        }
        const precision = column.precision ?? NUMERIC_PRECISION[colKey as NumericField] ?? 2;
        finalValue = normalizeCurrency(finalValue, precision);
      } else if (column.type === 'percent') {
        if (!validateNumeric(finalValue)) {
          toast.error('Invalid percentage');
          cancelEditing();
          return;
        }
        const precision = column.precision ?? PERCENT_PRECISION[colKey as PercentField] ?? 4;
        finalValue = normalizePercent(finalValue, precision);
      } else if (column.type === 'dropdown') {
        // Handle product selection
        const selected = products.find((p) => p.name === finalValue);
        if (!selected && finalValue) {
          toast.error('Select a valid product');
          cancelEditing();
          return;
        }
      }

      // Don't update if value hasn't changed
      if (row[colKey] === finalValue) {
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

      if (colKey === 'productName') {
        const selected = products.find((p) => p.name === finalValue);
        if (selected) {
          entry.values.productId = selected.id;
          updatedRow.productId = selected.id;
          updatedRow.productName = selected.name;
        }
      } else if (colKey === 'tariffCost') {
        entry.values.overrideTariffCost = finalValue === '' ? null : finalValue;
        entry.values.overrideTariffRate = null;
        updatedRow.tariffCost = finalValue;
        updatedRow.tariffRate = '';
      } else if (colKey === 'tariffRate') {
        entry.values.overrideTariffRate = finalValue === '' ? null : finalValue;
        entry.values.overrideTariffCost = null;
        updatedRow.tariffRate = finalValue;
        updatedRow.tariffCost = '';
      } else if (isNumericField(colKey)) {
        const serverKey = SERVER_FIELD_MAP[colKey];
        if (serverKey) {
          entry.values[serverKey] = finalValue === '' ? null : finalValue;
        }
        updatedRow[colKey] = finalValue;
      } else if (isPercentField(colKey)) {
        const serverKey = SERVER_FIELD_MAP[colKey];
        if (serverKey) {
          entry.values[serverKey] = finalValue === '' ? null : finalValue;
        }
        updatedRow[colKey] = finalValue;
      }

      // Record edits for undo/redo
      const undoEdits: CellEdit<string>[] = [];
      if (colKey === 'productName') {
        const selected = products.find((p) => p.name === finalValue);
        if (selected) {
          undoEdits.push({
            rowKey: rowId,
            field: 'productId',
            oldValue: row.productId,
            newValue: selected.id,
          });
          undoEdits.push({
            rowKey: rowId,
            field: 'productName',
            oldValue: row.productName,
            newValue: selected.name,
          });
        }
      } else {
        undoEdits.push({
          rowKey: rowId,
          field: colKey,
          oldValue: row[colKey] ?? '',
          newValue: finalValue,
        });
      }
      if (undoEdits.length > 0) {
        recordEdits(undoEdits);
      }

      // Update rows
      const updatedRows = localRows.map((r) => (r.id === rowId ? updatedRow : r));
      setLocalRows(updatedRows);
      onRowsChange?.(updatedRows);

      scheduleFlush();
      cancelEditing();
    },
    [
      editingCell,
      editValue,
      localRows,
      products,
      pendingRef,
      scheduleFlush,
      onRowsChange,
      columns,
      cancelEditing,
      recordEdits,
    ],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditValue(e.target.value);
  };

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) => {
      if (editingCell) return;
      tableScrollRef.current?.focus();

      const row = localRows[rowIndex];
      const column = columns[colIndex];
      if (!row || !column) return;

      onSelectOrder?.(row.purchaseOrderId);
      onSelectBatch?.(row.id);
      setActiveCell({ rowId: row.id, colKey: column.key });

      const coords = { row: rowIndex, col: colIndex };
      if (event.shiftKey && selectionAnchorRef.current) {
        setSelection({ from: selectionAnchorRef.current, to: coords });
        return;
      }

      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
    },
    [columns, editingCell, localRows, onSelectBatch, onSelectOrder],
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

  const handleCellBlur = () => {
    commitEdit();
  };

  const scrollToCell = useCallback((rowId: string, colKey: keyof OpsBatchRow) => {
    requestAnimationFrame(() => {
      const node = document.getElementById(cellDomId(rowId, colKey));
      node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number, options: { extendSelection?: boolean } = {}) => {
      if (!activeCell) return;

      const currentRowIndex = localRows.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = columns.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      const nextRowIndex = Math.max(0, Math.min(localRows.length - 1, currentRowIndex + deltaRow));
      const nextColIndex = Math.max(0, Math.min(columns.length - 1, currentColIndex + deltaCol));

      const nextRow = localRows[nextRowIndex];
      const nextColKey = columns[nextColIndex]?.key;
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
      setActiveCell({ rowId: nextRow.id, colKey: nextColKey });
      onSelectOrder?.(nextRow.purchaseOrderId);
      onSelectBatch?.(nextRow.id);
      scrollToCell(nextRow.id, nextColKey);
    },
    [activeCell, columns, localRows, onSelectBatch, onSelectOrder, scrollToCell],
  );

  const moveSelectionTab = useCallback(
    (direction: 1 | -1) => {
      if (!activeCell) return;

      const currentRowIndex = localRows.findIndex((row) => row.id === activeCell.rowId);
      const currentColIndex = columns.findIndex((column) => column.key === activeCell.colKey);
      if (currentRowIndex < 0 || currentColIndex < 0) return;

      let nextRowIndex = currentRowIndex;
      let nextColIndex = currentColIndex + direction;

      if (nextColIndex >= columns.length) {
        nextColIndex = 0;
        nextRowIndex = Math.min(localRows.length - 1, currentRowIndex + 1);
      } else if (nextColIndex < 0) {
        nextColIndex = columns.length - 1;
        nextRowIndex = Math.max(0, currentRowIndex - 1);
      }

      const nextRow = localRows[nextRowIndex];
      const nextColKey = columns[nextColIndex]?.key;
      if (!nextRow || !nextColKey) return;

      const coords = { row: nextRowIndex, col: nextColIndex };
      selectionAnchorRef.current = coords;
      setSelection({ from: coords, to: coords });
      setActiveCell({ rowId: nextRow.id, colKey: nextColKey });
      onSelectOrder?.(nextRow.purchaseOrderId);
      onSelectBatch?.(nextRow.id);
      scrollToCell(nextRow.id, nextColKey);
    },
    [activeCell, columns, localRows, onSelectBatch, onSelectOrder, scrollToCell],
  );

  const startEditingActiveCell = useCallback(() => {
    if (!activeCell) return;
    const row = localRows.find((r) => r.id === activeCell.rowId);
    const column = columns.find((c) => c.key === activeCell.colKey);
    if (!row || !column) return;
    if (!column.editable) return;
    startEditing(row.id, column.key, row[column.key] ?? '');
  }, [activeCell, columns, localRows, startEditing]);

  const buildClipboardText = useCallback(() => {
    const range = selection ?? null;
    if (!range && !activeCell) return '';

    const resolvedRange = (() => {
      if (range) return range;
      const rowIndex = localRows.findIndex((row) => row.id === activeCell?.rowId);
      const colIndex = columns.findIndex((column) => column.key === activeCell?.colKey);
      if (rowIndex < 0 || colIndex < 0) return null;
      const coords = { row: rowIndex, col: colIndex };
      return { from: coords, to: coords };
    })();

    if (!resolvedRange) return '';

    const { top, bottom, left, right } = normalizeRange(resolvedRange);
    const lines: string[] = [];

    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const row = localRows[rowIndex];
      if (!row) continue;
      const cells: string[] = [];
      for (let colIndex = left; colIndex <= right; colIndex += 1) {
        const column = columns[colIndex];
        const value = column ? (row[column.key] ?? '') : '';
        cells.push(String(value ?? ''));
      }
      lines.push(cells.join('\t'));
    }

    return lines.join('\n');
  }, [activeCell, columns, localRows, selection]);

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
      const rowIndex = localRows.findIndex((row) => row.id === activeCell?.rowId);
      const colIndex = columns.findIndex((column) => column.key === activeCell?.colKey);
      if (rowIndex < 0 || colIndex < 0) return null;
      const coords = { row: rowIndex, col: colIndex };
      return { from: coords, to: coords };
    })();

    if (!resolvedRange) return;

    const { top, bottom, left, right } = normalizeRange(resolvedRange);
    let updatedRows = [...localRows];
    let cleared = 0;
    const undoEdits: CellEdit<string>[] = [];

    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const row = updatedRows[rowIndex];
      if (!row) continue;

      let updatedRow = row;
      let rowChanged = false;

      for (let colIndex = left; colIndex <= right; colIndex += 1) {
        const column = columns[colIndex];
        if (!column?.editable) continue;
        if (column.type === 'dropdown') continue;

        const colKey = column.key;
        const currentValue = (updatedRow[colKey] ?? '') as string;
        if (currentValue === '') continue;

        if (!pendingRef.current.has(row.id)) {
          pendingRef.current.set(row.id, { id: row.id, values: {} });
        }
        const entry = pendingRef.current.get(row.id)!;

        if (colKey === 'tariffCost') {
          entry.values.overrideTariffCost = null;
          entry.values.overrideTariffRate = null;
          undoEdits.push({ rowKey: row.id, field: 'tariffCost', oldValue: updatedRow.tariffCost, newValue: '' });
          updatedRow = { ...updatedRow, tariffCost: '', tariffRate: '' };
          rowChanged = true;
          cleared += 1;
          continue;
        }

        if (colKey === 'tariffRate') {
          entry.values.overrideTariffRate = null;
          entry.values.overrideTariffCost = null;
          undoEdits.push({ rowKey: row.id, field: 'tariffRate', oldValue: updatedRow.tariffRate, newValue: '' });
          updatedRow = { ...updatedRow, tariffRate: '', tariffCost: '' };
          rowChanged = true;
          cleared += 1;
          continue;
        }

        if (isNumericField(colKey) || isPercentField(colKey)) {
          const serverKey = SERVER_FIELD_MAP[colKey];
          if (serverKey) {
            entry.values[serverKey] = null;
          }
          undoEdits.push({ rowKey: row.id, field: colKey, oldValue: updatedRow[colKey] ?? '', newValue: '' });
          updatedRow = { ...updatedRow, [colKey]: '' };
          rowChanged = true;
          cleared += 1;
        }
      }

      if (rowChanged) {
        updatedRows[rowIndex] = updatedRow;
      }
    }

    if (cleared === 0) return;

    if (undoEdits.length > 0) {
      recordEdits(undoEdits);
    }

    setLocalRows(updatedRows);
    onRowsChange?.(updatedRows);
    scheduleFlush();
  }, [activeCell, columns, localRows, onRowsChange, pendingRef, scheduleFlush, selection, recordEdits]);

  const applyPastedText = useCallback(
    (text: string, start: { rowId: string; colKey: keyof OpsBatchRow }) => {
      const startRowIndex = localRows.findIndex((row) => row.id === start.rowId);
      const startColIndex = columns.findIndex((column) => column.key === start.colKey);
      if (startRowIndex < 0 || startColIndex < 0) return;

      const matrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => line.split('\t'));

      if (matrix.length === 0) return;

      let updatedRows = [...localRows];
      let applied = 0;
      let skipped = 0;
      const undoEdits: CellEdit<string>[] = [];

      for (let r = 0; r < matrix.length; r += 1) {
        for (let c = 0; c < matrix[r]!.length; c += 1) {
          const targetRowIndex = startRowIndex + r;
          const targetColIndex = startColIndex + c;
          if (targetRowIndex >= updatedRows.length) continue;
          if (targetColIndex >= columns.length) continue;

          const column = columns[targetColIndex];
          if (!column?.editable) continue;

          const row = updatedRows[targetRowIndex];
          if (!row) continue;

          const rawValue = matrix[r]![c] ?? '';
          let finalValue = rawValue;

          if (column.type === 'numeric') {
            if (!validateNumeric(finalValue)) {
              skipped += 1;
              continue;
            }
            const precision =
              column.precision ?? NUMERIC_PRECISION[column.key as NumericField] ?? 2;
            finalValue = normalizeCurrency(finalValue, precision);
          } else if (column.type === 'percent') {
            if (!validateNumeric(finalValue)) {
              skipped += 1;
              continue;
            }
            const precision =
              column.precision ?? PERCENT_PRECISION[column.key as PercentField] ?? 4;
            finalValue = normalizePercent(finalValue, precision);
          } else if (column.type === 'dropdown') {
            if (finalValue && !products.some((product) => product.name === finalValue)) {
              skipped += 1;
              continue;
            }
          }

          const currentValue = row[column.key] ?? '';
          if (currentValue === finalValue) continue;

          if (!pendingRef.current.has(row.id)) {
            pendingRef.current.set(row.id, { id: row.id, values: {} });
          }
          const entry = pendingRef.current.get(row.id)!;

          const nextRow = { ...row };

          if (column.key === 'productName') {
            const selected = products.find((product) => product.name === finalValue);
            if (!selected) continue;
            entry.values.productId = selected.id;
            nextRow.productId = selected.id;
            nextRow.productName = selected.name;
            undoEdits.push({ rowKey: row.id, field: 'productId', oldValue: row.productId, newValue: selected.id });
            undoEdits.push({ rowKey: row.id, field: 'productName', oldValue: row.productName, newValue: selected.name });
          } else if (column.key === 'tariffCost') {
            entry.values.overrideTariffCost = finalValue === '' ? null : finalValue;
            entry.values.overrideTariffRate = null;
            nextRow.tariffCost = finalValue;
            nextRow.tariffRate = '';
            undoEdits.push({ rowKey: row.id, field: 'tariffCost', oldValue: row.tariffCost, newValue: finalValue });
          } else if (column.key === 'tariffRate') {
            entry.values.overrideTariffRate = finalValue === '' ? null : finalValue;
            entry.values.overrideTariffCost = null;
            nextRow.tariffRate = finalValue;
            nextRow.tariffCost = '';
            undoEdits.push({ rowKey: row.id, field: 'tariffRate', oldValue: row.tariffRate, newValue: finalValue });
          } else if (isNumericField(column.key) || isPercentField(column.key)) {
            const serverKey = SERVER_FIELD_MAP[column.key];
            if (serverKey) {
              entry.values[serverKey] = finalValue === '' ? null : finalValue;
            }
            nextRow[column.key] = finalValue;
            undoEdits.push({ rowKey: row.id, field: column.key, oldValue: row[column.key] ?? '', newValue: finalValue });
          }

          updatedRows[targetRowIndex] = nextRow;
          applied += 1;
        }
      }

      if (applied === 0) return;

      if (undoEdits.length > 0) {
        recordEdits(undoEdits);
      }

      setLocalRows(updatedRows);
      onRowsChange?.(updatedRows);
      scheduleFlush();

      toast.success(`Pasted ${applied} cell${applied === 1 ? '' : 's'}`);
      if (skipped > 0) {
        toast.warning(`Skipped ${skipped} cell${skipped === 1 ? '' : 's'}`, {
          description: 'Some values could not be applied.',
        });
      }
    },
    [columns, localRows, onRowsChange, pendingRef, products, scheduleFlush, recordEdits],
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
            const row = localRows[normalizedSelection.top];
            const column = columns[normalizedSelection.left];
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
    [activeCell, applyPastedText, columns, localRows, selection],
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
        const row = localRows.find((r) => r.id === activeCell.rowId);
        const column = columns.find((c) => c.key === activeCell.colKey);
        if (!row || !column) return;
        if (!column.editable) return;

        event.preventDefault();
        // Don't select all when starting edit by typing - cursor at end
        selectOnFocusRef.current = false;
        startEditing(
          row.id,
          column.key,
          column.type === 'dropdown' ? (row[column.key] ?? '') : event.key,
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
          moveSelection(jump ? localRows.length : 1, 0, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowUp') {
          moveSelection(jump ? -localRows.length : -1, 0, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowRight') {
          moveSelection(0, jump ? columns.length : 1, { extendSelection: event.shiftKey });
        } else if (event.key === 'ArrowLeft') {
          moveSelection(0, jump ? -columns.length : -1, { extendSelection: event.shiftKey });
        }
        return;
      }
    },
    [
      activeCell,
      columns,
      clearSelectionValues,
      copySelectionToClipboard,
      editingCell,
      localRows,
      moveSelection,
      moveSelectionTab,
      startEditing,
      startEditingActiveCell,
      undo,
      redo,
    ],
  );

  const handleTableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      handleGridKeyDown(event);
    },
    [handleGridKeyDown],
  );

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = e.target.value;
    setEditValue(nextValue);
    // Commit with the selected value (avoid stale `editValue` closures)
    commitEdit(nextValue);
  };

  const computeProfitMetrics = useCallback((row: OpsBatchRow) => {
    const toNumber = (value: string | undefined): number => {
      if (!value) return 0;
      const parsed = sanitizeNumeric(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const quantity = toNumber(row.quantity);
    const sellingPrice = toNumber(row.sellingPrice);
    const manufacturingCost = toNumber(row.manufacturingCost);
    const freightCost = toNumber(row.freightCost);
    const tariffRate = toNumber(row.tariffRate);

    const tariffCostRaw = (row.tariffCost ?? '').trim();
    const tariffCostOverride = tariffCostRaw ? toNumber(tariffCostRaw) : null;
    const tariffUnitCost = tariffCostOverride ?? manufacturingCost * tariffRate;
    const landedUnitCost = manufacturingCost + freightCost + tariffUnitCost;

    const fbaFee = toNumber(row.fbaFee);
    const referralRate = toNumber(row.referralRate);
    const storagePerMonth = toNumber(row.storagePerMonth);
    const amazonFeesPerUnit = fbaFee + storagePerMonth + sellingPrice * referralRate;

    const tacosPercent = toNumber(row.tacosPercent);
    const ppcPerUnit = sellingPrice * tacosPercent;

    const grossProfitPerUnit = sellingPrice - landedUnitCost - amazonFeesPerUnit;
    const netProfitPerUnit = grossProfitPerUnit - ppcPerUnit;
    const grossProfitTotal = grossProfitPerUnit * quantity;
    const netProfitTotal = netProfitPerUnit * quantity;

    const grossMargin = sellingPrice === 0 ? 0 : grossProfitPerUnit / sellingPrice;
    const netMargin = sellingPrice === 0 ? 0 : netProfitPerUnit / sellingPrice;

    return {
      grossProfitPerUnit,
      netProfitPerUnit,
      grossProfitTotal,
      netProfitTotal,
      grossMargin,
      netMargin,
    };
  }, []);

  // Monetary fields that should be affected by the profit display mode (total vs per-unit)
  const MONETARY_FIELDS: Set<keyof OpsBatchRow> = new Set([
    'sellingPrice',
    'manufacturingCost',
    'freightCost',
    'tariffCost',
    'fbaFee',
    'storagePerMonth',
  ]);

  const formatDisplayValue = (row: OpsBatchRow, column: ColumnDef): string => {
    if (column.key === 'grossProfit' || column.key === 'netProfit') {
      const metrics = computeProfitMetrics(row);
      const precision = column.precision ?? 2;

      const raw =
        column.key === 'grossProfit'
          ? column.type === 'percent'
            ? metrics.grossMargin
            : profitDisplayMode === 'total'
              ? metrics.grossProfitTotal
              : metrics.grossProfitPerUnit
          : column.type === 'percent'
            ? metrics.netMargin
            : profitDisplayMode === 'total'
              ? metrics.netProfitTotal
              : metrics.netProfitPerUnit;

      if (column.type === 'percent') {
        return `${(raw * 100).toFixed(precision)}%`;
      }

      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: precision,
      });
      return formatter.format(raw);
    }

    // Handle computed CBM column
    if (column.key === 'cbm') {
      const cbm = computeCbm(row);
      if (cbm === null) return '-';
      return cbm.toFixed(column.precision ?? 3);
    }

    const value = row[column.key];
    if (!value) return '';

    if (column.type === 'numeric') {
      const num = sanitizeNumeric(value);
      if (Number.isNaN(num)) return value;
      // Don't show $ prefix for quantity or carton dimension fields
      if (column.key === 'quantity' || column.key === 'unitsPerCarton') return num.toLocaleString();
      if (
        column.key === 'cartonSide1Cm' ||
        column.key === 'cartonSide2Cm' ||
        column.key === 'cartonSide3Cm' ||
        column.key === 'cartonWeightKg'
      ) {
        return num.toFixed(column.precision ?? 2);
      }

      // Apply total mode multiplier for monetary fields
      if (MONETARY_FIELDS.has(column.key) && profitDisplayMode === 'total') {
        const quantity = sanitizeNumeric(row.quantity);
        const total = Number.isFinite(quantity) ? num * quantity : num;
        const precision = profitDisplayMode === 'total' ? 0 : (column.precision ?? 2);
        return `$${total.toFixed(precision).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
      }

      return `$${num.toFixed(column.precision ?? 2)}`;
    }

    if (column.type === 'percent') {
      const num = sanitizeNumeric(value);
      if (Number.isNaN(num)) return value;

      // In total mode, show TACoS and Referral as dollar amounts
      if (profitDisplayMode === 'total' && (column.key === 'tacosPercent' || column.key === 'referralRate')) {
        const sellingPrice = sanitizeNumeric(row.sellingPrice);
        const quantity = sanitizeNumeric(row.quantity);
        if (Number.isFinite(sellingPrice) && Number.isFinite(quantity)) {
          const dollarAmount = sellingPrice * num * quantity;
          return `$${dollarAmount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
        }
      }

      return `${(num * 100).toFixed(column.precision ?? 2)}%`;
    }

    return value;
  };

  const renderCell = (row: OpsBatchRow, rowIndex: number, column: ColumnDef, colIndex: number) => {
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

    const isNumericCell = column.type === 'numeric' || column.type === 'percent';
    const isDropdown = column.type === 'dropdown';
    const isRowSelected = isRowActive(row);

    const cellClassName = cn(
      'h-8 overflow-hidden whitespace-nowrap border-r p-0 align-middle text-sm',
      colIndex === 0 && isRowSelected && 'border-l-4 border-cyan-600 dark:border-cyan-400',
      isNumericCell && 'text-right',
      column.editable
        ? isDropdown
          ? 'cursor-pointer bg-accent/50 font-medium'
          : 'cursor-text bg-accent/50 font-medium'
        : column.computed
          ? 'bg-muted/30'
          : 'bg-muted/50 text-muted-foreground',
      isSelected && 'bg-accent',
      (isEditing || isCurrent) && 'ring-2 ring-inset ring-cyan-600 dark:ring-cyan-400',
      colIndex === columns.length - 1 && 'border-r-0',
    );

    const inputClassName = cn(
      'h-8 w-full bg-transparent px-3 text-sm font-semibold text-foreground outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring',
      isNumericCell && 'text-right',
    );

    if (isEditing) {
      if (column.type === 'dropdown') {
        return (
          <TableCell
            key={column.key}
            id={cellDomId(row.id, column.key)}
            className={cellClassName}
            style={{ width: column.width, minWidth: column.width, boxShadow }}
          >
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={handleSelectChange}
              onKeyDown={handleKeyDown}
              onBlur={handleCellBlur}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              className="h-8 w-full bg-transparent px-3 text-sm font-medium text-foreground outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring"
            >
              <option value="">Select product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.name}>
                  {product.name}
                </option>
              ))}
            </select>
          </TableCell>
        );
      }

      return (
        <TableCell
          key={column.key}
          id={cellDomId(row.id, column.key)}
          className={cellClassName}
          style={{ width: column.width, minWidth: column.width, boxShadow }}
        >
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleCellBlur}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            className={inputClassName}
            placeholder={column.type === 'percent' ? 'e.g. 10 for 10%' : undefined}
          />
        </TableCell>
      );
    }

    return (
      <TableCell
        key={column.key}
        id={cellDomId(row.id, column.key)}
        className={cellClassName}
        style={{ width: column.width, minWidth: column.width, boxShadow }}
        title={displayValue || undefined}
        onPointerDown={(event) => handlePointerDown(event, rowIndex, colIndex)}
        onPointerMove={(event) => handlePointerMove(event, rowIndex, colIndex)}
        onPointerUp={handlePointerUp}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!column.editable) return;
          startEditing(row.id, column.key, row[column.key] ?? '');
        }}
      >
        <div className={cn('flex h-8 min-w-0 items-center px-3', isNumericCell && 'justify-end')}>
          <span
            className={cn(
              'block min-w-0 truncate',
              isNumericCell && 'tabular-nums',
              (() => {
                if (column.key !== 'grossProfit' && column.key !== 'netProfit') return '';
                const metrics = computeProfitMetrics(row);
                const raw =
                  column.key === 'grossProfit'
                    ? column.type === 'percent'
                      ? metrics.grossMargin
                      : profitDisplayMode === 'total'
                        ? metrics.grossProfitTotal
                        : metrics.grossProfitPerUnit
                    : column.type === 'percent'
                      ? metrics.netMargin
                      : profitDisplayMode === 'total'
                        ? metrics.netProfitTotal
                        : metrics.netProfitPerUnit;
                if (raw > 0) return 'text-emerald-700 dark:text-emerald-300';
                if (raw < 0) return 'text-rose-700 dark:text-rose-300';
                return '';
              })(),
            )}
          >
            {displayValue}
          </span>
        </div>
      </TableCell>
    );
  };

  const isRowActive = (row: OpsBatchRow): boolean => {
    if (activeBatchId && row.id === activeBatchId) return true;
    if (!activeBatchId && activeOrderId && row.purchaseOrderId === activeOrderId) return true;
    return false;
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
            Batch Table
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 shadow-sm dark:border-emerald-300/35 dark:bg-emerald-300/10 dark:text-emerald-100">
            <button
              type="button"
              onClick={() => setProfitMode('unit')}
              className={cn(
                'rounded-md px-2 py-1 transition',
                profitDisplayMode === 'unit'
                  ? 'bg-white text-emerald-900 shadow-sm dark:bg-slate-900/60 dark:text-emerald-100'
                  : 'text-emerald-800/80 hover:text-emerald-900 dark:text-emerald-100/80 dark:hover:text-emerald-100',
              )}
              aria-pressed={profitDisplayMode === 'unit'}
              title="Show profit per unit"
            >
              Per unit
            </button>
            <button
              type="button"
              onClick={() => setProfitMode('total')}
              className={cn(
                'rounded-md px-2 py-1 transition',
                profitDisplayMode === 'total'
                  ? 'bg-white text-emerald-900 shadow-sm dark:bg-slate-900/60 dark:text-emerald-100'
                  : 'text-emerald-800/80 hover:text-emerald-900 dark:text-emerald-100/80 dark:hover:text-emerald-100',
              )}
              aria-pressed={profitDisplayMode === 'total'}
              title="Show total profit for the batch"
            >
              Absolute
            </button>
            <button
              type="button"
              onClick={() => setProfitMode('percent')}
              className={cn(
                'rounded-md px-2 py-1 transition',
                profitDisplayMode === 'percent'
                  ? 'bg-white text-emerald-900 shadow-sm dark:bg-slate-900/60 dark:text-emerald-100'
                  : 'text-emerald-800/80 hover:text-emerald-900 dark:text-emerald-100/80 dark:hover:text-emerald-100',
              )}
              aria-pressed={profitDisplayMode === 'percent'}
              title="Show profit margins (%)"
            >
              %
            </button>
          </div>
          {onAddBatch ? (
            <button
              type="button"
              onClick={onAddBatch}
              disabled={Boolean(disableAdd)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10"
            >
              Add batch
            </button>
          ) : null}
          {onDeleteBatch ? (
            <button
              type="button"
              onClick={onDeleteBatch}
              disabled={Boolean(disableDelete) || !activeBatchId}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 enabled:hover:border-rose-500 enabled:hover:bg-rose-100 enabled:hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-300 dark:focus:ring-rose-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-rose-500/80 dark:enabled:hover:bg-rose-500/20"
            >
              Remove batch
            </button>
          ) : null}
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
          className="max-h-[400px] select-none overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Table className="table-fixed border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    style={{ width: column.width, minWidth: column.width }}
                    className="sticky top-0 z-10 h-10 whitespace-nowrap border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80"
                  >
                    {column.key === 'tariffRate' || column.key === 'tariffCost' ? (
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700 transition hover:bg-cyan-500/20 dark:border-cyan-300/35 dark:bg-cyan-300/10 dark:text-cyan-200 dark:hover:bg-cyan-300/20"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleTariffInputMode();
                        }}
                        title={
                          tariffInputMode === 'rate'
                            ? 'Switch to Tariff $/unit'
                            : 'Switch to Tariff %'
                        }
                      >
                        {column.header}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {localRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    {activeOrderId
                      ? 'No batches for this order. Click "Add batch" to add cost details.'
                      : 'Select a purchase order above to view or add batches.'}
                  </TableCell>
                </TableRow>
              ) : (
                localRows.map((row, rowIndex) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'hover:bg-transparent',
                      rowIndex % 2 === 1 && 'bg-muted/30',
                      isRowActive(row) && 'bg-cyan-50/70 dark:bg-cyan-900/20',
                    )}
                  >
                    {columns.map((column, colIndex) => renderCell(row, rowIndex, column, colIndex))}
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
