import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';
import { site } from '@/content/site';

const bySlug = (slug: string) => products.find((p) => p.slug === slug)?.amazonUrl;

const rawInternationalAmazonLinks = [
  { label: '6 Pack — Light (Primary)', url: site.amazonStoreUrl },
  // Keep a dedicated 12 pack entry; only include the "alternate" link if it differs.
  { label: '12 Pack — Light', url: bySlug('12pk-light') ?? site.amazonStoreAltUrl ?? '#' },
  { label: '1 Pack — Strong', url: bySlug('1pk-strong') ?? '#' },
  { label: '3 Pack — Standard', url: bySlug('3pk-standard') ?? '#' },
  site.amazonStoreAltUrl && site.amazonStoreAltUrl !== (bySlug('12pk-light') ?? '')
    ? { label: '12 Pack — Light (Alternate)', url: site.amazonStoreAltUrl }
    : null
].filter(Boolean) as { label: string; url: string }[];

// De-duplicate by URL to avoid React key collisions and repeated links.
const internationalAmazonLinks = Array.from(
  new Map(rawInternationalAmazonLinks.map((l) => [l.url, l])).values()
);

export const metadata = {
  title: 'Where to buy'
};

export default function WhereToBuyPage() {
  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="pg-hero relative overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="pb-16 pt-14 md:pb-24 md:pt-20">
            <Reveal>
              <p className="cs-overline text-accent">Purchase</p>
              <h1 className="mt-3 text-balance text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                Where to buy.
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-4 max-w-md text-base text-white/50 md:text-lg">
                We sell on Amazon. Compare packs here, buy there.
              </p>
            </Reveal>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>

      {/* ─── CONTENT ─── */}
      <section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal variant="media">
                <Card className="p-6">
                  <div className="text-sm font-semibold text-ink">Amazon</div>
                  <p className="mt-2 text-sm text-muted">Official retailer. Fast shipping available.</p>
                  <div className="mt-5">
                    <Button asChild variant="accent">
                      <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                        Buy 6 Pack <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <div className="mt-5 text-xs text-muted">Compare packs on this site, then purchase on Amazon.</div>
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
                          <Link className="text-sm font-semibold text-ink hover:underline" href={`/caelum-star/products/${p.slug}`}>
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
                      <li key={`${l.label}-${l.url}`}>
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

      {/* ─── CTA ─── */}
      <section className="pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-[28px] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Need help choosing a pack?
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Compare all options or reach out to our support team.
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
