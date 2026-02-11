'use client';

import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

interface ActiveStrategyIndicatorProps {
  strategyName: string;
  className?: string;
}

export function ActiveStrategyIndicator({ strategyName, className }: ActiveStrategyIndicatorProps) {
  return (
    <Tooltip content={strategyName} position="bottom">
      <div
        className={cn(
          'flex max-w-[320px] items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
          className,
        )}
      >
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="truncate">{strategyName}</span>
      </div>
    </Tooltip>
  );
}
