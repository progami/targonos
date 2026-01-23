'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const ChevronDownIcon = ChevronDown as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>;

type DropdownItem = {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
};

type SplitButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  dropdownItems: DropdownItem[];
  disabled?: boolean;
  className?: string;
};

export function SplitButton({
  children,
  onClick,
  dropdownItems,
  disabled = false,
  className,
}: SplitButtonProps) {
  return (
    <div className={cn('inline-flex rounded-md shadow-sm', className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors',
          'bg-brand-teal-500 hover:bg-brand-teal-600 active:bg-brand-teal-700',
          'rounded-l-md border-r border-white/20',
          'focus:outline-none focus:ring-2 focus:ring-brand-teal-500/50 focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'dark:bg-brand-cyan dark:hover:bg-brand-teal-400 dark:text-slate-900',
        )}
      >
        {children}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center justify-center px-2 py-2 text-white transition-colors',
              'bg-brand-teal-600 hover:bg-brand-teal-700 active:bg-brand-teal-800',
              'rounded-r-md',
              'focus:outline-none focus:ring-2 focus:ring-brand-teal-500/50 focus:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              'dark:bg-brand-teal-500 dark:hover:bg-brand-teal-600 dark:text-white',
            )}
          >
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Open options</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {dropdownItems.map((item, index) => (
            <DropdownMenuItem
              key={index}
              onClick={item.onClick}
              disabled={item.disabled}
              className={cn(
                item.variant === 'destructive' &&
                  'text-danger-600 focus:text-danger-600 dark:text-danger-400 dark:focus:text-danger-400',
              )}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
