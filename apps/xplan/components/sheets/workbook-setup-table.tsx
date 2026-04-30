'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { withAppBasePath } from '@/lib/base-path';

export type WorkbookSetupRow = {
  productId: string;
  region: 'US' | 'UK';
  workbookSku: string;
  displaySku: string;
  friendlyName: string;
  price: string;
  demandProxySku: string;
  proxyRatio: string;
  manualGrowthMultiplier: string;
  active: string;
  stockWeekStart: string;
  openingFbaUnits: string;
  openingThreeplUnits: string;
  openingTotalUnits: string;
  totalThresholdW: string;
  fbaThresholdW: string;
  pack: string;
  micron: string;
  notes: string;
};

type DisplayField = Exclude<keyof WorkbookSetupRow, 'productId'>;
type EditableField = 'totalThresholdW' | 'fbaThresholdW' | 'notes';

type WorkbookSetupTableProps = {
  strategyId: string;
  activeYear: number;
  rows: WorkbookSetupRow[];
};

type SetupColumn = {
  key: DisplayField;
  label: string;
  width: string;
  editable?: 'number' | 'text';
  align?: 'right' | 'center';
};

const SETUP_COLUMNS: SetupColumn[] = [
  { key: 'region', label: 'region', width: 'min-w-[6rem]', align: 'center' },
  { key: 'workbookSku', label: 'sku', width: 'min-w-[9rem]' },
  { key: 'displaySku', label: 'display_sku', width: 'min-w-[9rem]' },
  { key: 'friendlyName', label: 'friendly_name', width: 'min-w-[13rem]' },
  { key: 'price', label: 'price', width: 'min-w-[7rem]', align: 'right' },
  { key: 'demandProxySku', label: 'demand_proxy_sku', width: 'min-w-[11rem]' },
  { key: 'proxyRatio', label: 'proxy_ratio', width: 'min-w-[8rem]', align: 'right' },
  {
    key: 'manualGrowthMultiplier',
    label: 'manual_growth_multiplier',
    width: 'min-w-[13rem]',
    align: 'right',
  },
  { key: 'active', label: 'active', width: 'min-w-[6rem]', align: 'center' },
  { key: 'stockWeekStart', label: 'stock_week_start', width: 'min-w-[10rem]' },
  { key: 'openingFbaUnits', label: 'opening_fba_units', width: 'min-w-[11rem]', align: 'right' },
  {
    key: 'openingThreeplUnits',
    label: 'opening_threepl_units',
    width: 'min-w-[13rem]',
    align: 'right',
  },
  {
    key: 'openingTotalUnits',
    label: 'opening_total_units',
    width: 'min-w-[12rem]',
    align: 'right',
  },
  {
    key: 'totalThresholdW',
    label: 'total_threshold_w',
    width: 'min-w-[10rem]',
    editable: 'number',
    align: 'right',
  },
  {
    key: 'fbaThresholdW',
    label: 'fba_threshold_w',
    width: 'min-w-[10rem]',
    editable: 'number',
    align: 'right',
  },
  { key: 'pack', label: 'pack', width: 'min-w-[6rem]', align: 'right' },
  { key: 'micron', label: 'micron', width: 'min-w-[6rem]', align: 'right' },
  { key: 'notes', label: 'notes', width: 'min-w-[16rem]', editable: 'text' },
];

const FIELD_LABELS: Record<EditableField, string> = {
  totalThresholdW: 'total_threshold_w',
  fbaThresholdW: 'fba_threshold_w',
  notes: 'notes',
};

const SERVER_FIELDS: Record<EditableField, string> = {
  totalThresholdW: 'totalCoverThresholdWeeks',
  fbaThresholdW: 'fbaCoverThresholdWeeks',
  notes: 'notes',
};

function normalizeNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed.replace(/[$,%\s]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid number');
  }
  return parsed.toFixed(2);
}

export function WorkbookSetupTable({ strategyId, activeYear, rows }: WorkbookSetupTableProps) {
  const [localRows, setLocalRows] = useState(rows);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const saveField = async (productId: string, field: EditableField, value: string) => {
    const cellKey = `${productId}:${field}`;
    setSavingCell(cellKey);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/product-setup'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          year: activeYear,
          updates: [{ productId, values: { [SERVER_FIELDS[field]]: value } }],
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error);
      }
      toast.success(`${FIELD_LABELS[field]} saved`, { id: 'workbook-setup-saved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save setup value';
      toast.error(message, { id: 'workbook-setup-error' });
    } finally {
      setSavingCell(null);
    }
  };

  const updateField = (productId: string, field: EditableField, value: string) => {
    setLocalRows((current) =>
      current.map((row) => (row.productId === productId ? { ...row, [field]: value } : row)),
    );
  };

  const handleNumberBlur = (productId: string, field: EditableField) => {
    const row = localRows.find((candidate) => candidate.productId === productId);
    if (!row) return;
    try {
      const normalized = normalizeNumber(row[field]);
      updateField(productId, field, normalized);
      void saveField(productId, field, normalized);
    } catch {
      toast.error('Enter a valid number', { id: 'workbook-setup-error' });
    }
  };

  const inputClassName =
    'h-8 min-w-[7rem] rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-cyan-600';

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              {SETUP_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  className={`h-9 ${column.width} whitespace-nowrap text-xs font-bold tracking-wide`}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {localRows.map((row) => (
              <TableRow key={row.productId} className="h-9">
                {SETUP_COLUMNS.map((column) => {
                  const value = row[column.key];
                  const alignClass =
                    column.align === 'right'
                      ? 'text-right tabular-nums'
                      : column.align === 'center'
                        ? 'text-center'
                        : '';

                  if (column.editable === 'number') {
                    const field = column.key as EditableField;
                    return (
                      <TableCell key={column.key} className="h-9 p-0">
                        <Input
                          value={value}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateField(row.productId, field, event.target.value)
                          }
                          onBlur={() => handleNumberBlur(row.productId, field)}
                          disabled={savingCell === `${row.productId}:${field}`}
                          className={`${inputClassName} text-right tabular-nums`}
                        />
                      </TableCell>
                    );
                  }

                  if (column.editable === 'text') {
                    const field = column.key as EditableField;
                    return (
                      <TableCell key={column.key} className="h-9 p-0">
                        <Input
                          value={value}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateField(row.productId, field, event.target.value)
                          }
                          onBlur={() => saveField(row.productId, field, value)}
                          disabled={savingCell === `${row.productId}:${field}`}
                          className={inputClassName}
                        />
                      </TableCell>
                    );
                  }

                  return (
                    <TableCell
                      key={column.key}
                      className={`h-9 whitespace-nowrap px-3 py-0 text-sm ${alignClass}`}
                    >
                      {value}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {localRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={SETUP_COLUMNS.length}
                  className="h-16 text-center text-sm text-muted-foreground"
                >
                  No active SKU rows.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
