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

  const endpoint = useMemo(() => {
    const base = manualSyncPathForRegion(strategyRegion);
    return withAppBasePath(`${base}?strategyId=${encodeURIComponent(strategyId)}`);
  }, [strategyId, strategyRegion]);

  const runSync = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    const toastId = toast.loading('Syncing Sellerboard…');

    try {
      const response = await fetch(endpoint, { method: 'POST' });
      if (!response.ok) {
        const message = await response.text();
        toast.error(`Sellerboard sync failed: ${message}`, { id: toastId });
        return;
      }

      toast.success('Sellerboard sync complete', { id: toastId });
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
    </div>
  );
}

