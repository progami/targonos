import Link from 'next/link';
import { ArrowRight, Ruler, Recycle } from 'lucide-react';
import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';
import { site } from '@/content/site';

export const metadata = {
  title: 'Packs'
};

export default function ProductsPage() {
  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="pg-hero relative overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="pb-16 pt-14 md:pb-24 md:pt-20">
            <Reveal>
              <p className="cs-overline text-accent">Our Range</p>
              <h1 className="mt-3 text-balance text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                Dust Sheet Packs.
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-4 max-w-md text-base text-white/50 md:text-lg">
                Pick your coverage. Available at select retailers.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent">
                  <Link href="/where-to-buy">Where to buy</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
                >
                  <Link href="/caelum-star">About Caelum Star</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>

      {/* ─── PRODUCT GRID ─── */}
      <section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p, i) => (
              <Reveal key={p.slug} variant="media" delay={i * 60}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
          <Reveal delay={280}>
            <p className="mt-4 text-center text-xs text-muted">
              Prices shown are RRP. Actual prices may vary by retailer.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* ─── INFO STRIP ─── Dark section */}
      <section className="cs-dark-section--navy py-16 md:py-20">
        <Container className="relative z-10">
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <span className="flex items-center gap-2.5 text-sm text-white/70">
                  <Ruler className="h-4 w-4 text-accent" />
                  All sheets: 12ft × 9ft (3.6m × 2.7m)
                </span>
                <span className="flex items-center gap-2.5 text-sm text-white/70">
                  <Recycle className="h-4 w-4 text-accent" />
                  55% recycled plastic (GRS certified)
                </span>
              </div>
              <Link
                href="/where-to-buy"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition hover:text-white"
              >
                Where to buy <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── SUPPORT CTA ─── */}
      <section className="py-10 pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-[28px] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Not sure which pack to get?
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Email{' '}
                    <a
                      className="text-white/80 underline decoration-white/20 underline-offset-2 transition hover:text-white hover:decoration-white/50"
                      href={`mailto:${site.contactEmail}`}
                    >
                      {site.contactEmail}
                    </a>
                    .
                  </p>
                </div>
                <div className="md:col-span-4 md:flex md:justify-end">
                  <Button asChild variant="accent" size="lg">
                    <Link href="/support">
                      Get support <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
