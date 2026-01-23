'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, kicker, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {kicker && <div className="text-section-header">{kicker}</div>}
        <h1 className="mt-1 font-display text-3xl leading-none tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</div>}
      </div>

      {actions && <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

