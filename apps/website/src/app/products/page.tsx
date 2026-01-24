import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { ScrollableTable } from '@/components/ScrollableTable';
import { products } from '@/content/products';
import { site } from '@/content/site';

export const metadata = {
  title: 'Packs'
};

export default function ProductsPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Packs.</h1>
            <div className="mt-3 h-1 w-12 rounded-full bg-accent" />
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">Pick a size. Buy on Amazon.</p>
          </Reveal>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((p, i) => (
              <Reveal key={p.slug} variant="media" delay={i * 80}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="mt-16 md:mt-20">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <Reveal>
                <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Compare</h2>
              </Reveal>
              <Reveal delay={100}>
                <p className="mt-3 text-sm text-muted">
                  Quick view of the differences. Pricing and availability are always live on Amazon.
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link href="/where-to-buy">Where to buy</Link>
                  </Button>
                  <Button asChild variant="accent">
                    <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                      View on Amazon <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </Reveal>
            </div>

            <div className="md:col-span-8">
              <Reveal variant="media" delay={120}>
                <Card className="overflow-hidden">
                  <ScrollableTable>
                    <table className="min-w-[720px] w-full text-left">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr className="border-b border-border">
                        <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          Pack
                        </th>
                        <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          Thickness
                        </th>
                        <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          Coverage
                        </th>
                        <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                          Price
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.slug} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface/50">
                          <td className="px-5 py-4">
                            <div className="text-sm font-semibold text-ink">{p.name}</div>
                            <div className="mt-1 text-xs text-muted">{p.packLabel}</div>
                          </td>
                          <td className="px-5 py-4 text-sm text-ink">{p.thicknessLabel}</td>
                          <td className="px-5 py-4 text-sm text-muted">
                            {p.coverageLabel ? p.coverageLabel : '—'}
                            <div className="mt-1 text-xs text-muted">
                              {p.primary
                                ? 'Recommended for most homes'
                                : p.slug.startsWith('12pk')
                                ? 'Multi‑room jobs'
                                : p.slug.startsWith('3pk')
                                ? 'Everyday prep'
                                : 'Quick protection'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-ink">{p.price ?? 'See Amazon'}</td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </ScrollableTable>
                </Card>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-3 text-xs text-muted">
                  Sheet size is the same across packs: 3.6m × 2.7m (12ft × 9ft) each.
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
