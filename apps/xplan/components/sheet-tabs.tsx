'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { SheetConfig, SheetSlug } from '@/lib/sheets';

type SheetTab = SheetConfig & { href?: string; prefetch?: boolean };

interface SheetTabsProps {
  sheets: SheetTab[];
  activeSlug: SheetSlug;
  suffix?: React.ReactNode;
  variant?: 'scroll' | 'stack';
  onSheetSelect?: (slug: SheetSlug) => void;
}

export function SheetTabs({
  sheets,
  activeSlug,
  suffix,
  variant = 'scroll',
  onSheetSelect,
}: SheetTabsProps) {
  const pathname = usePathname();
  const isStack = variant === 'stack';

  const handleClick = (slug: SheetSlug, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onSheetSelect) return;
    event.preventDefault();
    onSheetSelect(slug);
  };

  const activeIndex = sheets.findIndex((sheet) => sheet.slug === activeSlug);

  if (isStack) {
    return (
      <div className="flex w-full flex-col gap-3">
        <nav className="flex flex-col gap-1">
          {sheets.map((sheet) => {
            const Icon = sheet.icon;
            const href = sheet.href ?? `/${sheet.slug}`;
            const isActive = activeSlug === sheet.slug || pathname === href;
            return (
              <Link
                key={sheet.slug}
                href={href}
                prefetch={sheet.prefetch}
                onClick={onSheetSelect ? (event) => handleClick(sheet.slug, event) : undefined}
                className={clsx(
                  'relative min-w-[160px] overflow-hidden rounded-2xl border px-4 py-3.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2B9] touch-manipulation',
                  isActive
                    ? 'border-cyan-600 bg-cyan-600/20 text-slate-900 shadow-md dark:border-[#00C2B9] dark:bg-[#00C2B9]/30 dark:text-white dark:shadow-[0_18px_40px_rgba(0,194,185,0.3)]'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-500 hover:bg-slate-50 hover:text-slate-900 dark:border-[#6F7B8B]/50 dark:bg-[#002C51]/70 dark:text-[#6F7B8B] dark:hover:border-[#00C2B9]/70 dark:hover:bg-[#002C51] dark:hover:text-white',
                )}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                  <span>{sheet.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        {suffix && <div className="shrink-0">{suffix}</div>}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-2 py-1">
      <nav className="flex items-center overflow-x-auto">
        <ol className="flex items-center gap-0.5">
          {sheets.map((sheet, index) => {
            const href = sheet.href ?? `/${sheet.slug}`;
            const isActive = activeSlug === sheet.slug || pathname === href;
            const isCompleted = index < activeIndex;
            const stepNumber = index + 1;

            return (
              <li key={sheet.slug} className="flex items-center">
                <Link
                  href={href}
                  prefetch={sheet.prefetch}
                  onClick={onSheetSelect ? (event) => handleClick(sheet.slug, event) : undefined}
                  title={sheet.label}
                  className={clsx(
                    'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
                    isActive
                      ? 'bg-cyan-600 text-white shadow-md dark:bg-cyan-500 dark:text-white'
                      : isCompleted
                        ? 'text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-900/20'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all',
                      isActive
                        ? 'bg-white text-cyan-600 dark:bg-white dark:text-cyan-600'
                        : isCompleted
                          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                    )}
                  >
                    {stepNumber}
                  </span>
                  <span className="whitespace-nowrap">{sheet.shortLabel}</span>
                </Link>
                {index < sheets.length - 1 && (
                  <ChevronRight
                    className={clsx(
                      'mx-1 h-4 w-4 flex-shrink-0',
                      isCompleted
                        ? 'text-cyan-600 dark:text-cyan-400'
                        : 'text-slate-300 dark:text-slate-600',
                    )}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {suffix && <div className="shrink-0">{suffix}</div>}
    </div>
  );
}
