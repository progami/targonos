'use client';

import Link from 'next/link';
import { ReactNode, Suspense, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  DocumentIcon,
  CalendarIcon,
  CalendarDaysIcon,
  MenuIcon,
  XIcon,
  ClipboardDocumentCheckIcon,
  BellIcon,
  ExclamationTriangleIcon,
  OrgChartIcon,
  UsersIcon,
  LockClosedIcon,
  FolderIcon,
  BriefcaseIcon,
} from '@/components/ui/Icons';
import { Button } from '@/components/ui/button';
import { NavigationHistoryProvider } from '@/lib/navigation-history';
import { CommandPalette } from '@/components/search/CommandPalette';
import { RouteLoadingIndicator } from '@/components/ui/RouteLoadingIndicator';
import { cn } from '@/lib/utils';
import { useMeStore } from '@/lib/store/me';
import { useUIStore } from '@/lib/store/ui';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requireSuperAdmin?: boolean;
  requireHR?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
  requireSuperAdmin?: boolean;
  requireHR?: boolean;
}

const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function TargonWordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <img
        src={`${assetBasePath}/brand/logo.svg`}
        alt="Targon"
        className="h-6 w-auto dark:hidden"
      />
      <img
        src={`${assetBasePath}/brand/logo-inverted.svg`}
        alt="Targon"
        className="hidden h-6 w-auto dark:block"
      />
    </div>
  );
}

const navigation: NavSection[] = [
  {
    title: 'Home',
    items: [
      { name: 'My Hub', href: '/hub', icon: HomeIcon },
    ],
  },
  {
    title: 'Company',
    items: [
      { name: 'Org Chart', href: '/organogram', icon: OrgChartIcon },
      { name: 'Calendar', href: '/calendar', icon: CalendarIcon },
      { name: 'Policies', href: '/policies', icon: DocumentIcon },
      { name: 'Passwords', href: '/passwords', icon: LockClosedIcon },
      { name: 'Contractors', href: '/contractors', icon: BriefcaseIcon },
    ],
  },
  {
    title: 'Management',
    items: [
      { name: 'Employees', href: '/employees', icon: UsersIcon },
      { name: 'Leaves', href: '/leave', icon: CalendarDaysIcon },
      { name: 'Reviews', href: '/performance/reviews', icon: ClipboardDocumentCheckIcon },
      { name: 'Violations', href: '/performance/violations', icon: ExclamationTriangleIcon },
    ],
  },
  {
    title: 'Admin',
    requireSuperAdmin: true,
    items: [
      { name: 'Access Management', href: '/admin/access', icon: LockClosedIcon, requireSuperAdmin: true },
    ],
  },
];

function Sidebar({
  onClose,
  isSuperAdmin,
  isHR,
}: {
  onClose?: () => void;
  isSuperAdmin: boolean;
  isHR: boolean;
}) {
  const pathname = usePathname();

  const matchesPath = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  const canSeeHR = isSuperAdmin || isHR;

  // Filter navigation based on permissions
  const filteredNavigation = navigation
    .filter((section) => !section.requireSuperAdmin || isSuperAdmin)
    .filter((section) => !section.requireHR || canSeeHR)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.requireSuperAdmin && !isSuperAdmin) return false;
        if (item.requireHR && !canSeeHR) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-border bg-card px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center justify-between">
        {/* App branding - LEFT */}
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md">
            <span className="text-sm font-bold text-primary-foreground">AT</span>
          </div>
          <span className="text-lg font-semibold text-foreground">Atlas</span>
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
            <XIcon className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}
      </div>

      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-6">
          {filteredNavigation.map((section, sectionIdx) => (
            <li key={sectionIdx}>
              {section.title && (
                <div className="px-3 pb-2 text-xs font-semibold text-accent uppercase tracking-wider">
                  {section.title}
                </div>
              )}
              <ul role="list" className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        matchesPath(item.href)
                          ? 'bg-accent/10 text-accent border-l-4 border-accent -ml-px'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                        'group flex gap-x-3 rounded-lg py-3 px-3 text-sm font-medium transition-colors',
                      )}
                    >
                      <item.icon
                        className={cn(
                          matchesPath(item.href)
                            ? 'text-accent'
                            : 'text-muted-foreground group-hover:text-foreground',
                          'h-5 w-5 shrink-0 transition-colors',
                        )}
                      />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function MobileNav({
  isOpen,
  onClose,
  isSuperAdmin,
  isHR,
}: {
  isOpen: boolean;
  onClose: () => void;
  isSuperAdmin: boolean;
  isHR: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="relative z-50 md:hidden">
      <div className="fixed inset-0 bg-foreground/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 flex">
        <div className="relative mr-16 flex w-full max-w-xs flex-1">
          <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <XIcon className="h-6 w-6 text-primary-foreground" />
            </Button>
          </div>
          <Sidebar onClose={onClose} isSuperAdmin={isSuperAdmin} isHR={isHR} />
        </div>
      </div>
    </div>
  );
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();

  const getCurrentPageName = () => {
    for (const section of navigation) {
      for (const item of section.items) {
        if (item.href === '/') {
          if (pathname === '/' || pathname === '') return item.name;
        } else if (pathname.startsWith(item.href)) {
          return item.name;
        }
      }
    }
    return 'Work Queue';
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-x-4 bg-card px-4 py-4 border-b border-border sm:px-6 md:hidden">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="-m-2">
        <MenuIcon className="h-6 w-6" />
      </Button>
      <div className="flex-1 text-base font-semibold text-foreground">{getCurrentPageName()}</div>
      {/* Targon branding - RIGHT */}
      <TargonWordmark className="shrink-0" />
    </div>
  );
}

export default function ATLASLayout({ children }: { children: ReactNode }) {
  const mobileMenuOpen = useUIStore((s) => s.mobileMenuOpen);
  const openMobileMenu = useUIStore((s) => s.openMobileMenu);
  const closeMobileMenu = useUIStore((s) => s.closeMobileMenu);

  const me = useMeStore((s) => s.me);
  const refreshMe = useMeStore((s) => s.refresh);
  const isSuperAdmin = Boolean(me?.isSuperAdmin);
  const isHR = Boolean(me?.isHR);

  const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0';
  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL || undefined;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || undefined;
  const commitUrl = commitSha
    ? `https://github.com/progami/targonos/commit/${commitSha}`
    : undefined;
  const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`;
  const versionHref = explicitReleaseUrl ?? commitUrl ?? inferredReleaseUrl;

  const pathname = usePathname();
  useEffect(() => {
    closeMobileMenu();
  }, [closeMobileMenu, pathname]);

  const fetchUserPermissions = useCallback(async () => {
    try {
      await refreshMe();
    } catch {
      // Ignore errors, default to non-admin
    }
  }, [refreshMe]);

  // Fetch current user permissions for navigation; refresh when roles change.
  useEffect(() => {
    fetchUserPermissions();

    const handleFocus = () => fetchUserPermissions();
    const handleMeUpdated = () => fetchUserPermissions();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('atlas:me-updated', handleMeUpdated);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('atlas:me-updated', handleMeUpdated);
    };
  }, [fetchUserPermissions]);

  return (
    <NavigationHistoryProvider>
      <Suspense fallback={null}>
        <RouteLoadingIndicator />
      </Suspense>

      {/* Desktop Targon wordmark - TOP RIGHT */}
      <div className="hidden md:block md:fixed md:top-4 md:right-4 md:z-50">
        <TargonWordmark className="shrink-0" />
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:z-50 md:flex md:w-64 md:flex-col">
        <Sidebar isSuperAdmin={isSuperAdmin} isHR={isHR} />
      </div>

      {/* Mobile Nav */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        isSuperAdmin={isSuperAdmin}
        isHR={isHR}
      />

      {/* Main Content */}
      <div className="md:pl-64 min-h-screen flex flex-col bg-background">
        <Header onMenuClick={openMobileMenu} />

        <main className="flex-1">
          <div
            key={pathname}
            className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            {children}
          </div>
        </main>

        <footer className="border-t border-border bg-card mt-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-xs text-muted-foreground text-center">
              Atlas{' '}
              <a
                href={versionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                v{version}
              </a>
            </p>
          </div>
        </footer>
      </div>

      <CommandPalette />
    </NavigationHistoryProvider>
  );
}
