'use client';

import { Suspense, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChevronDown,
  ListChecks,
  Menu,
  ReceiptText,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { QboStatusIndicator } from '@/components/qbo-status-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      {/* Coin outer ring */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {/* P letterform */}
      <path
        d="M10 7v10M10 7h3a3.5 3.5 0 010 7h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Subtle shine */}
      <path
        d="M6 6l1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

function QboStatusFallback() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
      <span className="text-sm text-slate-500 dark:text-slate-400">QuickBooks</span>
    </div>
  );
}

type NavItem =
  | {
      href: string;
      label: string;
      icon: ComponentType<{ className?: string }>;
    }
  | {
      label: string;
      icon: ComponentType<{ className?: string }>;
      items: Array<{ href: string; label: string }>;
    };

const NAV_ITEMS: NavItem[] = [
  { href: '/settlements', label: 'Settlements', icon: ReceiptText },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  {
    label: 'Accounts & Taxes',
    icon: ListChecks,
    items: [
      { href: '/setup', label: 'Setup Wizard' },
      { href: '/chart-of-accounts', label: 'Chart of Accounts' },
    ],
  },
  {
    label: 'Inventory',
    icon: Boxes,
    items: [
      { href: '/audit-data', label: 'Audit Data' },
      { href: '/bills', label: 'Bills' },
    ],
  },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-teal-500 to-brand-teal-600 text-white shadow-sm shadow-brand-teal-500/25 dark:from-brand-cyan dark:to-brand-teal-400 dark:text-slate-900 dark:shadow-brand-cyan/20">
              <LogoIcon className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold tracking-[0.16em] text-slate-900 dark:text-white">
              PLUTUS
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV_ITEMS.map((item) => {
              if ('href' in item) {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'text-brand-teal-700 dark:text-brand-cyan'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-colors duration-150',
                        isActive
                          ? 'text-brand-teal-600 dark:text-brand-cyan'
                          : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                      )}
                    />
                    <span>{item.label}</span>
                    {/* Active bottom indicator */}
                    {isActive && (
                      <span className="absolute -bottom-[13px] left-3 right-3 h-[2px] rounded-full bg-brand-teal-500 dark:bg-brand-cyan" />
                    )}
                  </Link>
                );
              }

              const Icon = item.icon;
              const anyActive = item.items.some(
                (submenu) => pathname === submenu.href || pathname.startsWith(`${submenu.href}/`),
              );

              return (
                <DropdownMenu key={item.label}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        anyActive
                          ? 'text-brand-teal-700 dark:text-brand-cyan'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 transition-colors duration-150',
                          anyActive
                            ? 'text-brand-teal-600 dark:text-brand-cyan'
                            : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                        )}
                      />
                      <span>{item.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                      {anyActive && (
                        <span className="absolute -bottom-[13px] left-3 right-3 h-[2px] rounded-full bg-brand-teal-500 dark:bg-brand-cyan" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[220px]">
                    {item.items.map((submenu) => (
                      <DropdownMenuItem key={submenu.href} asChild>
                        <Link href={submenu.href}>{submenu.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Suspense fallback={<QboStatusFallback />}>
            <QboStatusIndicator />
          </Suspense>
          <ThemeToggle />

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Bottom gradient border */}
      <div className="h-px bg-gradient-to-r from-transparent via-brand-teal-400/30 to-transparent dark:via-brand-cyan/20" />

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <nav className="border-t border-slate-200/50 bg-white/98 backdrop-blur-md dark:border-white/5 dark:bg-slate-950/98 md:hidden">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-3 sm:px-6">
            {NAV_ITEMS.map((item) => {
              if ('href' in item) {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-950/30 dark:text-brand-cyan'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', isActive ? 'text-brand-teal-600 dark:text-brand-cyan' : 'text-slate-400')} />
                    {item.label}
                  </Link>
                );
              }

              return (
                <div key={item.label}>
                  <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {item.label}
                  </div>
                  {item.items.map((submenu) => {
                    const isActive = pathname === submenu.href || pathname.startsWith(`${submenu.href}/`);
                    return (
                      <Link
                        key={submenu.href}
                        href={submenu.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 pl-7 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-950/30 dark:text-brand-cyan'
                            : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5',
                        )}
                      >
                        {submenu.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
