'use client';

import { Button } from '@/components/ui/button';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

function QboLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none">
      {/* QBO-style green circle */}
      <circle cx="24" cy="24" r="20" className="fill-emerald-100 dark:fill-emerald-900/30" />
      <circle cx="24" cy="24" r="20" className="stroke-emerald-300 dark:stroke-emerald-700" strokeWidth="1.5" />
      {/* QB icon - stylized Q */}
      <path
        d="M24 12c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12z"
        className="stroke-emerald-500 dark:stroke-emerald-400"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M20 20h8v4a4 4 0 01-4 4h0a4 4 0 01-4-4v-4z"
        className="fill-emerald-200 stroke-emerald-500 dark:fill-emerald-800/50 dark:stroke-emerald-400"
        strokeWidth="1.5"
      />
      <path d="M24 28v6" className="stroke-emerald-500 dark:stroke-emerald-400" strokeWidth="2" strokeLinecap="round" />
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
    <div className="flex items-center justify-center py-16 md:py-24">
      <div className="max-w-md w-full px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-10 dark:border-white/10 dark:bg-white/5 text-center shadow-soft">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <QboLogo className="h-24 w-24" />
              <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 dark:border-slate-900 dark:bg-slate-800">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
            QuickBooks Online
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
            Connect to continue
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Connect your QuickBooks Online account to view and manage your {title.toLowerCase()}.
          </p>

          <div className="mt-8">
            <Button
              onClick={handleConnect}
              className="w-full rounded-xl bg-gradient-to-r from-brand-teal-500 to-brand-teal-600 hover:from-brand-teal-600 hover:to-brand-teal-700 dark:from-brand-cyan dark:to-brand-teal-400 dark:hover:from-brand-cyan/90 dark:hover:to-brand-teal-400/90 text-white shadow-lg shadow-brand-teal-500/25 dark:shadow-brand-cyan/20 transition-all duration-200"
            >
              Connect to QuickBooks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
