import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'neutral'; label?: string };
  dotColor?: string;
  className?: string;
};

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'neutral') {
    return (
      <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      className={cn('h-3.5 w-3.5', direction === 'up' ? 'text-emerald-500' : 'text-red-500')}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d={direction === 'up' ? 'M8 3v10M4 7l4-4 4 4' : 'M8 13V3M4 9l4 4 4-4'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatCard({ label, value, icon, trend, dotColor, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900/80',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-teal-400/60 via-brand-teal-500/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {dotColor && (
              <span className={cn('inline-block h-2 w-2 rounded-full', dotColor)} />
            )}
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {label}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {value}
            </span>
            {trend && (
              <span className="flex items-center gap-1">
                <TrendArrow direction={trend.direction} />
                {trend.label && (
                  <span
                    className={cn(
                      'text-xs font-medium',
                      trend.direction === 'up' && 'text-emerald-600 dark:text-emerald-400',
                      trend.direction === 'down' && 'text-red-600 dark:text-red-400',
                      trend.direction === 'neutral' && 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {trend.label}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-teal-50 text-brand-teal-600 dark:bg-brand-teal-950/40 dark:text-brand-teal-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
