'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Database, Menu, Sparkles } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/sources', label: 'Data Sources', icon: Database },
  { href: '/models', label: 'Models', icon: Sparkles },
  { href: '/forecasts', label: 'Forecasts', icon: BarChart3 },
] as const;

const APP_VERSION = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0';

export function KairosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-[#0b3a52] dark:bg-[#041324]/95">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link
              href="/forecasts"
              className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-dark shadow-md">
                <span className="text-lg font-bold text-white">K</span>
              </div>
              <span className="hidden text-lg font-semibold text-slate-900 dark:text-white sm:block">
                Kairos
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      active
                        ? 'text-brand-teal-600 dark:text-brand-cyan'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 transition-colors',
                        active
                          ? 'text-brand-teal-500 dark:text-brand-cyan'
                          : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
                      )}
                      aria-hidden
                    />
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded-full bg-brand-teal-500 dark:bg-brand-cyan" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            <ThemeToggle />

            {/* Targon branding - RIGHT */}
            <svg viewBox="0 0 128 128" width="24" height="24" aria-label="Targon" className="shrink-0">
              <rect x="0" y="0" width="128" height="128" rx="21" fill="#00C2B9" />
            </svg>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {NAV_ITEMS.map((item, index) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2',
                          (pathname === item.href || pathname?.startsWith(`${item.href}/`)) &&
                            'text-brand-teal-600 dark:text-brand-cyan',
                        )}
                      >
                        <item.icon className="h-4 w-4" aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <div className="text-xs text-muted-foreground">Kairos v{APP_VERSION}</div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
