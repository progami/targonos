import Link from 'next/link';
import Image from 'next/image';

import { ArrowRight, ExternalLink, Check } from 'lucide-react';

import { Container } from '@/components/Container';
import { ProductFeatureCard } from '@/components/ProductFeatureCard';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';
import { site } from '@/content/site';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Caelum Star'
};

function WideImage({
  src,
  alt,
  className
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-[28px] border bg-white/60 shadow-sm transition-all duration-500 motion-safe:hover:shadow-lg motion-safe:hover:-translate-y-1',
        // Our EBC wide creatives are 1464x600.
        'aspect-[61/25]',
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1920px"
        className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.02]"
      />
    </div>
  );
}

function SquareImage({
  src,
  alt,
  className
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-[28px] border bg-white/60 shadow-sm transition-all duration-500 motion-safe:hover:shadow-lg motion-safe:hover:-translate-y-1',
        'aspect-square',
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 900px"
        className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.03]"
      />
    </div>
  );
}

export default function CaelumStarPage() {
  const primary = products.find((p) => p.primary);
  if (!primary) {
    throw new Error('Primary product not found.');
  }

  const highlightChips = primary.highlights.slice(0, 3);

  return (
    <div>
      {/* HERO */}
      <section className="pt-10 md:pt-16">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal delay={0}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="subtle">{site.name}</Badge>
                  <Badge>Caelum Star</Badge>
                </div>
              </Reveal>

              <Reveal delay={40}>
                <div className="mt-5">
                  <Image
                    src="/brand/cs/logo-on-light.webp"
                    alt="CS Caelum Star"
                    width={520}
                    height={120}
                    className="h-auto w-[280px] max-w-full opacity-90 md:w-[320px]"
                    priority={false}
                  />
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight md:text-6xl">
                  Extra‑large dust sheets.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-4 max-w-xl text-pretty text-lg text-muted">
                  Cover more. Clean up less.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button asChild variant="accent" size="lg">
                    <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                      Buy on Amazon
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href={`/products/${primary.slug}`}>Learn more</Link>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={320}>
                <div className="mt-6 flex flex-wrap gap-2">
                  {highlightChips.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-ink"
                    >
                      <Check className="h-3 w-3 text-accent-strong" />
                      {h}
                    </span>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={400}>
                <p className="mt-6 text-sm text-muted">
                  Checkout stays on Amazon. This page is built for pack details.
                </p>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <Reveal variant="zoom" delay={140} className="h-full">
                <div className="relative mx-auto max-w-[680px] animate-float">
                  <Image
                    src={primary.image.src}
                    alt={primary.image.alt}
                    width={1200}
                    height={1200}
                    priority
                    className="h-auto w-full drop-shadow-2xl"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* APPLE-LIKE: BIG VISUAL SECTIONS */}
      <section className="py-10 md:py-14">
        <Container>
          <Reveal>
            <div className="text-center">
              <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Pick your protection.
              </h2>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/products">Explore packs</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link href="/where-to-buy">
                    Where to buy <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Reveal>

          <Reveal variant="media" delay={120}>
            <div className="mt-8">
              <WideImage
                src="/images/amazon/pick-protection.webp"
                alt="Pick your protection — Caelum Star dust sheet packs"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal>
            <div className="text-center">
              <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Find your perfect fit.
              </h2>
            </div>
          </Reveal>

          <Reveal variant="media" delay={120}>
            <div className="mt-8">
              <WideImage
                src="/images/amazon/fit-coverage.webp"
                alt="Find your perfect fit — coverage comparison"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* 2-UP GRID (like Apple tiles) */}
      <section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2">
            <Reveal variant="media" delay={0}>
              <SquareImage
                src="/images/amazon/general-projects.webp"
                alt="Ideal for general projects — 6 pack essentials"
              />
            </Reveal>
            <Reveal variant="media" delay={120}>
              <SquareImage
                src="/images/amazon/multi-room-projects.webp"
                alt="Ideal for multi-room projects — 12 pack deluxe"
              />
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal variant="media">
            <WideImage
              src="/images/amazon/applications.webp"
              alt="Applications — moving, painting, renovating"
            />
          </Reveal>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal variant="media">
            <WideImage
              src="/images/amazon/strong-vs-light.webp"
              alt="Strong vs light durability comparison"
            />
          </Reveal>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal variant="media">
            <WideImage src="/images/amazon/aplus-4.webp" alt="One sheet, multiple benefits" />
          </Reveal>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal>
            <p className="mb-4 text-center text-sm font-medium uppercase tracking-[0.2em] text-muted">
              Sustainability
            </p>
          </Reveal>
          <Reveal variant="media" delay={80}>
            <WideImage
              src="/images/amazon/sustainable-process.webp"
              alt="Sustainable efficiency process"
            />
          </Reveal>
        </Container>
      </section>

      <section className="py-10 md:py-14">
        <Container>
          <Reveal>
            <p className="mb-4 text-center text-sm font-medium uppercase tracking-[0.2em] text-muted">
              Made with 55% recycled plastic
            </p>
          </Reveal>
          <Reveal variant="media" delay={80}>
            <WideImage
              src="/images/amazon/sustainable-efficiency.webp"
              alt="Sustainable efficiency — 55% recycled plastic"
            />
          </Reveal>
        </Container>
      </section>

      {/* PRODUCTS */}
      <section className="py-10 md:py-14">
        <Container>
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Explore packs.
                </h2>
                <p className="mt-2 text-sm text-muted">Start with the 6 pack. Scale up when you need it.</p>
              </div>
              <Button asChild variant="ghost" className="hidden md:inline-flex">
                <Link href="/products">
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal variant="media" delay={120}>
            <div className="mt-8 flex gap-6 overflow-x-auto pb-2">
              {products.map((product) => (
                <ProductFeatureCard key={product.slug} product={product} />
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* SUPPORT */}
      <section className="pb-16">
        <Container>
          <Reveal variant="media">
            <Card className="p-6 md:p-10">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                    Need help choosing the right pack?
                  </h3>
                  <p className="mt-3 text-sm text-muted">
                    Email{' '}
                    <a className="underline" href={`mailto:${site.contactEmail}`}>
                      {site.contactEmail}
                    </a>
                    .
                  </p>
                </div>
                <div className="md:col-span-4 md:flex md:justify-end">
                  <Button asChild size="lg">
                    <Link href="/where-to-buy">
                      Where to buy <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
