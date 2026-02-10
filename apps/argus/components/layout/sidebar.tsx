'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Search,
  Trophy,
  Bell,
  Download,
  Images,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const NAV_SECTIONS = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'MONITORING',
    items: [
      { label: 'Products', href: '/products', icon: Package },
      { label: 'Rankings', href: '/rankings', icon: Search },
      { label: 'Bestsellers', href: '/bestsellers', icon: Trophy },
    ],
  },
  {
    title: 'ASSETS',
    items: [
      { label: 'Image Manager', href: '/images', icon: Images },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Alerts', href: '/alerts', icon: Bell },
      { label: 'Imports', href: '/imports', icon: Download },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

  function isActive(href: string) {
    const full = basePath + href;
    if (href === '/') return pathname === full;
    return pathname.startsWith(full);
  }

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r bg-card">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Eye className="h-4 w-4" />
        </div>
        <div>
          <span className="text-sm font-semibold tracking-tight">Argus</span>
          <p className="text-2xs text-muted-foreground">Listing Monitor</p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-5 px-3">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.title && (
                <p className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t px-5 py-3">
        <p className="text-2xs text-muted-foreground">
          Argus v{process.env.NEXT_PUBLIC_VERSION ?? '0.0.0'}
        </p>
      </div>
    </aside>
  );
}
