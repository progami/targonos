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
  sku: string;
  openingStock: string;
  nextYearOpeningOverride: string;
  notes: string;
  region: 'US' | 'UK';
  totalCoverThresholdWeeks: string;
  fbaCoverThresholdWeeks: string;
};

type EditableField = Exclude<keyof WorkbookSetupRow, 'productId' | 'sku' | 'region'>;

type WorkbookSetupTableProps = {
  strategyId: string;
  activeYear: number;
  rows: WorkbookSetupRow[];
};

const FIELD_LABELS: Record<EditableField, string> = {
  openingStock: 'Opening Stock',
  nextYearOpeningOverride: 'Opening Override',
  notes: 'Notes',
  totalCoverThresholdWeeks: 'Total Threshold (W)',
  fbaCoverThresholdWeeks: 'FBA Threshold (W)',
};

function normalizeNumber(value: string, integer: boolean): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed.replace(/[$,%\s]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid number');
  }
  return integer ? String(Math.round(parsed)) : parsed.toFixed(2);
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
          updates: [{ productId, values: { [field]: value } }],
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

  const handleNumberBlur = (productId: string, field: EditableField, integer: boolean) => {
    const row = localRows.find((candidate) => candidate.productId === productId);
    if (!row) return;
    try {
      const normalized = normalizeNumber(row[field], integer);
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
              <TableHead className="h-9 min-w-[9rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                SKU
              </TableHead>
              <TableHead className="h-9 min-w-[10rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                Opening Stock {activeYear}
              </TableHead>
              <TableHead className="h-9 min-w-[12rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                {activeYear + 1} Opening Override
              </TableHead>
              <TableHead className="h-9 min-w-[15rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                Notes
              </TableHead>
              <TableHead className="h-9 min-w-[7rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                REGION
              </TableHead>
              <TableHead className="h-9 min-w-[11rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                Total Threshold (W)
              </TableHead>
              <TableHead className="h-9 min-w-[10rem] whitespace-nowrap text-xs font-bold uppercase tracking-wide">
                FBA Threshold (W)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localRows.map((row) => (
              <TableRow key={row.productId} className="h-9">
                <TableCell className="h-9 whitespace-nowrap px-3 py-0 text-sm font-semibold">
                  {row.sku}
                </TableCell>
                <TableCell className="h-9 p-0">
                  <Input
                    value={row.openingStock}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateField(row.productId, 'openingStock', event.target.value)
                    }
                    onBlur={() => handleNumberBlur(row.productId, 'openingStock', true)}
                    disabled={savingCell === `${row.productId}:openingStock`}
                    className={`${inputClassName} text-right tabular-nums`}
                  />
                </TableCell>
                <TableCell className="h-9 p-0">
                  <Input
                    value={row.nextYearOpeningOverride}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateField(row.productId, 'nextYearOpeningOverride', event.target.value)
                    }
                    onBlur={() =>
                      handleNumberBlur(row.productId, 'nextYearOpeningOverride', true)
                    }
                    disabled={savingCell === `${row.productId}:nextYearOpeningOverride`}
                    className={`${inputClassName} text-right tabular-nums`}
                  />
                </TableCell>
                <TableCell className="h-9 p-0">
                  <Input
                    value={row.notes}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateField(row.productId, 'notes', event.target.value)
                    }
                    onBlur={() => saveField(row.productId, 'notes', row.notes)}
                    disabled={savingCell === `${row.productId}:notes`}
                    className={inputClassName}
                  />
                </TableCell>
                <TableCell className="h-9 whitespace-nowrap px-3 py-0 text-sm font-semibold">
                  {row.region}
                </TableCell>
                <TableCell className="h-9 p-0">
                  <Input
                    value={row.totalCoverThresholdWeeks}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateField(row.productId, 'totalCoverThresholdWeeks', event.target.value)
                    }
                    onBlur={() =>
                      handleNumberBlur(row.productId, 'totalCoverThresholdWeeks', false)
                    }
                    disabled={savingCell === `${row.productId}:totalCoverThresholdWeeks`}
                    className={`${inputClassName} text-right tabular-nums`}
                  />
                </TableCell>
                <TableCell className="h-9 p-0">
                  <Input
                    value={row.fbaCoverThresholdWeeks}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateField(row.productId, 'fbaCoverThresholdWeeks', event.target.value)
                    }
                    onBlur={() => handleNumberBlur(row.productId, 'fbaCoverThresholdWeeks', false)}
                    disabled={savingCell === `${row.productId}:fbaCoverThresholdWeeks`}
                    className={`${inputClassName} text-right tabular-nums`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {localRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-16 text-center text-sm text-muted-foreground">
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
