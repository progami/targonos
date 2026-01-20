import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Droplets, Package, Recycle, Shield } from 'lucide-react';

import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ProductFeatureCard } from '@/components/ProductFeatureCard';
import { FAQ } from '@/components/FAQ';
import { faqs } from '@/content/faqs';
import { products } from '@/content/products';
import { site } from '@/content/site';

export default function HomePage() {
  const primary = products.find((p) => p.primary) ?? products[0];

  return (
    <div>
      {/* Hero */}
      <section className="pt-10 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-12 md:items-center">
            <div className="md:col-span-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{site.productBrandName}</Badge>
                <Badge className="border-accent/30 bg-accent/10">
                  {primary.packLabel} · {primary.thicknessLabel}
                </Badge>
              </div>

              <h1 className="mt-5 text-balance text-5xl font-semibold tracking-tightish md:text-7xl">
                Paint with confidence.
              </h1>

              <p className="mt-4 max-w-xl text-base text-muted md:text-lg">
                Extra‑large dust sheets for decorating, painting, and protection.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" variant="accent">
                  <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                    Buy {primary.name} <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/products">Compare packs</Link>
                </Button>
              </div>

              <div className="mt-6 flex flex-wrap items-baseline gap-3">
                {primary.price ? (
                  <div className="text-sm font-semibold text-ink">
                    From {primary.price}
                    <span className="ml-1 text-xs font-normal text-muted">(on Amazon)</span>
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-ink">Price and availability on Amazon</div>
                )}
                {primary.coverageLabel ? (
                  <div className="text-xs text-muted">{primary.coverageLabel} total coverage</div>
                ) : null}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Package className="h-4 w-4" /> 12×9 ft
                  </div>
                  <div className="mt-1 text-xs text-muted">3.6m × 2.7m per sheet</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Shield className="h-4 w-4" /> Protect
                  </div>
                  <div className="mt-1 text-xs text-muted">Dust · paint · light spills</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Recycle className="h-4 w-4" /> Recycled
                  </div>
                  <div className="mt-1 text-xs text-muted">GRS certified (pack‑dependent)</div>
                </Card>
              </div>
            </div>

            <div className="md:col-span-6">
              <Card className="overflow-hidden">
                <div className="relative aspect-[4/3] bg-white">
                  <Image
                    src={primary.image.src}
                    alt={primary.image.alt}
                    fill
                    className="object-contain p-8"
                    priority
                    sizes="(min-width: 1024px) 720px, 100vw"
                  />
                </div>
              </Card>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Card className="p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Coverage</div>
                  <div className="mt-2 text-sm font-semibold text-ink">
                    {primary.coverageLabel ?? '—'}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Checkout</div>
                  <div className="mt-2 text-sm font-semibold text-ink">On Amazon</div>
                  <div className="mt-1 text-xs text-muted">Fast shipping · easy returns</div>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Category row (Apple Store-style) */}
      <section className="mt-10">
        <Container>
          <div className="flex gap-8 overflow-x-auto pb-3 [-webkit-overflow-scrolling:touch]">
            {products.map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="group flex min-w-[120px] flex-col items-center gap-2"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface shadow-softer transition group-hover:-translate-y-0.5">
                  <span className="text-xl font-semibold tracking-tightish">
                    {p.packLabel.replace(' PK', '')}
                  </span>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-ink">{p.name}</div>
                  <div className="text-xs text-muted">{p.coverageLabel ?? p.thicknessLabel}</div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Image-led: benefits */}
      <section className="mt-16 md:mt-20">
        <Container>
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-muted">Benefits</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tightish md:text-4xl">
                One sheet. Multiple benefits.
              </h2>
            </div>
            <div className="hidden md:block">
              <Button asChild variant="outline">
                <Link href="/products">Explore packs</Link>
              </Button>
            </div>
          </div>
        </Container>

        <div className="mx-auto mt-8 max-w-[1680px] px-4 sm:px-6">
          <Card className="overflow-hidden">
            <div className="relative aspect-[970/600] bg-black">
              <Image
                src="/images/amazon/aplus-4.jpg"
                alt="One sheet, multiple benefits"
                fill
                className="object-cover"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
            </div>
          </Card>
        </div>

        <Container>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Droplets className="h-4 w-4" /> Water resistant
              </div>
              <div className="mt-1 text-xs text-muted">Helps protect from light spills.</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Shield className="h-4 w-4" /> Dust & debris
              </div>
              <div className="mt-1 text-xs text-muted">Designed for decorating prep.</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Recycle className="h-4 w-4" /> Recyclability
              </div>
              <div className="mt-1 text-xs text-muted">See pack listing for details.</div>
            </Card>
          </div>
        </Container>
      </section>

      {/* Image-led: fit */}
      <section className="mt-16 md:mt-20">
        <Container>
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-muted">Compare</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tightish md:text-4xl">Find your perfect fit.</h2>
            </div>
            <div className="hidden md:block">
              <Button asChild variant="outline">
                <Link href="/products">Compare packs</Link>
              </Button>
            </div>
          </div>
        </Container>

        <div className="mx-auto mt-8 max-w-[1680px] px-4 sm:px-6">
          <Card className="overflow-hidden">
            <div className="relative aspect-[970/600] bg-black">
              <Image
                src="/images/amazon/fit-coverage.jpg"
                alt="Find your perfect fit"
                fill
                className="object-cover"
                sizes="100vw"
              />
            </div>
          </Card>
        </div>
      </section>

      {/* The latest */}
      <section className="mt-16 md:mt-20">
        <Container>
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-muted">The latest</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tightish md:text-4xl">
                Packs, ready for the next job.
              </h2>
            </div>
            <div className="hidden md:block">
              <Button asChild variant="outline">
                <Link href="/products">Compare packs</Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 flex gap-5 overflow-x-auto pb-4 [-webkit-overflow-scrolling:touch]">
            {products.map((p) => (
              <ProductFeatureCard key={p.slug} product={p} />
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="mt-20 md:mt-24">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Questions.</h2>
              <p className="mt-3 text-sm text-muted">
                Email{' '}
                <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>
                .
              </p>
            </div>
            <div className="md:col-span-8">
              <div className="grid gap-3">
                <FAQ items={faqs} />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="mt-20 md:mt-24">
        <Container>
          <div className="rounded-card bg-ink p-8 text-white shadow-soft md:p-12">
            <div className="grid gap-8 md:grid-cols-12 md:items-center">
              <div className="md:col-span-8">
                <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Ready when you are.</h2>
                <p className="mt-3 max-w-2xl text-sm text-white/75 md:text-base">
                  Choose a pack. Checkout stays on Amazon.
                </p>
              </div>
              <div className="md:col-span-4 md:flex md:justify-end">
                <Button asChild variant="accent" size="lg" className="bg-accent text-ink">
                  <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                    Buy {primary.name} <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
