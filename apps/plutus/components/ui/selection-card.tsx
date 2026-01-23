'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type SelectionCardProps = {
  selected?: boolean;
  badge?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export function SelectionCard({
  selected = false,
  badge,
  icon,
  title,
  description,
  onClick,
  disabled = false,
  className,
}: SelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex flex-col items-center text-center rounded-lg border-2 transition-all duration-200',
        'w-[240px] min-h-[180px] overflow-hidden',
        'focus:outline-none focus:ring-2 focus:ring-brand-teal-500/50 focus:ring-offset-2',
        selected
          ? 'border-brand-teal-500 shadow-lg dark:border-brand-cyan'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:hover:border-white/20',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {/* Badge */}
      {badge && (
        <div
          className={cn(
            'w-full py-2 text-xs font-semibold text-white',
            'bg-brand-teal-500 dark:bg-brand-cyan dark:text-slate-900',
          )}
        >
          {badge}
        </div>
      )}

      {/* Content */}
      <div className={cn('flex flex-1 flex-col items-center justify-center p-6', !badge && 'pt-8')}>
        {/* Icon */}
        {icon && (
          <div
            className={cn(
              'mb-4 text-slate-400 transition-colors',
              selected && 'text-brand-teal-500 dark:text-brand-cyan',
              !selected && 'group-hover:text-slate-500',
            )}
          >
            {icon}
          </div>
        )}

        {/* Title */}
        <h3
          className={cn(
            'text-base font-medium transition-colors',
            selected
              ? 'text-brand-teal-600 dark:text-brand-cyan'
              : 'text-brand-teal-600 dark:text-brand-teal-400',
          )}
        >
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-[200px]">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}
