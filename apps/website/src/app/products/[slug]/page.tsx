import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Check, Shield, Sparkles } from 'lucide-react';

import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Reveal } from '@/components/Reveal';
import { ProductGallery } from '@/components/ProductGallery';
import { Breadcrumb } from '@/components/Breadcrumb';
import { getProductBySlug, getProductSlugs, products } from '@/content/products';
import { site } from '@/content/site';
import { cn } from '@/lib/utils';

type PageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return getProductSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const p = getProductBySlug(params.slug);
  if (!p) return { title: 'Product not found' };

  const title = `${p.name} — ${site.productBrandName}`;
  const description = p.description;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: p.image.src }]
    }
  };
}

function SpecRow({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <div className={cn(
      "flex items-start justify-between gap-6 border-b border-border py-4 pl-4 -ml-4 border-l-2",
      index % 2 === 0 ? "border-l-accent/50" : "border-l-transparent"
    )}>
      <div className="text-sm font-semibold text-ink">{label}</div>
      <div className="text-sm text-muted text-right">{value}</div>
    </div>
  );
}

export default function ProductDetailPage({ params }: PageProps) {
  const p = getProductBySlug(params.slug);
  if (!p) return notFound();

  const primary = products.find((x) => x.primary)!;

  return (
    <div>
      {/* Hero */}
      <section className="pt-12 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-12 md:items-center">
            <div className="md:col-span-6">
              <Breadcrumb
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Products', href: '/products' },
                  { label: p.name }
                ]}
              />
              <Reveal>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-surface">{site.productBrandName}</Badge>
                  <Badge className="bg-surface">
                    {p.packLabel} · {p.thicknessLabel}
                  </Badge>
                  {p.primary ? (
                    <Badge className="border-accent/40 bg-accent/10">Primary</Badge>
                  ) : null}
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mt-5 text-4xl font-semibold tracking-tightish md:text-6xl">{p.name}</h1>
              </Reveal>

              <Reveal delay={150}>
                <p className="mt-4 max-w-xl text-base text-muted md:text-lg">{p.tagline}</p>
              </Reveal>

              <Reveal delay={220}>
                <p className="mt-4 max-w-xl text-sm text-muted">{p.description}</p>
              </Reveal>

              <Reveal delay={300}>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button asChild variant="accent">
                    <a href={p.amazonUrl} target="_blank" rel="noreferrer">
                      Buy on Amazon <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/products">Compare packs</Link>
                  </Button>
                </div>
              </Reveal>

              {p.amazonAltUrl ? (
                <Reveal delay={360}>
                  <div className="mt-3 text-xs text-muted">
                    Also available on{' '}
                    <a
                      className="font-semibold text-ink hover:underline"
                      href={p.amazonAltUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.amazonAltLabel}
                    </a>
                    .
                  </div>
                </Reveal>
              ) : null}

              <Reveal delay={420}>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {p.price ? (
                    <div className="inline-flex items-baseline gap-1 rounded-pill bg-accent/10 px-4 py-2">
                      <span className="text-sm text-ink">From</span>
                      <span className="text-xl font-bold tracking-tight text-ink">{p.price}</span>
                      <span className="text-xs text-muted">(on Amazon)</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center rounded-pill bg-surface px-4 py-2 text-sm font-semibold text-ink">
                      Price and availability on Amazon
                    </div>
                  )}
                  {p.coverageLabel ? (
                    <div className="text-sm text-muted">{p.coverageLabel} total coverage</div>
                  ) : null}
                </div>
              </Reveal>
            </div>

            <div className="md:col-span-6">
              <Reveal variant="media" delay={140}>
                <Card className="overflow-hidden">
                  <div className="relative aspect-[4/3] bg-white">
                    <Image
                      src={p.image.src}
                      alt={p.image.alt}
                      fill
                      className="object-contain p-6"
                      priority
                    />
                  </div>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* Quick benefits */}
      <section className="mt-12">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            <Reveal variant="media" delay={0}>
              <Card className="p-6">
                <div className="flex items-center gap-3 text-sm font-semibold text-ink">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
                    <Shield className="h-4 w-4 text-accent-strong" />
                  </div>
                  Protection first
                </div>
                <p className="mt-3 text-sm text-muted">
                  Built for dust, paint splatter, and everyday decorating mess.
                </p>
              </Card>
            </Reveal>
            <Reveal variant="media" delay={120}>
              <Card className="p-6">
                <div className="flex items-center gap-3 text-sm font-semibold text-ink">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
                    <Sparkles className="h-4 w-4 text-accent-strong" />
                  </div>
                  Clean coverage
                </div>
                <p className="mt-3 text-sm text-muted">
                  Extra‑large sheets help you cover faster with fewer joins.
                </p>
              </Card>
            </Reveal>
            <Reveal variant="media" delay={240}>
              <Card className="p-6">
                <div className="flex items-center gap-3 text-sm font-semibold text-ink">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
                    <Check className="h-4 w-4 text-accent-strong" />
                  </div>
                  Simple choices
                </div>
                <p className="mt-3 text-sm text-muted">Pick your pack size. Checkout stays on Amazon.</p>
              </Card>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Gallery */}
      <section className="mt-12">
        <Container>
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tightish text-ink md:text-3xl">
                  Built for real projects.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-muted">
                  Coverage, durability, and use cases — shown with the exact pack visuals customers see
                  on marketplaces.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/products">Compare packs</Link>
              </Button>
            </div>
          </Reveal>

          <ProductGallery images={p.gallery} />
        </Container>
      </section>

      {/* Highlights + specs */}
      <section className="mt-12">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal>
                <h2 className="text-2xl font-semibold tracking-tightish text-ink md:text-3xl">What you get</h2>
                <p className="mt-3 text-sm text-muted">Short, practical details — Apple-style.</p>
              </Reveal>
              <Reveal delay={120}>
                <ul className="mt-6 space-y-3">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-none rounded-full bg-accent" />
                      <div className="text-sm text-ink">{h}</div>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={220}>
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-ink">Need help?</h3>
                  <p className="mt-2 text-sm text-muted">
                    Email{' '}
                    <a
                      className="font-semibold text-ink hover:underline"
                      href={`mailto:${site.contactEmail}`}
                    >
                      {site.contactEmail}
                    </a>
                    .
                  </p>
                </div>
              </Reveal>
            </div>

            <div className="md:col-span-7">
              <Reveal variant="media" delay={120}>
                <Card className="p-6">
                  <div className="text-sm font-semibold text-ink">Specifications</div>
                  <div className="mt-4">
                    {p.specs.map((s, i) => (
                      <SpecRow key={s.label} label={s.label} value={s.value} index={i} />
                    ))}
                  </div>
                  <div className="mt-4 text-xs text-muted">* Specs and pricing may vary by marketplace.</div>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* Compare + next */}
      <section className="mt-12 pb-16">
        <Container>
          <Reveal variant="media">
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-surface px-6 py-4">
                <div className="text-sm font-semibold text-ink">Compare packs</div>
                <p className="mt-1 text-xs text-muted">Find your fit, then buy on Amazon.</p>
              </div>
              <div className="grid gap-0 md:grid-cols-12">
                <div className="relative md:col-span-7">
                  <div className="relative aspect-[970/600] bg-black">
                    <Image
                      src="/images/amazon/fit-coverage.webp"
                      alt="Find your perfect fit"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
                <div className="md:col-span-5">
                  <div className="p-6">
                    <div className="text-sm font-semibold text-ink">Recommended</div>
                    <p className="mt-2 text-sm text-muted">
                      Start with the <span className="font-semibold text-ink">{primary.name}</span>. It’s
                      the pack most customers choose.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href="/products">See all packs</Link>
                      </Button>
                      <Button asChild variant="accent" size="sm">
                        <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                          Buy 6 Pack <ArrowUpRight className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>

                    {primary.amazonAltUrl ? (
                      <div className="mt-3 text-xs text-muted">
                        Prefer{' '}
                        <a
                          className="font-semibold text-ink hover:underline"
                          href={primary.amazonAltUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {primary.amazonAltLabel}
                        </a>
                        ?
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
