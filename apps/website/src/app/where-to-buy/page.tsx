import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { products } from '@/content/products';
import { site } from '@/content/site';

export const metadata = {
  title: 'Where to buy'
};

export default function WhereToBuyPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Where to buy</h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            Amazon is our primary retail channel. For bulk purchasing or distribution, contact us.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-8">
              <div className="text-sm font-semibold text-ink">Amazon Store</div>
              <p className="mt-2 text-sm text-muted">
                Browse the full lineup and check out with Amazon’s shipping and returns.
              </p>
              <div className="mt-5">
                <Button asChild size="lg">
                  <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                    Visit Amazon store <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <div className="mt-3 text-xs text-muted">
                Tip: replace the placeholder Amazon URLs in <code className="rounded bg-bg px-1 py-0.5">src/content/products.ts</code>.
              </div>
            </Card>

            <Card className="p-8">
              <div className="text-sm font-semibold text-ink">Bulk / wholesale</div>
              <p className="mt-2 text-sm text-muted">
                Need bulk pricing, private label, or a distributor? Send us a note with the quantities and timeline.
              </p>
              <div className="mt-5">
                <Button asChild variant="outline" size="lg">
                  <a href={`mailto:${site.contactEmail}?subject=Bulk%20%2F%20Wholesale%20Inquiry`}>Email us</a>
                </Button>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      <section className="mt-16">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Direct product links</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted md:text-base">
            If you know what you want, jump straight to the listing.
          </p>

          <div className="mt-8 grid gap-4">
            {products.map((p) => (
              <a
                key={p.slug}
                href={p.amazonUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-4 shadow-softer transition hover:-translate-y-0.5"
              >
                <div>
                  <div className="text-base font-semibold tracking-tightish text-ink">{p.name}</div>
                  <div className="mt-1 text-sm text-muted">{p.tagline}</div>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  Buy <ArrowUpRight className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
