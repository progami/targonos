'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { withAppBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import { SHEET_TOOLBAR_GROUP, SHEET_TOOLBAR_LABEL } from '@/components/sheet-toolbar';
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

type SellerboardUsSyncResult = {
  ok: true;
  durationMs: number;
  rowsParsed: number;
  rowsSkipped: number;
  productsMatched: number;
  asinMappingsFound: number;
  asinProductsMatched: number;
  updates: number;
  csvSha256: string;
  oldestPurchaseDateUtc: string | null;
  newestPurchaseDateUtc: string | null;
};

type SellerboardDashboardSyncResult = {
  ok: true;
  durationMs: number;
  rowsParsed: number;
  rowsSkipped: number;
  productsMatched: number;
  asinDirectMatched: number;
  asinMappingsFound: number;
  asinProductsMatched: number;
  updates: number;
  csvSha256: string;
  oldestDateUtc: string | null;
  newestDateUtc: string | null;
};

type SellerboardSyncResult = {
  ok: true;
  durationMs: number;
  actualSales: SellerboardUsSyncResult;
  dashboard: SellerboardDashboardSyncResult;
};

function formatIsoTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 1) return `${durationMs}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remainderSeconds}s`;
}

export function SellerboardUsSyncControl({
  isSuperAdmin,
  strategyRegion,
  strategyId,
}: {
  isSuperAdmin: boolean;
  strategyRegion: 'US' | 'UK';
  strategyId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SellerboardSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRender = isSuperAdmin;
  const regionSlug = strategyRegion === 'UK' ? 'uk' : 'us';
  const status = useMemo(() => {
    if (isSyncing) return 'syncing';
    if (result) return 'done';
    if (error) return 'error';
    return 'idle';
  }, [error, isSyncing, result]);

  const endpoint = `/api/v1/xplan/sellerboard/${regionSlug}-sync/manual`;
  const endpointWithStrategy = `${endpoint}?strategyId=${encodeURIComponent(strategyId)}`;

  const title = 'Sellerboard Sync';
  const subtitle = `Updates Actual sales + past-week financials for this strategy`;

  const syncButtonLabel = 'Sellerboard Sync';

  const runSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(withAppBasePath(endpointWithStrategy), {
        method: 'POST',
      });
      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        const message = typeof json?.error === 'string' ? json.error : 'Sync failed';
        throw new Error(message);
      }

      setResult(json as SellerboardSyncResult);
      const actualUpdates =
        typeof json?.actualSales?.updates === 'number' ? json.actualSales.updates : 0;
      const dashboardUpdates =
        typeof json?.dashboard?.updates === 'number' ? json.dashboard.updates : 0;
      toast.success('Sellerboard sync complete', {
        description: `Actuals: ${actualUpdates.toLocaleString()} · Financials: ${dashboardUpdates.toLocaleString()}`,
      });
      router.refresh();
      const query = searchParams.toString();
      void router.prefetch(query.length ? `/5-fin-planning-pl?${query}` : '/5-fin-planning-pl');
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      setError(message);
      toast.error('Sellerboard sync failed', { description: message });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!canRender) return null;

  const newestOrdersTimestamp = result?.actualSales.newestPurchaseDateUtc ?? null;
  const newestDashboardTimestamp = result?.dashboard.newestDateUtc ?? null;

  return (
    <>
      <div className={SHEET_TOOLBAR_GROUP}>
        <button
          type="button"
          disabled={isSyncing}
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 active:translate-y-px',
            'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
            'dark:border-[#00c2b9]/40 dark:bg-[#00c2b9]/10 dark:text-cyan-200 dark:hover:bg-[#00c2b9]/15',
            isSyncing && 'cursor-not-allowed opacity-70',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          {syncButtonLabel}
        </button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSyncing) return;
          setOpen(nextOpen);
          if (!nextOpen) {
            setError(null);
            setResult(null);
          }
        }}
      >
        <AlertDialogContent className="overflow-hidden border-0 bg-white p-0 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:bg-[#0a1f33] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5),0_0_40px_rgba(0,194,185,0.08)]">
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-cyan-400 to-teal-400 dark:from-[#00c2b9] dark:via-[#00d5cb] dark:to-[#00e5d4]" />

          <div className="px-6 pb-6 pt-5">
            <AlertDialogHeader className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 blur-md dark:from-[#00c2b9]/30 dark:to-[#00d5cb]/20" />
                  <div
                    className={cn(
                      'relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg',
                      status === 'error'
                        ? 'from-rose-500 to-rose-600 dark:from-rose-500 dark:to-rose-600'
                        : status === 'done'
                          ? 'from-emerald-500 to-emerald-600 dark:from-emerald-500 dark:to-emerald-600'
                          : 'from-cyan-500 to-cyan-600 dark:from-[#00c2b9] dark:to-[#00a89d]',
                    )}
                  >
                    {status === 'done' ? (
                      <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
                    ) : status === 'error' ? (
                      <ShieldAlert className="h-5 w-5 text-white" aria-hidden="true" />
                    ) : (
                      <RefreshCw
                        className={cn('h-5 w-5 text-white', isSyncing && 'animate-spin')}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <AlertDialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {title}
                  </AlertDialogTitle>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                </div>
              </div>

              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  {!result && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 dark:bg-amber-500/10">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          This will overwrite existing Actual values and past-week financial totals.
                        </p>
                        <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
                          Data comes from a Sellerboard automation snapshot and may lag the live
                          dashboard until Sellerboard refreshes the report.
                        </p>
                      </div>
                    </div>
                  )}

                  {isSyncing && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#1a3a54] dark:bg-[#061828]">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent dark:border-[#00C2B9]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            Sync in progress…
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Fetching report → parsing → writing sync results
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                      {error}
                    </div>
                  )}

                  {result && (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#1a3a54] dark:bg-[#061828]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Actuals updated
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {result.actualSales.updates.toLocaleString()} cells
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Financials updated
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {result.dashboard.updates.toLocaleString()} rows
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Products matched
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {result.actualSales.productsMatched.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Orders newest
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatIsoTimestamp(newestOrdersTimestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Dashboard newest
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatIsoTimestamp(newestDashboardTimestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Runtime
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatDuration(result.durationMs)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6 flex gap-3 sm:gap-3">
              <AlertDialogCancel
                disabled={isSyncing}
                className="flex-1 border-slate-300 bg-white font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow dark:border-[#2a4a64] dark:bg-[#0a2438] dark:text-slate-300 dark:hover:bg-[#0f2d45]"
              >
                {result ? 'Close' : 'Cancel'}
              </AlertDialogCancel>

              {!result && (
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void runSync();
                  }}
                  disabled={isSyncing}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 font-medium text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 hover:shadow-xl hover:shadow-cyan-500/30 disabled:opacity-70 dark:from-[#00c2b9] dark:to-[#00a89d] dark:text-[#002430] dark:shadow-[#00c2b9]/25 dark:hover:from-[#00d5cb] dark:hover:to-[#00c2b9]"
                >
                  {isSyncing ? 'Syncing…' : syncButtonLabel}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SellerboardSyncControl(props: {
  isSuperAdmin: boolean;
  strategyRegion: 'US' | 'UK';
  strategyId: string;
}) {
  return <SellerboardUsSyncControl {...props} />;
}
