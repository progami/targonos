'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, CloudDownload, Loader2, Search, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { withAppBasePath } from '@/lib/base-path';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type AmazonProduct = {
  sku: string;
  name: string;
  asin: string | null;
};

type ImportResult = {
  ok: true;
  createdCount: number;
  skippedExistingCount: number;
  createdSkus: string[];
  skippedExistingSkus: string[];
};

function normalizeSku(value: string) {
  return value.trim().toLowerCase();
}

const RESULTS_LIMIT = 500;

export function ProductSetupAmazonImport({
  strategyId,
  existingSkus,
  className,
  buttonClassName,
}: {
  strategyId: string;
  existingSkus: string[];
  className?: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const existingSkuSet = useMemo(
    () => new Set(existingSkus.map((sku) => normalizeSku(sku))),
    [existingSkus],
  );

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AmazonProduct[]>([]);
  const [selectedBySku, setSelectedBySku] = useState<Map<string, { sku: string; name: string; asin?: string }>>(
    () => new Map(),
  );

  const selectedCount = useMemo(() => selectedBySku.size, [selectedBySku]);

  const selectableVisible = useMemo(() => {
    return results.filter((row) => !existingSkuSet.has(normalizeSku(row.sku)));
  }, [existingSkuSet, results]);

  const allVisibleSelected = useMemo(() => {
    if (selectableVisible.length === 0) return false;
    return selectableVisible.every((row) => selectedBySku.has(normalizeSku(row.sku)));
  }, [selectableVisible, selectedBySku]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => {
        const trimmed = query.trim();
        const params = new URLSearchParams({
          strategyId,
          limit: String(RESULTS_LIMIT),
        });
        if (trimmed) params.set('q', trimmed);

        setIsLoading(true);
        setError(null);

        fetch(withAppBasePath(`/api/v1/xplan/amazon/products?${params.toString()}`), {
          method: 'GET',
          signal: controller.signal,
        })
          .then(async (response) => {
            const json = (await response.json().catch(() => null)) as any;
            if (!response.ok) {
              const message =
                typeof json?.error === 'string' ? json.error : 'Failed to load catalog';
              throw new Error(message);
            }
            const products = Array.isArray(json?.products)
              ? (json.products as AmazonProduct[])
              : [];
            setResults(
              products
                .map((row) => ({
                  sku: String(row.sku ?? '').trim(),
                  name: String(row.name ?? '').trim(),
                  asin: row.asin ? String(row.asin).trim() : null,
                }))
                .filter((row) => row.sku && row.name),
            );
          })
          .catch((fetchError) => {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            setError(message);
            setResults([]);
          })
          .finally(() => setIsLoading(false));
      },
      query.trim().length > 0 ? 250 : 0,
    );

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, strategyId]);

  const toggleSku = (row: AmazonProduct) => {
    const key = normalizeSku(row.sku);
    if (existingSkuSet.has(key)) return;
    setSelectedBySku((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { sku: row.sku, name: row.name, asin: row.asin ?? undefined });
      return next;
    });
  };

  const clearAll = () => setSelectedBySku(new Map());

  const selectAllVisible = () => {
    if (selectableVisible.length === 0) return;
    setSelectedBySku((prev) => {
      const next = new Map(prev);
      for (const row of selectableVisible) {
        next.set(normalizeSku(row.sku), { sku: row.sku, name: row.name, asin: row.asin ?? undefined });
      }
      return next;
    });
  };

  const toggleSelectVisible = () => {
    if (allVisibleSelected) {
      setSelectedBySku((prev) => {
        const next = new Map(prev);
        for (const row of selectableVisible) next.delete(normalizeSku(row.sku));
        return next;
      });
      return;
    }
    selectAllVisible();
  };

  const handleImport = async () => {
    if (isImporting) return;
    if (selectedBySku.size === 0) {
      toast.error('Select at least one product');
      return;
    }

    const selected = Array.from(selectedBySku.values());

    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/products/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          products: selected,
        }),
      });

      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        const message = typeof json?.error === 'string' ? json.error : 'Import failed';
        throw new Error(message);
      }

      const payload = json as ImportResult;

      toast.success('Import complete', {
        description: `Added ${payload.createdCount.toLocaleString()} product${
          payload.createdCount === 1 ? '' : 's'
        }${
          payload.skippedExistingCount > 0
            ? `, skipped ${payload.skippedExistingCount.toLocaleString()} existing`
            : ''
        }.`,
      });

      setOpen(false);
      setSelectedBySku(new Map());
      setQuery('');
      router.refresh();
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : String(importError);
      setError(message);
      toast.error('Import failed', { description: message });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10',
          buttonClassName,
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <CloudDownload className="h-4 w-4" />
          Import from Talos
        </span>
      </button>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isImporting) return;
          setOpen(nextOpen);
          if (!nextOpen) {
            setError(null);
            setQuery('');
            setResults([]);
            setSelectedBySku(new Map());
          }
        }}
      >
        <AlertDialogContent className="max-w-3xl overflow-hidden border-0 bg-white p-0 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:bg-[#0a1f33] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5),0_0_40px_rgba(0,194,185,0.08)]">
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-cyan-400 to-teal-400 dark:from-[#00c2b9] dark:via-[#00d5cb] dark:to-[#00e5d4]" />

          <div className="px-6 pb-6 pt-5">
            <AlertDialogHeader className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <AlertDialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Import products from Talos
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-1">
                    Select SKUs to add to this strategy. Existing SKUs are locked.
                  </AlertDialogDescription>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectVisible}
                    disabled={isLoading || isImporting || selectableVisible.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-[#2a4a64] dark:bg-[#0a2438] dark:text-slate-300 dark:hover:bg-[#0f2d45]"
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
                  </button>

                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={isImporting || selectedBySku.size === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-[#2a4a64] dark:bg-[#0a2438] dark:text-slate-300 dark:hover:bg-[#0f2d45]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search SKU, name, or ASIN…"
                    className="h-9 pl-9"
                    disabled={isLoading || isImporting}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    Selected
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedCount.toLocaleString()}
                  </span>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              )}
            </AlertDialogHeader>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a3a54] dark:bg-[#061828]">
              <div className="max-h-[340px] overflow-auto">
                {isLoading ? (
                  <div className="flex items-center gap-3 p-6 text-sm text-slate-600 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading catalog…
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-6 text-sm text-slate-600 dark:text-slate-300">No matches.</div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-[#1a3a54]">
                    {results.map((row) => {
                      const key = normalizeSku(row.sku);
                      const isExisting = existingSkuSet.has(key);
                      const isSelected = selectedBySku.has(key);
                      return (
                        <li key={row.sku}>
                          <button
                            type="button"
                            disabled={isExisting || isImporting}
                            onClick={() => toggleSku(row)}
                            className={cn(
                              'flex w-full items-start gap-3 px-4 py-3 text-left transition',
                              isExisting
                                ? 'cursor-not-allowed bg-slate-50/70 opacity-70 dark:bg-white/5'
                                : 'hover:bg-cyan-50/60 dark:hover:bg-[#00c2b9]/10',
                            )}
                          >
                            <span
                              className={cn(
                                'mt-0.5 flex h-5 w-5 items-center justify-center rounded border',
                                isExisting
                                  ? 'border-slate-300 bg-white dark:border-[#2a4a64] dark:bg-[#0a2438]'
                                  : isSelected
                                    ? 'border-cyan-600 bg-cyan-600 text-white dark:border-[#00c2b9] dark:bg-[#00c2b9] dark:text-[#002430]'
                                    : 'border-slate-300 bg-white dark:border-[#2a4a64] dark:bg-[#0a2438]',
                              )}
                              aria-hidden="true"
                            >
                              {isSelected ? <CheckSquare className="h-4 w-4" /> : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {row.sku}
                                </span>
                                {row.asin ? (
                                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {row.asin}
                                  </span>
                                ) : null}
                                {isExisting ? (
                                  <Badge
                                    variant="secondary"
                                    className="h-5 bg-slate-200/70 px-2 text-2xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300"
                                  >
                                    Already in strategy
                                  </Badge>
                                ) : null}
                              </div>
                              <div
                                className="mt-0.5 min-w-0 truncate text-sm text-slate-600 dark:text-slate-300"
                                title={row.name}
                              >
                                {row.name}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <AlertDialogFooter className="mt-6 flex gap-3 sm:gap-3">
              <AlertDialogCancel
                disabled={isImporting}
                className="flex-1 border-slate-300 bg-white font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow dark:border-[#2a4a64] dark:bg-[#0a2438] dark:text-slate-300 dark:hover:bg-[#0f2d45]"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleImport();
                }}
                disabled={isImporting || selectedBySku.size === 0}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 font-medium text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 hover:shadow-xl hover:shadow-cyan-500/30 disabled:opacity-70 dark:from-[#00c2b9] dark:to-[#00a89d] dark:text-[#002430] dark:shadow-[#00c2b9]/25 dark:hover:from-[#00d5cb] dark:hover:to-[#00c2b9]"
              >
                {isImporting ? 'Importing…' : 'Import selected'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
