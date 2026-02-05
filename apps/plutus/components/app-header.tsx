'use client';

import { Suspense, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, BarChart3, Boxes, ChevronDown, ListChecks, ReceiptText, Settings as SettingsIcon } from 'lucide-react';
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
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
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
    items: [{ href: '/bills', label: 'Bills' }],
  },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-teal-500 text-white shadow-sm dark:bg-brand-cyan dark:text-slate-900">
              <LogoIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-[0.14em] text-slate-900 dark:text-white">
              PLUTUS
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {NAV_ITEMS.map((item) => {
              if ('href' in item) {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-slate-50 text-brand-navy-700 dark:bg-white/5 dark:text-brand-cyan'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 text-slate-400 transition-colors',
                        isActive
                          ? 'text-brand-navy-500 dark:text-brand-cyan'
                          : 'group-hover:text-slate-500 dark:group-hover:text-slate-200',
                      )}
                    />
                    <span>{item.label}</span>
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
                        'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        anyActive
                          ? 'bg-slate-50 text-brand-navy-700 dark:bg-white/5 dark:text-brand-cyan'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 text-slate-400 transition-colors',
                          anyActive
                            ? 'text-brand-navy-500 dark:text-brand-cyan'
                            : 'group-hover:text-slate-500 dark:group-hover:text-slate-200',
                        )}
                      />
                      <span>{item.label}</span>
                      <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
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
        </div>
      </div>
    </header>
  );
}
