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
        'inline-block rounded-full',
        isIncompleteWeek
          ? 'w-2.5 h-2.5 bg-warning-400 ring-2 ring-warning-200 dark:ring-warning-700 animate-pulse'
          : 'w-2 h-2 bg-success-500',
        className,
      )}
      title={isIncompleteWeek ? 'Current week (in progress)' : 'Actuals'}
    />
  );
}
