'use client';

import { clsx } from 'clsx';

import type { SelectionStats } from '@/lib/selection-stats';

type SelectionStatsBarProps = {
  stats: SelectionStats | null;
  className?: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

export function SelectionStatsBar({ stats, className }: SelectionStatsBarProps) {
  if (!stats || stats.cellCount === 0) return null;

  const parts: string[] = [];

  if (stats.numericCount > 0) {
    parts.push(`Σ ${formatNumber(stats.sum)}`);
    if (stats.average != null && stats.numericCount > 1) {
      parts.push(`Avg ${formatNumber(stats.average)}`);
    }
    parts.push(`N ${formatNumber(stats.numericCount)}`);
  } else {
    parts.push(`N ${formatNumber(stats.cellCount)}`);
  }

  return (
    <div
      className={clsx(
        'pointer-events-none absolute bottom-3 right-3 z-30 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200',
        className,
      )}
      aria-hidden="true"
    >
      {parts.join(' · ')}
    </div>
  );
}
