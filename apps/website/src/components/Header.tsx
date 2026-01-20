'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { site } from '@/content/site';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';

const navLinks = [
  { label: 'Packs', href: '/products' },
  { label: 'Where to buy', href: '/where-to-buy' },
  { label: 'Support', href: '/support' },
  { label: 'About', href: '/about' }
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tightish">
          <Image src="/brand/logo.svg" alt={`${site.name} logo`} width={32} height={32} priority />
          <span className="hidden text-sm text-ink sm:inline">{site.name}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'text-sm font-semibold text-muted transition hover:text-ink',
                  active && 'text-ink'
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="accent" className="hidden sm:inline-flex">
            <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
              Buy 6 Pack <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="sm" className="sm:hidden">
            <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
              Buy <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-surface text-ink shadow-softer transition hover:bg-bg md:hidden',
              mobileOpen && 'bg-bg'
            )}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </Container>

      {mobileOpen ? (
        <div className="border-t border-border bg-bg/95 backdrop-blur md:hidden">
          <Container className="py-4">
            <div className="grid gap-2">
              {navLinks.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      'rounded-pill px-4 py-3 text-sm font-semibold text-muted hover:bg-surface hover:text-ink',
                      active && 'bg-surface text-ink'
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
