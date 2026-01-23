'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type FilterOption = {
  value: string;
  label: string;
};

type FilterConfig = {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
};

type FilterBarProps = {
  filters: FilterConfig[];
  onFilter?: () => void;
  onClear?: () => void;
  showFilterButton?: boolean;
  showClearButton?: boolean;
  className?: string;
};

export function FilterBar({
  filters,
  onFilter,
  onClear,
  showFilterButton = true,
  showClearButton = true,
  className,
}: FilterBarProps) {
  const hasActiveFilters = filters.some((f) => f.value !== '' && f.value !== 'all');

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-4 rounded-xl border border-slate-200/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-slate-900/50',
        className,
      )}
    >
      {filters.map((filter) => (
        <div key={filter.key} className="flex-1 min-w-[160px] space-y-1.5">
          <label className="block text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
            {filter.label}
          </label>
          <Select value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger className="h-11 bg-white dark:bg-white/5">
              <SelectValue placeholder={filter.placeholder ?? 'Select'} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      <div className="flex items-center gap-2">
        {showClearButton && hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={onClear}
            className="h-11 px-4 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Clear
          </Button>
        )}
        {showFilterButton && (
          <Button
            onClick={onFilter}
            className="h-11 px-6 text-xs font-semibold uppercase tracking-wide"
          >
            Filter
          </Button>
        )}
      </div>
    </div>
  );
}
