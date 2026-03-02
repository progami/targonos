import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Check, Shield, Sparkles } from 'lucide-react';

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
      "flex items-start justify-between gap-6 border-b border-white/10 py-4 pl-4 -ml-4 border-l-2",
      index % 2 === 0 ? "border-l-accent/50" : "border-l-transparent"
    )}>
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="text-sm text-white/60 text-right">{value}</div>
    </div>
  );
}

export default function ProductDetailPage({ params }: PageProps) {
  const p = getProductBySlug(params.slug);
  if (!p) return notFound();

  const primary = products.find((x) => x.primary)!;

  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="pt-12 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-12 md:items-center">
            <div className="md:col-span-6">
              <Breadcrumb
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Products', href: '/caelum-star/products' },
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
                <h1 className="mt-5 text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[0.92] tracking-[-0.04em]">{p.name}</h1>
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
                    <Link href="/caelum-star/products">Compare packs</Link>
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

      {/* ─── QUICK BENEFITS ─── */}
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
                <p className="mt-3 text-sm text-muted">Pick your pack size. Available at authorized retailers.</p>
              </Card>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── GALLERY ─── */}
      <section className="mt-16">
        <Container>
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="cs-overline text-accent-strong">Gallery</p>
                <h2 className="mt-2 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">
                  Built for real projects.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-muted">
                  Coverage, durability, and use cases — shown with the exact pack visuals customers see
                  on marketplaces.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/caelum-star/products">Compare packs</Link>
              </Button>
            </div>
          </Reveal>

          <ProductGallery images={p.gallery} />
        </Container>
      </section>

      {/* ─── HIGHLIGHTS + SPECS ─── Dark section */}
      <section className="cs-dark-section--navy mt-16 py-20 md:py-28">
        <Container className="relative z-10">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal>
                <p className="cs-overline text-accent">Details</p>
                <h2 className="mt-2 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white">What you get</h2>
              </Reveal>
              <Reveal delay={120}>
                <ul className="mt-6 space-y-3">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-none rounded-full bg-accent" />
                      <div className="text-sm text-white/80">{h}</div>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={220}>
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-white">Need help?</h3>
                  <p className="mt-2 text-sm text-white/50">
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
              </Reveal>
            </div>

            <div className="md:col-span-7">
              <Reveal variant="media" delay={120}>
                <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-6">
                  <div className="text-sm font-semibold text-white">Specifications</div>
                  <div className="mt-4">
                    {p.specs.map((s, i) => (
                      <SpecRow key={s.label} label={s.label} value={s.value} index={i} />
                    ))}
                  </div>
                  <div className="mt-4 text-xs text-white/40">* Specs and pricing may vary by marketplace.</div>
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-16 pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-[28px] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-7">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Find your perfect fit.
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Start with the <span className="font-semibold text-white/80">{primary.name}</span>. It&apos;s
                    the pack most customers choose.
                  </p>
                </div>
                <div className="md:col-span-5 md:flex md:justify-end">
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline" className="border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]">
                      <Link href="/caelum-star/products">See all packs</Link>
                    </Button>
                    <Button asChild variant="accent">
                      <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                        Buy {primary.name} <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
