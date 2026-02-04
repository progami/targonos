'use client';

import { Button } from '@/components/ui/button';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

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

interface NotConnectedScreenProps {
  title: string;
}

export function NotConnectedScreen({ title }: NotConnectedScreenProps) {
  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  return (
    <div className="flex items-center justify-center py-10 md:py-14">
      <div className="max-w-md w-full px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-8 dark:border-white/10 dark:bg-white/5 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/50 dark:bg-white/5 dark:ring-white/10">
              <QboLogo className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            </div>
          </div>

          <div className="text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
            QuickBooks Online
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
            Connect to continue
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Connect to QuickBooks Online to view your {title.toLowerCase()}.
          </p>

          <div className="mt-6">
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
  );
}
