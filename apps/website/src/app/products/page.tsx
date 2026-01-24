import Link from 'next/link';
import { Ruler, Recycle } from 'lucide-react';
import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';

export const metadata = {
  title: 'Packs'
};

export default function ProductsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-5xl">Dust Sheet Packs</h1>
            <div className="mt-3 h-1 w-12 rounded-full bg-accent" />
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-md text-base text-muted">
              Pick your coverage. Available at select retailers.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* Product Grid */}
      <section className="mt-10 md:mt-14">
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

      {/* Info Strip */}
      <section className="mt-12 md:mt-16">
        <Container>
          <Reveal>
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
                <span className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-accent" />
                  All sheets: 12ft × 9ft (3.6m × 2.7m)
                </span>
                <span className="flex items-center gap-2">
                  <Recycle className="h-4 w-4 text-accent" />
                  55% recycled plastic (GRS certified)
                </span>
              </div>
              <Link
                href="/where-to-buy"
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Where to buy
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
