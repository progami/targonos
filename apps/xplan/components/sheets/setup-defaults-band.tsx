'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { OPS_STAGE_DEFAULT_LABELS } from '@/lib/business-parameter-labels';
import { withAppBasePath } from '@/lib/base-path';
import { parseNumber, parsePercent } from '@/lib/utils/numbers';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface BusinessParameter {
  id: string;
  label: string;
  value: string;
  type: 'numeric' | 'text';
}

type BusinessParameterUpdate = { id: string; valueNumeric?: string; valueText?: string };

type ParameterStatus = 'idle' | 'dirty' | 'saving' | 'error' | 'blocked';

interface ParameterRecord extends BusinessParameter {
  status: ParameterStatus;
  shortLabel: string;
  suffix: string;
  group: 'ops' | 'sales' | 'finance';
}

const SUPPLIER_SPLIT_LABELS = [
  'Supplier Payment Split 1 (%)',
  'Supplier Payment Split 2 (%)',
  'Supplier Payment Split 3 (%)',
] as const;
const SUPPLIER_SPLIT_DEFAULTS = [50, 30, 20] as const;
const SUPPLIER_SPLIT_LABEL_SET = new Set(SUPPLIER_SPLIT_LABELS.map((l) => l.toLowerCase()));
const SUPPLIER_SPLIT_EPSILON = 1e-6;

function supplierSplitIndex(label: string): number | null {
  const normalized = label.trim().toLowerCase();
  const idx = SUPPLIER_SPLIT_LABELS.findIndex((item) => item.toLowerCase() === normalized);
  return idx === -1 ? null : idx;
}

const OPS_DEFAULTS = [
  { label: OPS_STAGE_DEFAULT_LABELS.production, defaultValue: '1', shortLabel: 'Production', suffix: 'wk', group: 'ops' as const },
  { label: OPS_STAGE_DEFAULT_LABELS.source, defaultValue: '1', shortLabel: 'Source', suffix: 'wk', group: 'ops' as const },
  { label: OPS_STAGE_DEFAULT_LABELS.ocean, defaultValue: '1', shortLabel: 'Ocean', suffix: 'wk', group: 'ops' as const },
  { label: OPS_STAGE_DEFAULT_LABELS.final, defaultValue: '1', shortLabel: 'Final', suffix: 'wk', group: 'ops' as const },
];

const SALES_DEFAULTS = [
  { label: 'Stockout Warning (weeks)', defaultValue: '4', shortLabel: 'Stockout', suffix: 'wk', group: 'sales' as const },
];

const FINANCE_DEFAULTS = [
  { label: 'Starting Cash', defaultValue: '0', shortLabel: 'Start Cash', suffix: '', group: 'finance' as const },
  { label: 'Amazon Payout Delay (weeks)', defaultValue: '2', shortLabel: 'Amz Delay', suffix: 'wk', group: 'finance' as const },
  { label: 'Weekly Fixed Costs', defaultValue: '0', shortLabel: 'Fixed Costs', suffix: '', group: 'finance' as const },
  { label: 'Supplier Payment Split 1 (%)', defaultValue: '50', shortLabel: 'Split 1', suffix: '%', group: 'finance' as const },
  { label: 'Supplier Payment Split 2 (%)', defaultValue: '30', shortLabel: 'Split 2', suffix: '%', group: 'finance' as const },
  { label: 'Supplier Payment Split 3 (%)', defaultValue: '20', shortLabel: 'Split 3', suffix: '%', group: 'finance' as const },
];

const ALL_DEFAULTS = [...OPS_DEFAULTS, ...SALES_DEFAULTS, ...FINANCE_DEFAULTS];

function initializeRecords(
  operationsParameters: BusinessParameter[],
  salesParameters: BusinessParameter[],
  financeParameters: BusinessParameter[],
): ParameterRecord[] {
  const allParams = [...operationsParameters, ...salesParameters, ...financeParameters];
  return ALL_DEFAULTS.map((def) => {
    const existing = allParams.find((p) => p.label.toLowerCase() === def.label.toLowerCase());
    if (existing) {
      return {
        ...existing,
        status: 'idle' as ParameterStatus,
        shortLabel: def.shortLabel,
        suffix: def.suffix,
        group: def.group,
      };
    }
    return {
      id: '',
      label: def.label,
      value: def.defaultValue,
      type: 'numeric' as const,
      status: 'idle' as ParameterStatus,
      shortLabel: def.shortLabel,
      suffix: def.suffix,
      group: def.group,
    };
  });
}

export interface SetupDefaultsBandProps {
  strategyId: string;
  operationsParameters: BusinessParameter[];
  salesParameters: BusinessParameter[];
  financeParameters: BusinessParameter[];
  className?: string;
}

export function SetupDefaultsBand({
  strategyId,
  operationsParameters,
  salesParameters,
  financeParameters,
  className,
}: SetupDefaultsBandProps) {
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const [items, setItems] = useState<ParameterRecord[]>(() =>
    initializeRecords(operationsParameters, salesParameters, financeParameters),
  );
  const itemsRef = useRef(items);

  useEffect(() => {
    const nextRecords = initializeRecords(operationsParameters, salesParameters, financeParameters);
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    setItems(nextRecords);
    itemsRef.current = nextRecords;
  }, [operationsParameters, salesParameters, financeParameters]);

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

    // Supplier split validation
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
  }, [strategyId]);

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

  const opsItems = items.filter((item) => item.group === 'ops');
  const salesItems = items.filter((item) => item.group === 'sales');
  const financeItems = items.filter((item) => item.group === 'finance');

  return (
    <section className={cn('space-y-3', className)}>
      <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
        Strategy Defaults
      </h3>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10">
        <div className="divide-y">
          {/* Operations row */}
          <div className="px-4 py-3">
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lead Time Defaults
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {opsItems.map((item) => {
                const key = item.id || item.label;
                const isError = item.status === 'error' || item.status === 'blocked';
                const isDirty = item.status === 'dirty';
                const isSaving = item.status === 'saving';

                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`def-${key}`} className="text-2xs text-muted-foreground truncate block">
                      {item.shortLabel}
                      {item.suffix ? <span className="ml-0.5 opacity-60">({item.suffix})</span> : null}
                    </label>
                    <div className="relative">
                      <Input
                        id={`def-${key}`}
                        value={item.value}
                        onChange={(event) => handleValueChange(key, event.target.value)}
                        onBlur={handleBlur}
                        inputMode="decimal"
                        aria-invalid={isError}
                        disabled={isSaving}
                        className={clsx(
                          'h-7 w-full text-right text-sm font-medium tabular-nums',
                          isError
                            ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-900/20 dark:text-rose-100'
                            : isDirty
                              ? 'border-amber-300 bg-amber-50 text-slate-900 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-slate-100'
                              : 'bg-background dark:bg-background',
                        )}
                      />
                      {isSaving ? (
                        <div className="absolute inset-y-0 right-2 flex items-center">
                          <svg className="h-3 w-3 animate-spin text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {/* Stockout inline with ops */}
              {salesItems.map((item) => {
                const key = item.id || item.label;
                const isError = item.status === 'error' || item.status === 'blocked';
                const isDirty = item.status === 'dirty';
                const isSaving = item.status === 'saving';

                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`def-${key}`} className="text-2xs text-muted-foreground truncate block">
                      {item.shortLabel}
                      {item.suffix ? <span className="ml-0.5 opacity-60">({item.suffix})</span> : null}
                    </label>
                    <div className="relative">
                      <Input
                        id={`def-${key}`}
                        value={item.value}
                        onChange={(event) => handleValueChange(key, event.target.value)}
                        onBlur={handleBlur}
                        inputMode="decimal"
                        aria-invalid={isError}
                        disabled={isSaving}
                        className={clsx(
                          'h-7 w-full text-right text-sm font-medium tabular-nums',
                          isError
                            ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-900/20 dark:text-rose-100'
                            : isDirty
                              ? 'border-amber-300 bg-amber-50 text-slate-900 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-slate-100'
                              : 'bg-background dark:bg-background',
                        )}
                      />
                      {isSaving ? (
                        <div className="absolute inset-y-0 right-2 flex items-center">
                          <svg className="h-3 w-3 animate-spin text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Finance row */}
          <div className="px-4 py-3">
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Financial Defaults
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {financeItems.map((item) => {
                const key = item.id || item.label;
                const isError = item.status === 'error' || item.status === 'blocked';
                const isDirty = item.status === 'dirty';
                const isSaving = item.status === 'saving';

                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`def-${key}`} className="text-2xs text-muted-foreground truncate block">
                      {item.shortLabel}
                      {item.suffix ? <span className="ml-0.5 opacity-60">({item.suffix})</span> : null}
                    </label>
                    <div className="relative">
                      <Input
                        id={`def-${key}`}
                        value={item.value}
                        onChange={(event) => handleValueChange(key, event.target.value)}
                        onBlur={handleBlur}
                        inputMode="decimal"
                        aria-invalid={isError}
                        disabled={isSaving}
                        className={clsx(
                          'h-7 w-full text-right text-sm font-medium tabular-nums',
                          isError
                            ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-900/20 dark:text-rose-100'
                            : isDirty
                              ? 'border-amber-300 bg-amber-50 text-slate-900 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-slate-100'
                              : 'bg-background dark:bg-background',
                        )}
                      />
                      {isSaving ? (
                        <div className="absolute inset-y-0 right-2 flex items-center">
                          <svg className="h-3 w-3 animate-spin text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
