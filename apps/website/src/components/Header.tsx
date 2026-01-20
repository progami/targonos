import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { site } from '@/content/site';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

const navLinks: Array<{ href: string; label: string }> = [
  { href: '/products', label: 'Products' },
  { href: '/about', label: 'About' },
  { href: '/support', label: 'Support' },
  { href: '/where-to-buy', label: 'Where to buy' }
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label={`${site.name} home`}>
          <Image src="/brand/logo.svg" alt={site.name} width={124} height={32} priority />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-ink/80 md:flex">
          {navLinks.slice(0, 3).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="outline" size="sm">
            <Link href="/where-to-buy">Where to buy</Link>
          </Button>

          <Button asChild variant="primary" size="sm">
            <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
              Buy on Amazon <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Mobile */}
        <details className="relative md:hidden">
          <summary
            className={cn(
              'list-none rounded-pill p-2 transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              '[&::-webkit-details-marker]:hidden'
            )}
            aria-label="Open menu"
          >
            <span className="inline-flex items-center justify-center">
              <Menu className="h-5 w-5 text-ink" />
              <X className="hidden h-5 w-5 text-ink" />
            </span>
          </summary>

          <div className="absolute right-0 mt-3 w-[min(320px,calc(100vw-2rem))] rounded-card border border-border bg-surface p-3 shadow-soft">
            <div className="flex flex-col gap-1">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-pill px-3 py-2 text-sm font-semibold text-ink hover:bg-bg"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button asChild variant="accent">
                <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                  Buy on Amazon <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </details>
      </Container>

      {/* tiny script-free toggle: swap icons when open */}
      <style>{`
        details[open] summary .lucide-menu { display: none; }
        details[open] summary .lucide-x { display: block; }
      `}</style>
    </header>
  );
}
