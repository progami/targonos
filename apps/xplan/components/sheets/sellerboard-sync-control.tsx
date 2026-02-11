'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { withAppBasePath } from '@/lib/base-path';
import type { StrategyRegion } from '@/lib/strategy-region';
import {
  SHEET_TOOLBAR_BUTTON,
  SHEET_TOOLBAR_GROUP,
  SHEET_TOOLBAR_LABEL,
} from '@/components/sheet-toolbar';

function manualSyncPathForRegion(region: StrategyRegion) {
  switch (region) {
    case 'UK':
      return '/api/v1/xplan/sellerboard/uk-sync/manual';
    case 'US':
      return '/api/v1/xplan/sellerboard/us-sync/manual';
    default: {
      const exhaustive: never = region;
      throw new Error(`Unsupported region: ${String(exhaustive)}`);
    }
  }
}

export function SellerboardSyncControl({
  strategyId,
  strategyRegion,
}: {
  strategyId: string;
  strategyRegion: StrategyRegion;
}) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    const base = manualSyncPathForRegion(strategyRegion);
    return withAppBasePath(`${base}?strategyId=${encodeURIComponent(strategyId)}`);
  }, [strategyId, strategyRegion]);

  const runSync = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    const toastId = toast.loading('Syncing Sellerboard…');

    try {
      const response = await fetch(endpoint, { method: 'POST', cache: 'no-store' });
      const bodyText = await response.text();
      if (!response.ok) {
        let message = bodyText.trim();
        try {
          const parsed = JSON.parse(bodyText) as { error?: unknown };
          if (typeof parsed?.error === 'string' && parsed.error.length > 0) {
            message = parsed.error;
          }
        } catch {}
        toast.error(`Sellerboard sync failed: ${message}`, { id: toastId });
        return;
      }

      let summary: string | null = null;
      try {
        const parsed = JSON.parse(bodyText) as {
          ok?: unknown;
          actualSales?: { updates?: number; productsMatched?: number; rowsParsed?: number };
          dashboard?: { updates?: number; rowsParsed?: number };
        };
        if (parsed?.ok === true) {
          const actualUpdates = Number(parsed.actualSales?.updates ?? 0);
          const actualRows = Number(parsed.actualSales?.rowsParsed ?? 0);
          const productsMatched = Number(parsed.actualSales?.productsMatched ?? 0);
          const dashboardUpdates = Number(parsed.dashboard?.updates ?? 0);
          const dashboardRows = Number(parsed.dashboard?.rowsParsed ?? 0);

          const parts = [
            `Sales ${actualUpdates} updates`,
            `Dashboard ${dashboardUpdates} updates`,
          ];

          if (actualRows > 0 && productsMatched === 0) {
            parts.push('0 product matches');
          }
          if (actualRows === 0 && dashboardRows === 0) {
            parts.push('0 rows parsed');
          }

          summary = parts.join(' • ');
        }
      } catch {}

      setLastSyncSummary(summary);
      toast.success(summary ? `Sellerboard sync complete (${summary})` : 'Sellerboard sync complete', {
        id: toastId,
      });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Sellerboard sync failed: ${message}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  }, [endpoint, isSyncing, router]);

  return (
    <div className={SHEET_TOOLBAR_GROUP}>
      <span className={SHEET_TOOLBAR_LABEL}>Sellerboard</span>
      <button
        type="button"
        className={SHEET_TOOLBAR_BUTTON}
        onClick={runSync}
        disabled={isSyncing}
      >
        {isSyncing ? 'Syncing…' : 'Sync now'}
      </button>
      {lastSyncSummary ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{lastSyncSummary}</span>
      ) : null}
    </div>
  );
}
