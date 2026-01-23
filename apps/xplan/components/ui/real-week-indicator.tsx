'use client';

import { cn } from '@/lib/utils';

type RealWeekIndicatorProps = {
  hasActualData: boolean;
  isIncompleteWeek?: boolean;
  className?: string;
};

export function RealWeekIndicator({
  hasActualData,
  isIncompleteWeek,
  className,
}: RealWeekIndicatorProps) {
  if (!hasActualData) return null;

  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full',
        isIncompleteWeek ? 'bg-yellow-400' : 'bg-emerald-500',
        className
      )}
    />
  );
}
