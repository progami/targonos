'use client';

import { cn } from '@/lib/utils';

type RealWeekIndicatorProps = {
  hasActualData: boolean;
  className?: string;
};

export function RealWeekIndicator({ hasActualData, className }: RealWeekIndicatorProps) {
  if (!hasActualData) return null;

  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full bg-emerald-500',
        className
      )}
    />
  );
}
