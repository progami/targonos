import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type TimelineItem = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  timestamp?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
};

type TimelineProps = {
  items: TimelineItem[];
  className?: string;
};

const variantStyles = {
  default: {
    dot: 'bg-slate-300 dark:bg-slate-600',
    ring: 'ring-slate-200 dark:ring-slate-700',
    icon: 'text-slate-500 dark:text-slate-400',
  },
  success: {
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    ring: 'ring-emerald-100 dark:ring-emerald-900/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    dot: 'bg-amber-500 dark:bg-amber-400',
    ring: 'ring-amber-100 dark:ring-amber-900/30',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    dot: 'bg-red-500 dark:bg-red-400',
    ring: 'ring-red-100 dark:ring-red-900/30',
    icon: 'text-red-600 dark:text-red-400',
  },
};

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Timeline({ items, className }: TimelineProps) {
  return (
    <div className={cn('relative', className)}>
      {items.map((item, index) => {
        const variant = item.variant ?? 'default';
        const styles = variantStyles[variant];
        const isLast = index === items.length - 1;

        return (
          <div key={index} className="relative flex gap-4 pb-8 last:pb-0">
            {/* Vertical connecting line */}
            {!isLast && (
              <div className="absolute left-[15px] top-[28px] bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
            )}

            {/* Dot / Icon */}
            <div className="relative flex-shrink-0">
              <div
                className={cn(
                  'flex h-[30px] w-[30px] items-center justify-center rounded-full ring-4',
                  styles.dot,
                  styles.ring,
                )}
              >
                <span className={styles.icon}>
                  {item.icon ?? <CheckIcon />}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  {item.description && (
                    <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {item.description}
                    </div>
                  )}
                </div>
                {item.timestamp && (
                  <time className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                    {item.timestamp}
                  </time>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
