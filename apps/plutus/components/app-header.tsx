'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { QboStatusIndicator } from '@/components/qbo-status-indicator';

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

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-teal-500 to-brand-teal-600 dark:from-brand-cyan dark:to-brand-teal-500">
            <LogoIcon className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold text-slate-900 dark:text-white">Plutus</span>
        </Link>

        {/* QBO Status */}
        <Suspense fallback={<QboStatusFallback />}>
          <QboStatusIndicator />
        </Suspense>
      </div>
    </header>
  );
}
