'use client';

import Link from 'next/link';
import Image from 'next/image';

import { ArrowRight, ExternalLink } from 'lucide-react';

import { Container } from '@/components/Container';
import { ProductFeatureCard } from '@/components/ProductFeatureCard';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';
import type { Product } from '@/content/products';
import { cn } from '@/lib/utils';

export type RegionImages = {
  pickProtection: string;
  fitCoverage: string;
  generalProjects: string;
  multiRoomProjects: string;
  applications: string;
  strongVsLight: string;
  benefits: string;
  sustainableProcess: string;
  sustainableEfficiency: string;
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
        'relative w-full overflow-hidden rounded-2xl border shadow-sm',
        'aspect-[61/25]',
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1920px"
        className="object-cover"
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
        'relative w-full overflow-hidden rounded-2xl border shadow-sm',
        'aspect-square',
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 900px"
        className="object-cover"
      />
    </div>
  );
}

export function CaelumStarContent({
  images,
  products,
  region
}: {
  images: RegionImages;
  products: Product[];
  region: 'us' | 'uk';
}) {
  const primary = products.find((p) => p.primary);
  if (!primary) {
    throw new Error('Primary product not found.');
  }

  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="cs-hero relative min-h-[70vh] overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="grid items-center gap-10 pb-20 pt-12 md:pb-28 md:pt-20 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal delay={0}>
                <Image
                  src="/brand/cs/logo-on-dark.webp"
                  alt="Caelum Star"
                  width={520}
                  height={120}
                  className="h-auto w-[220px] max-w-full opacity-90 md:w-[260px]"
                />
              </Reveal>

              <Reveal delay={60}>
                <h1 className="mt-5 text-balance text-[clamp(2.8rem,6vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                  Extra&#x2011;large dust sheets.
                </h1>
              </Reveal>

              <Reveal delay={120}>
                <p className="mt-4 max-w-md text-pretty text-lg leading-relaxed text-white/50">
                  Cover more. Clean up less.
                </p>
              </Reveal>

              <Reveal delay={180}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild variant="accent" size="lg">
                    <a href={primary.amazonUrl} target="_blank" rel="noreferrer">
                      Buy on Amazon
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
                  >
                    <Link href={`/cs/${region}/packs/${primary.slug}`}>Learn more</Link>
                  </Button>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <Reveal variant="zoom" delay={100} className="h-full">
                <div className="relative mx-auto max-w-[680px]">
                  <div className="cs-product-glow" />
                  <Image
                    src={primary.image.src}
                    alt={primary.image.alt}
                    width={1200}
                    height={1200}
                    priority
                    className="relative z-10 h-auto w-full animate-float drop-shadow-2xl"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>

      {/* ─── PICK YOUR PROTECTION ─── */}
      <section className="py-16 md:py-24">
        <Container>
          <Reveal>
            <h2 className="text-balance text-center text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Pick your protection.
            </h2>
          </Reveal>

          <Reveal variant="media" delay={100}>
            <div className="mt-10">
              <WideImage
                src={images.pickProtection}
                alt="Pick your protection — Caelum Star dust sheet packs"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── COVERAGE AT A GLANCE ─── */}
      <section className="cs-dark-section--navy py-20 md:py-28">
        <Container className="relative z-10">
          <Reveal>
            <h2 className="text-balance text-center text-[clamp(2rem,4.5vw,3rem)] font-bold leading-[0.95] tracking-[-0.035em] text-white">
              Coverage that scales with your project.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product, i) => (
              <Reveal key={product.slug} delay={i * 80}>
                <Link
                  href={`/cs/${region}/packs/${product.slug}`}
                  className={cn(
                    'group flex flex-col items-center rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-5 py-7 text-center transition-all duration-300 hover:border-accent/25 hover:bg-white/10',
                    product.primary && 'border-accent/25 bg-accent/[0.06] ring-1 ring-accent/15'
                  )}
                >
                  {product.primary ? (
                    <span className="mb-4 inline-flex items-center rounded-pill bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                      Most popular
                    </span>
                  ) : (
                    <span className="mb-4 h-[18px]" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    {product.packLabel} &middot; {product.thicknessLabel}
                  </span>
                  <span className="mt-1.5 text-xl font-bold tracking-tight text-white">
                    {product.name}
                  </span>
                  {product.coverageLabel ? (
                    <span className="cs-stat-number mt-5 block text-[clamp(2.5rem,5vw,3.5rem)] font-bold leading-none text-accent">
                      {product.coverageLabel.replace(' sq ft', '')}
                    </span>
                  ) : null}
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
                    sq ft coverage
                  </span>
                  {product.price ? (
                    <span className="mt-5 text-sm font-semibold text-white/60">{product.price}</span>
                  ) : null}
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent/70 transition group-hover:text-accent">
                    View details <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── FIND YOUR PERFECT FIT ─── */}
      <section className="py-16 md:py-24">
        <Container>
          <Reveal>
            <h2 className="text-balance text-center text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Find your perfect fit.
            </h2>
          </Reveal>

          <Reveal variant="media" delay={100}>
            <div className="mt-10">
              <WideImage
                src={images.fitCoverage}
                alt="Find your perfect fit — coverage comparison"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── USE CASE TILES ─── */}
      <section className="py-10 md:py-16">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2">
            <Reveal variant="media" delay={0}>
              <SquareImage
                src={images.generalProjects}
                alt="Ideal for general projects — 6 pack essentials"
              />
            </Reveal>
            <Reveal variant="media" delay={100}>
              <SquareImage
                src={images.multiRoomProjects}
                alt="Ideal for multi-room projects — 12 pack deluxe"
              />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── APPLICATIONS ─── */}
      <section className="py-10 md:py-16">
        <Container>
          <Reveal variant="media">
            <WideImage
              src={images.applications}
              alt="Applications — moving, painting, renovating"
            />
          </Reveal>
        </Container>
      </section>

      {/* ─── DURABILITY COMPARISON ─── */}
      <section className="py-16 md:py-24">
        <Container>
          <Reveal>
            <h2 className="text-balance text-center text-[clamp(2rem,4.5vw,3rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Strong when you need it.{' '}
              <br className="hidden sm:block" />
              Light when you don&apos;t.
            </h2>
          </Reveal>

          <Reveal variant="media" delay={100}>
            <div className="mt-10">
              <WideImage
                src={images.strongVsLight}
                alt="Strong vs light durability comparison"
              />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── BENEFITS ─── */}
      <section className="py-10 md:py-16">
        <Container>
          <Reveal variant="media">
            <WideImage src={images.benefits} alt="One sheet, multiple benefits" />
          </Reveal>
        </Container>
      </section>

      {/* ─── SUSTAINABILITY ─── */}
      <section className="cs-dark-section--deep py-20 md:py-28">
        <Container className="relative z-10">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <h2 className="text-balance text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.035em] text-white">
                Made with <span className="text-accent">55%</span> recycled plastic.
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-white/45">
                Post-consumer plastic is collected, shredded, and reformed into protective sheets.
                Every pack is GRS certified and Climate Pledge Friendly.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Reveal variant="media" delay={0}>
              <div className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] shadow-sm aspect-[61/25]">
                <Image
                  src={images.sustainableProcess}
                  alt="Sustainable efficiency process"
                  fill
                  sizes="(max-width: 1024px) 100vw, 960px"
                  className="object-cover"
                />
              </div>
            </Reveal>
            <Reveal variant="media" delay={100}>
              <div className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] shadow-sm aspect-[61/25]">
                <Image
                  src={images.sustainableEfficiency}
                  alt="Sustainable efficiency — 55% recycled plastic"
                  fill
                  sizes="(max-width: 1024px) 100vw, 960px"
                  className="object-cover"
                />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── PRODUCT CARDS ─── */}
      <section className="py-16 md:py-24">
        <Container>
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-balance text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">
                Explore packs.
              </h2>
              <Button asChild variant="ghost" className="hidden md:inline-flex">
                <Link href={`/cs/${region}/packs`}>
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal variant="media" delay={100}>
            <div className="mt-8 flex gap-6 overflow-x-auto pb-2">
              {products.map((product) => (
                <ProductFeatureCard key={product.slug} product={product} />
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── SUPPORT CTA ─── */}
      <section className="pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-2xl p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Need help choosing the right pack?
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Email{' '}
                    <a
                      className="text-white/80 underline decoration-white/20 underline-offset-2 transition hover:text-white hover:decoration-white/50"
                      href={`mailto:${site.contactEmail}`}
                    >
                      {site.contactEmail}
                    </a>
                  </p>
                </div>
                <div className="md:col-span-4 md:flex md:justify-end">
                  <Button asChild variant="accent" size="lg">
                    <Link href={`/cs/${region}/where-to-buy`}>
                      Where to buy <ArrowRight className="h-4 w-4" />
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
