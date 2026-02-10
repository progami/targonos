'use client';

import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/rankings': 'Rankings',
  '/bestsellers': 'Bestsellers',
  '/images': 'Image Manager',
  '/alerts': 'Alerts',
  '/imports': 'Imports',
};

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

  const stripped = pathname.replace(basePath, '') || '/';
  const segments = stripped.split('/').filter(Boolean);

  let breadcrumb = 'Dashboard';
  if (segments.length > 0) {
    const firstSegment = '/' + segments[0];
    breadcrumb = ROUTE_LABELS[firstSegment] ?? segments[0];
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{breadcrumb}</span>
        {segments.length > 1 && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{segments.slice(1).join(' / ')}</span>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="h-9 w-9"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  );
}
