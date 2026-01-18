'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OPS_STAGE_DEFAULT_LABELS } from '@/lib/business-parameter-labels';
import { withAppBasePath } from '@/lib/base-path';
import { parseNumber, parsePercent } from '@/lib/utils/numbers';
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

interface BusinessParameter {
  id: string;
  label: string;
  value: string;
  type: 'numeric' | 'text';
}

type BusinessParameterUpdate = { id: string; valueNumeric?: string; valueText?: string };

const OPS_DEFAULTS = [
  { label: OPS_STAGE_DEFAULT_LABELS.production, defaultValue: '1' },
  { label: OPS_STAGE_DEFAULT_LABELS.source, defaultValue: '1' },
  { label: OPS_STAGE_DEFAULT_LABELS.ocean, defaultValue: '1' },
  { label: OPS_STAGE_DEFAULT_LABELS.final, defaultValue: '1' },
];

const SALES_DEFAULTS = [{ label: 'Stockout Warning (weeks)', defaultValue: '4' }];

const FINANCE_DEFAULTS = [
  { label: 'Starting Cash', defaultValue: '0' },
  { label: 'Amazon Payout Delay (weeks)', defaultValue: '2' },
  { label: 'Weekly Fixed Costs', defaultValue: '0' },
  { label: 'Supplier Payment Split 1 (%)', defaultValue: '50' },
  { label: 'Supplier Payment Split 2 (%)', defaultValue: '30' },
  { label: 'Supplier Payment Split 3 (%)', defaultValue: '20' },
];

const SUPPLIER_SPLIT_DEFAULTS = [50, 30, 20] as const;
const SUPPLIER_SPLIT_LABELS = [
  'Supplier Payment Split 1 (%)',
  'Supplier Payment Split 2 (%)',
  'Supplier Payment Split 3 (%)',
] as const;
const SUPPLIER_SPLIT_LABEL_SET = new Set(SUPPLIER_SPLIT_LABELS.map((label) => label.toLowerCase()));
const SUPPLIER_SPLIT_EPSILON = 1e-6;

function supplierSplitIndex(label: string): number | null {
  const normalized = label.trim().toLowerCase();
  const idx = SUPPLIER_SPLIT_LABELS.findIndex((item) => item.toLowerCase() === normalized);
  return idx === -1 ? null : idx;
}

function getDefaults(type: 'ops' | 'sales' | 'finance') {
  if (type === 'ops') return OPS_DEFAULTS;
  if (type === 'sales') return SALES_DEFAULTS;
  return FINANCE_DEFAULTS;
}

export interface ProductSetupParametersPanelProps {
  strategyId: string;
  parameterType: 'ops' | 'sales' | 'finance';
  parameters: BusinessParameter[];
  className?: string;
}

type ParameterStatus = 'idle' | 'dirty' | 'saving' | 'error' | 'blocked';

interface ParameterRecord extends BusinessParameter {
  status: ParameterStatus;
}

function initializeRecords(
  parameters: BusinessParameter[],
  type: 'ops' | 'sales' | 'finance',
): ParameterRecord[] {
  const defaults = getDefaults(type);
  return defaults.map((def) => {
    const existing = parameters.find((p) => p.label.toLowerCase() === def.label.toLowerCase());
    if (existing) {
      return { ...existing, status: 'idle' as ParameterStatus };
    }
    return {
      id: '',
      label: def.label,
      value: def.defaultValue,
      type: 'numeric' as const,
      status: 'idle' as ParameterStatus,
    };
  });
}

export function ProductSetupParametersPanel({
  strategyId,
  parameterType,
  parameters,
  className,
}: ProductSetupParametersPanelProps) {
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const [items, setItems] = useState<ParameterRecord[]>(() =>
    initializeRecords(parameters, parameterType),
  );
  const itemsRef = useRef(items);

  useEffect(() => {
    const nextRecords = initializeRecords(parameters, parameterType);
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    setItems(nextRecords);
    itemsRef.current = nextRecords;
  }, [parameters, parameterType]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const flushUpdates = useCallback(async () => {
    const currentItems = itemsRef.current;
    const dirtyItems = currentItems.filter(
      (item) => item.status === 'dirty' || item.status === 'blocked',
    );
    if (dirtyItems.length === 0) {
      flushTimeoutRef.current = null;
      return;
    }

    if (isFlushingRef.current) {
      pendingFlushRef.current = true;
      return;
    }

    isFlushingRef.current = true;

    const sanitizedValues = new Map<string, string>();
    const validItems: ParameterRecord[] = [];
    const invalidKeys = new Set<string>();

    dirtyItems.forEach((item) => {
      const key = item.id || item.label;
      const trimmed = item.value.trim();
      const cleaned = trimmed.replace(/,/g, '');
      if (cleaned !== '' && Number.isNaN(Number(cleaned))) {
        invalidKeys.add(key);
        return;
      }
      sanitizedValues.set(key, cleaned);
      validItems.push(item);
    });

    if (invalidKeys.size > 0) {
      setItems((previous) =>
        previous.map((item) =>
          invalidKeys.has(item.id || item.label) ? { ...item, status: 'error' } : item,
        ),
      );
      toast.error('Enter valid numbers');
      flushTimeoutRef.current = null;
      isFlushingRef.current = false;
      return;
    }

    let itemsToPersist = validItems;

    if (parameterType === 'finance') {
      const splitItems = currentItems.filter((item) =>
        SUPPLIER_SPLIT_LABEL_SET.has(item.label.trim().toLowerCase()),
      );
      const hasDirtySplit = dirtyItems.some((item) =>
        SUPPLIER_SPLIT_LABEL_SET.has(item.label.trim().toLowerCase()),
      );

      if (hasDirtySplit && splitItems.length === SUPPLIER_SPLIT_LABELS.length) {
        const splitDecimals = SUPPLIER_SPLIT_DEFAULTS.map(
          (fallback) => parsePercent(fallback) ?? 0,
        ) as number[];

        splitItems.forEach((item) => {
          const idx = supplierSplitIndex(item.label);
          if (idx == null) return;
          const key = item.id || item.label;
          const raw = sanitizedValues.get(key) ?? item.value;
          const numeric = parseNumber(raw);
          const percentDecimal = parsePercent(numeric ?? SUPPLIER_SPLIT_DEFAULTS[idx]) ?? 0;
          splitDecimals[idx] = percentDecimal;
        });

        const total = splitDecimals.reduce(
          (sum, value) => sum + (Number.isFinite(value) ? value : 0),
          0,
        );
        if (total > 1 + SUPPLIER_SPLIT_EPSILON) {
          const splitKeySet = new Set(splitItems.map((item) => item.id || item.label));
          setItems((previous) =>
            previous.map((item) => {
              const key = item.id || item.label;
              if (!splitKeySet.has(key)) return item;
              return item.status === 'saving' ? item : { ...item, status: 'blocked' };
            }),
          );
          toast.error('Supplier payment splits must total 100% or less');
          itemsToPersist = validItems.filter(
            (item) => !SUPPLIER_SPLIT_LABEL_SET.has(item.label.trim().toLowerCase()),
          );
        }
      }
    }

    if (itemsToPersist.length === 0) {
      flushTimeoutRef.current = null;
      isFlushingRef.current = false;
      return;
    }

    const dirtyKeys = new Set(itemsToPersist.map((item) => item.id || item.label));

    setItems((previous) =>
      previous.map((item) =>
        dirtyKeys.has(item.id || item.label) ? { ...item, status: 'saving' } : item,
      ),
    );

    try {
      const toCreate = itemsToPersist.filter((item) => !item.id);
      const toUpdate = itemsToPersist.filter((item) => item.id);

      for (const item of toCreate) {
        const key = item.label;
        const value = sanitizedValues.get(key) ?? '';
        const response = await fetch(withAppBasePath('/api/v1/xplan/business-parameters'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategyId,
            label: item.label,
            valueNumeric: value ? Number(value) : 0,
          }),
        });
        if (!response.ok) throw new Error('Failed to create parameter');
      }

      if (toUpdate.length > 0) {
        const updates: BusinessParameterUpdate[] = toUpdate.map((item) => ({
          id: item.id,
          valueNumeric: sanitizedValues.get(item.id) ?? '',
        }));

        const response = await fetch(withAppBasePath('/api/v1/xplan/business-parameters'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!response.ok) throw new Error('Failed to update parameters');
      }

      setItems((previous) =>
        previous.map((item) => {
          const key = item.id || item.label;
          if (!dirtyKeys.has(key)) return item;
          const sanitized = sanitizedValues.get(key) ?? '';
          return {
            ...item,
            value: sanitized,
            status: 'idle',
          };
        }),
      );

      toast.success('Saved');
    } catch (error) {
      console.error(error);
      setItems((previous) =>
        previous.map((item) =>
          dirtyKeys.has(item.id || item.label) ? { ...item, status: 'error' } : item,
        ),
      );
      toast.error('Unable to save');
    } finally {
      flushTimeoutRef.current = null;
      isFlushingRef.current = false;
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
        void flushUpdates();
      }
    }
  }, [strategyId, parameterType]);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = setTimeout(() => {
      void flushUpdates();
    }, 500);
  }, [flushUpdates]);

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      void flushUpdates();
    };
  }, [flushUpdates]);

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      setItems((previous) =>
        previous.map((item) =>
          (item.id || item.label) === key ? { ...item, value, status: 'dirty' } : item,
        ),
      );
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const handleBlur = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    void flushUpdates();
  }, [flushUpdates]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10',
        className,
      )}
    >
      <Table className="w-full table-fixed border-collapse">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-10 h-10 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
              Parameter
            </TableHead>
            <TableHead className="sticky top-0 z-10 h-10 w-32 border-b border-r bg-muted px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
              Value
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isError = item.status === 'error' || item.status === 'blocked';
            const isSaving = item.status === 'saving';
            const isDirty = item.status === 'dirty';
            const key = item.id || item.label;

            return (
              <TableRow key={key} className="hover:bg-transparent">
                <TableCell className="border-r px-3 py-2">
                  <label htmlFor={`param-${key}`} className="text-sm text-muted-foreground">
                    {item.label}
                  </label>
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className="relative">
                    <Input
                      id={`param-${key}`}
                      value={item.value}
                      onChange={(event) => handleValueChange(key, event.target.value)}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      aria-invalid={isError}
                      disabled={isSaving}
                      className={clsx(
                        'h-8 w-full pr-8 text-right text-sm font-medium tabular-nums',
                        isError
                          ? 'border-rose-300 bg-rose-50 text-rose-900 focus-visible:ring-rose-200 dark:border-rose-500/50 dark:bg-rose-900/20 dark:text-rose-100'
                          : isDirty
                            ? 'border-amber-300 bg-amber-50 text-slate-900 focus-visible:ring-amber-200 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-slate-100'
                            : 'bg-background focus-visible:ring-cyan-100 dark:bg-background dark:focus-visible:ring-cyan-400/20',
                      )}
                    />
                    {isSaving ? (
                      <div className="absolute inset-y-0 right-2 flex items-center">
                        <svg
                          className="h-3.5 w-3.5 animate-spin text-cyan-500"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
