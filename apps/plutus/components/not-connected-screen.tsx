'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/plutus';

function QboLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 12h8M12 8v8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

interface NotConnectedScreenProps {
  title: string;
}

export function NotConnectedScreen({ title }: NotConnectedScreenProps) {
  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        </header>

        {/* Not Connected Card */}
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full">
            <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-8 dark:border-white/10 dark:bg-white/5 text-center">
              <div className="flex justify-center mb-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/50 dark:bg-white/5 dark:ring-white/10">
                  <QboLogo className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                </div>
              </div>

              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Not Connected
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                Connect to QuickBooks Online to view your {title.toLowerCase()}.
              </p>

              <Button
                onClick={handleConnect}
                className="w-full rounded-xl bg-brand-teal-600 hover:bg-brand-teal-700 dark:bg-brand-cyan dark:hover:bg-brand-cyan/90 text-white shadow-lg shadow-brand-teal-500/25 dark:shadow-brand-cyan/20"
              >
                Connect to QuickBooks
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
