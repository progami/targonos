'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { site } from '@/content/site';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';

const navLinks = [
  { label: 'Packs', href: '/cs/us/packs' },
  { label: 'Where to buy', href: '/cs/us/where-to-buy' },
  { label: 'Support', href: '/cs/us/support' },
  { label: 'About', href: '/cs/us/about' }
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Subtle nav polish: add a soft shadow when the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-white/10 bg-[#002C51] transition-shadow',
        scrolled ? 'shadow-[0_1px_0_rgba(0,0,0,0.55)]' : null
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label={site.name}
          className="flex items-center gap-3 font-semibold tracking-tightish"
        >
          <Image
            src="/brand/logo-inverted.svg"
            alt=""
            width={160}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'relative rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-200',
                  'text-white/70 hover:text-white hover:bg-white/10',
                  active && 'text-white bg-white/15'
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="accent">
            <Link href="/cs">
              Caelum Star
            </Link>
          </Button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-pill border border-white/15 bg-black/20 text-white shadow-softer transition hover:bg-black/30 md:hidden',
              mobileOpen ? 'bg-black/30' : null
            )}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </Container>

      {mobileOpen ? (
        <div
          className="md:hidden motion-safe:animate-slide-down-fade border-t border-white/10 bg-black/85 backdrop-blur"
        >
          <Container className="py-4">
            <div className="grid gap-2">
              {navLinks.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      'rounded-pill px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white',
                      active ? 'bg-white/5 text-white' : null
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
