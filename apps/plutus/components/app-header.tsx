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
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 15.2c0-5 4-9 9-9c2.8 0 4.9 1.8 4.9 4.6c0 5.2-5.2 9.8-12 9.8c-1.9 0-3.4-.6-4.4-1.7c-.7-.8-1-1.7-1-2.7Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M7 15.2c0-5 4-9 9-9c2.8 0 4.9 1.8 4.9 4.6c0 5.2-5.2 9.8-12 9.8c-1.9 0-3.4-.6-4.4-1.7c-.7-.8-1-1.7-1-2.7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 14.9c0-2.4 2-4.3 4.4-4.3c1.8 0 3.2 1.1 3.2 2.9c0 2.7-2.7 5.2-6.6 5.2c-.6 0-1.1-.1-1.6-.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M14.3 9.2c.6-.5 1.3-.9 2-.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="6.7" cy="8.0" r="1.35" fill="currentColor" opacity="0.95" />
      <circle cx="8.9" cy="6.3" r="1.05" fill="currentColor" opacity="0.8" />
      <circle cx="9.5" cy="8.9" r="0.85" fill="currentColor" opacity="0.7" />
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
