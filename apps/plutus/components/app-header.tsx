'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QboStatusIndicator } from '@/components/qbo-status-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (assetBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

function TargonWordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <img src={`${assetBasePath}/brand/logo.svg`} alt="Targon" className="h-6 w-auto dark:hidden" />
      <img
        src={`${assetBasePath}/brand/logo-inverted.svg`}
        alt="Targon"
        className="hidden h-6 w-auto dark:block"
      />
    </div>
  );
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function QboStatusFallback() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10">
      <div className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
      <span className="text-sm text-slate-400 dark:text-slate-500">QBO</span>
    </div>
  );
}

const NAV_ITEMS = [
  { href: '/settlements', label: 'Settlements' },
  { href: '/setup', label: 'Accounts & Taxes' },
  { href: '/bills', label: 'Inventory' },
  { href: '/chart-of-accounts', label: 'Accounts' },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8 min-w-0">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-teal-500 to-brand-teal-600 dark:from-brand-cyan dark:to-brand-teal-500">
              <LogoIcon className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900 dark:text-white">Plutus</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'transition-colors',
                    isActive
                      ? 'text-brand-teal-700 dark:text-brand-cyan font-semibold'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Suspense fallback={<QboStatusFallback />}>
            <QboStatusIndicator />
          </Suspense>
          <ThemeToggle />
          <TargonWordmark className="hidden sm:block shrink-0" />
        </div>
      </div>
    </header>
  );
}
