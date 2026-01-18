'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeatureCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: 'teal' | 'amber' | 'violet';
}

function FeatureCard({ href, icon, title, description, accentColor }: FeatureCardProps) {
  const colorClasses = {
    teal: {
      iconBg: 'bg-brand-teal-500/10 dark:bg-brand-cyan/10',
      iconRing: 'ring-brand-teal-500/20 dark:ring-brand-cyan/20',
      hoverBorder: 'hover:border-brand-teal-500/40 dark:hover:border-brand-cyan/40',
      icon: 'text-brand-teal-600 dark:text-brand-cyan',
      line: 'bg-gradient-to-r from-brand-teal-500 to-brand-teal-400 dark:from-brand-cyan dark:to-brand-teal-400',
    },
    amber: {
      iconBg: 'bg-amber-500/10 dark:bg-amber-400/10',
      iconRing: 'ring-amber-500/20 dark:ring-amber-400/20',
      hoverBorder: 'hover:border-amber-500/40 dark:hover:border-amber-400/40',
      icon: 'text-amber-600 dark:text-amber-400',
      line: 'bg-gradient-to-r from-amber-500 to-amber-400',
    },
    violet: {
      iconBg: 'bg-violet-500/10 dark:bg-violet-400/10',
      iconRing: 'ring-violet-500/20 dark:ring-violet-400/20',
      hoverBorder: 'hover:border-violet-500/40 dark:hover:border-violet-400/40',
      icon: 'text-violet-600 dark:text-violet-400',
      line: 'bg-gradient-to-r from-violet-500 to-violet-400',
    },
  };

  const colors = colorClasses[accentColor];

  return (
    <Link href={href} className="block group">
      <Card className={cn(
        'relative overflow-hidden border-slate-200/60 bg-white/60 backdrop-blur-sm transition-all duration-300',
        'dark:border-white/10 dark:bg-white/5',
        'hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20',
        'hover:-translate-y-0.5',
        colors.hoverBorder
      )}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={cn(
              'flex h-11 w-11 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-xl',
              'ring-1 transition-transform duration-300 group-hover:scale-105',
              colors.iconBg,
              colors.iconRing
            )}>
              <div className={colors.icon}>{icon}</div>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white tracking-tight mb-1">
                {title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                {description}
              </p>
            </div>
            <div className="flex-shrink-0 pt-1 text-slate-300 dark:text-slate-600 transition-all duration-300 group-hover:text-slate-400 dark:group-hover:text-slate-400 group-hover:translate-x-0.5">
              <ArrowIcon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
        {/* Bottom accent line */}
        <div className={cn(
          'absolute inset-x-0 bottom-0 h-[2px] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left',
          colors.line
        )} />
      </Card>
    </Link>
  );
}

function ComingSoonCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-slate-200/40 bg-slate-50/50 dark:border-white/5 dark:bg-white/[0.02] opacity-70">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100/50 dark:bg-white/5 ring-1 ring-slate-200/50 dark:ring-white/5">
            <div className="text-slate-400 dark:text-slate-500">{icon}</div>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-slate-400 dark:text-slate-500 tracking-tight">
                {title}
              </h3>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider bg-slate-200/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 border-0">
                Soon
              </Badge>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed line-clamp-2">
              {description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function TransactionsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-6 w-6', className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}

function ReconcileIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-6 w-6', className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AccountsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-6 w-6', className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-6 w-6', className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-6 w-6', className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="relative flex-1 flex flex-col">
      {/* Background layers */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-[#0a1628] dark:via-[#0d1d32] dark:to-[#0a1628]" />

      {/* Decorative gradient orbs - hidden on mobile for cleaner look */}
      <div className="fixed top-[-20%] right-[-10%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full bg-gradient-to-br from-brand-teal-500/8 to-transparent blur-3xl dark:from-brand-cyan/5 pointer-events-none" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full bg-gradient-to-tr from-violet-500/8 to-transparent blur-3xl dark:from-violet-500/5 pointer-events-none" />

      {/* Content wrapper - flex-1 to fill available space */}
      <div className="relative flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <p className="text-base sm:text-lg lg:text-xl text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed px-2">
            <span className="font-medium text-slate-800 dark:text-slate-200">Custom financials</span> from QuickBooks Online.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            SOP compliance & reports QBO can&apos;t generate.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="flex-1">
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              href="/transactions"
              icon={<TransactionsIcon />}
              title="Transactions"
              description="View purchases, check SOP compliance, and update Reference/Memo fields."
              accentColor="teal"
            />

            <FeatureCard
              href="/reconcile"
              icon={<ReconcileIcon />}
              title="Reconciliation"
              description="Bulk apply SOPs to transactions. Enter memos and references at scale."
              accentColor="teal"
            />

            <FeatureCard
              href="/chart-of-accounts"
              icon={<AccountsIcon />}
              title="Chart of Accounts"
              description="View account hierarchies from QuickBooks, grouped by type like QBO."
              accentColor="amber"
            />

            <FeatureCard
              href="/setup"
              icon={<TerminalIcon />}
              title="Setup Wizard"
              description="Configure Plutus with QuickBooks and Link My Books integration."
              accentColor="violet"
            />

            <FeatureCard
              href="/bills"
              icon={<ReportsIcon />}
              title="Bills"
              description="PO memo guide + bill compliance scanner for bulk backfills."
              accentColor="amber"
            />

            <ComingSoonCard
              icon={<ReportsIcon />}
              title="Custom Reports"
              description="Generate P&L, balance sheets, and cash flow reports with custom structure."
            />
          </div>
        </div>

        {/* Footer - will stay at bottom due to flex layout */}
        <footer className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-200/60 dark:border-white/5">
          <p className="text-center text-xs sm:text-sm text-slate-400 dark:text-slate-500">
            Part of the{' '}
            <Link
              href="/"
              className="text-brand-teal-600 dark:text-brand-cyan hover:underline underline-offset-2 transition-colors font-medium"
            >
              Targonos
            </Link>
            {' '}suite
          </p>
        </footer>
      </div>
    </main>
  );
}
