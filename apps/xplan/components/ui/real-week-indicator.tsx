'use client';

import { cn } from '@/lib/utils';

type RealWeekIndicatorProps = {
  hasActualData: boolean;
  isIncompleteWeek?: boolean;
  className?: string;
};

export function RealWeekIndicator({
  isIncompleteWeek,
  className,
}: RealWeekIndicatorProps) {
  if (!isIncompleteWeek) return null;

  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-success-200 dark:ring-success-700',
        className,
      )}
      title="Current week"
    />
  );
}
