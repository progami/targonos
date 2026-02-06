import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

function DefaultIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 48 48" fill="none">
      <rect x="6" y="10" width="36" height="28" rx="4" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" />
      <path d="M6 18h36" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" />
      <circle cx="24" cy="28" r="4" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" />
      <path d="M20 34l4-2 4 2" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4', className)}>
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-50 dark:bg-white/5">
        <div className="text-slate-400 dark:text-slate-500">
          {icon ?? <DefaultIcon />}
        </div>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-center text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
