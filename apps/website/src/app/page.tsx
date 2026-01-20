import Link from 'next/link';
import Image from 'next/image';
import { Recycle, Shield, Sparkles } from 'lucide-react';
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
  return (
    <div>
      {/* Hero */}
      <section className="pt-14 md:pt-20">
        <Container>
          <div className="grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <Badge>Recycled materials</Badge>
              <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tightish md:text-7xl">
                Everyday protection, done better.
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted md:text-lg">
                A clean, minimal lineup of drop cloths built from recycled materials and tuned for real work.
                Learn the differences in seconds — then buy where you already shop.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/products">Explore products</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/where-to-buy">Where to buy</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-pill border border-border bg-surface px-3 py-1">Recycled cotton blend</span>
                <span className="rounded-pill border border-border bg-surface px-3 py-1">Reusable</span>
                <span className="rounded-pill border border-border bg-surface px-3 py-1">Designed for clean work</span>
              </div>
            </div>

            <div className="md:col-span-5">
              <Card className="overflow-hidden">
                <div className="relative aspect-[4/3]">
                  <Image
                    src="/products/deluxe.svg"
                    alt="Targon product preview"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="p-6">
                  <div className="text-sm font-semibold text-ink">Buy on Amazon</div>
                  <p className="mt-2 text-sm text-muted">
                    We focus on product design and details. Checkout happens on Amazon.
                  </p>
                  <div className="mt-4">
                    <Button asChild variant="accent">
                      <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                        Visit Amazon store
                      </a>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>

      {/* Category strip */}
      <section className="mt-14">
        <Container>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="rounded-card border border-border bg-surface px-4 py-4 text-center shadow-softer transition hover:-translate-y-0.5"
              >
                <div className="text-base font-semibold tracking-tightish">{p.name}</div>
                <div className="mt-1 text-xs text-muted">{p.tagline}</div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Latest carousel */}
      <section className="mt-16">
        <Container>
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-muted">The lineup</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tightish md:text-4xl">
                Take a look at what’s new, right now.
              </h2>
            </div>
            <div className="hidden md:block">
              <Button asChild variant="outline">
                <Link href="/products">View all</Link>
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

      {/* Value props */}
      <section className="mt-20 md:mt-24">
        <Container>
          <div className="grid gap-5 md:grid-cols-3">
            <Card className="p-6">
              <Recycle className="h-5 w-5 text-ink" />
              <div className="mt-4 text-lg font-semibold tracking-tightish">Recycled by default</div>
              <p className="mt-2 text-sm text-muted">
                A recycled cotton blend reinforced with recycled plastic fibers — engineered for durability without the waste.
              </p>
            </Card>
            <Card className="p-6">
              <Shield className="h-5 w-5 text-ink" />
              <div className="mt-4 text-lg font-semibold tracking-tightish">Built for real work</div>
              <p className="mt-2 text-sm text-muted">
                Less slip, cleaner setup, better edge control. Designed around the small problems that slow jobs down.
              </p>
            </Card>
            <Card className="p-6">
              <Sparkles className="h-5 w-5 text-ink" />
              <div className="mt-4 text-lg font-semibold tracking-tightish">Simple lineup</div>
              <p className="mt-2 text-sm text-muted">
                Four clear tiers. Clear differences. Pick the feel you want and get back to the project.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="mt-20 md:mt-24">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Questions, answered.</h2>
              <p className="mt-3 text-sm text-muted">
                If you have a question we didn’t cover, email us at{' '}
                <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>.
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
                <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">
                  Ready when you are.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-white/75 md:text-base">
                  Browse the lineup, choose a tier, and buy on Amazon. Simple.
                </p>
              </div>
              <div className="md:col-span-4 md:flex md:justify-end">
                <Button asChild variant="accent" size="lg" className="bg-accent text-ink">
                  <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                    Buy on Amazon
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
