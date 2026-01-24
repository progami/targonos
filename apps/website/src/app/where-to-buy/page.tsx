import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';
import { site } from '@/content/site';

const bySlug = (slug: string) => products.find((p) => p.slug === slug)?.amazonUrl;

const internationalAmazonLinks = [
  {
    label: '6 Pack — Light (Primary)',
    url: site.amazonStoreUrl
  },
  {
    label: '12 Pack — Light (Alternate)',
    url: site.amazonStoreAltUrl
  },
  {
    label: '1 Pack — Strong (Amazon.com)',
    url: bySlug('1pk-strong') ?? '#'
  },
  {
    label: '3 Pack — Standard (Amazon.com)',
    url: bySlug('3pk-standard') ?? '#'
  },
  {
    label: '12 Pack — Light (Amazon.com)',
    url: bySlug('12pk-light') ?? '#'
  }
];

export const metadata = {
  title: 'Where to buy'
};

export default function WhereToBuyPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Where to buy.</h1>
            <div className="mt-3 h-1 w-12 rounded-full bg-accent" />
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">We sell on Amazon.</p>
          </Reveal>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal variant="media">
                <Card className="p-6">
                <div className="text-sm font-semibold text-ink">Amazon</div>
                <p className="mt-2 text-sm text-muted">Checkout stays on Amazon.</p>
                <div className="mt-5">
                  <Button asChild variant="accent">
                    <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                      Buy 6 Pack <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <div className="mt-5 text-xs text-muted">Tip: compare packs here, then buy on Amazon.</div>
                </Card>
              </Reveal>

              <Reveal variant="media" delay={120}>
                <Card className="mt-6 p-6">
                <div className="text-sm font-semibold text-ink">Bulk / wholesale</div>
                <p className="mt-2 text-sm text-muted">
                  Need larger quantities for trade, facilities, or recurring jobs?
                </p>
                <div className="mt-4">
                  <Button asChild variant="outline">
                    <a href={`mailto:${site.contactEmail}`}>Email {site.contactEmail}</a>
                  </Button>
                </div>
                </Card>
              </Reveal>
            </div>

            <div className="md:col-span-7">
              <Reveal variant="media" delay={120}>
                <Card className="overflow-hidden">
                <div className="border-b border-border bg-surface px-6 py-4">
                  <div className="text-sm font-semibold text-ink">Packs</div>
                  <div className="mt-1 text-xs text-muted">Pricing and availability are live on Amazon.</div>
                </div>

                <ul className="divide-y divide-border">
                  {products.map((p) => (
                    <li key={p.slug} className="px-6 py-5 transition-colors hover:bg-surface/50">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          {p.primary ? (
                            <div className="inline-flex items-center rounded-pill bg-accent/20 px-3 py-1 text-xs font-semibold text-ink">
                              Primary
                            </div>
                          ) : null}
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                            {p.packLabel} · {p.thicknessLabel}
                          </div>
                          <div className="mt-2 text-lg font-semibold tracking-tightish text-ink">
                            {p.name}
                          </div>
                          <div className="mt-1 text-sm text-muted">{p.tagline}</div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button asChild variant={p.primary ? 'accent' : 'outline'} size="sm">
                            <a href={p.amazonUrl} target="_blank" rel="noreferrer">
                              Buy on Amazon <ArrowUpRight className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <Link className="text-sm font-semibold text-ink hover:underline" href={`/products/${p.slug}`}>
                          View details
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                </Card>
              </Reveal>

              <Reveal variant="media" delay={220}>
                <Card className="mt-6 p-6">
                <div className="text-sm font-semibold text-ink">International Amazon links</div>
                <p className="mt-2 text-sm text-muted">Direct links by pack.</p>
                <ul className="mt-4 space-y-2">
                  {internationalAmazonLinks.map((l) => (
                    <li key={l.url}>
                      <a className="text-sm font-semibold text-ink hover:underline" href={l.url} target="_blank" rel="noreferrer">
                        {l.label} <ArrowUpRight className="inline h-4 w-4" />
                      </a>
                    </li>
                  ))}
                </ul>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
