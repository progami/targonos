import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { HomeRuntime } from '@/components/HomeRuntime';
import { site } from '@/content/site';
import { products } from '@/content/products';
import { ProductFeatureCard } from '@/components/ProductFeatureCard';
import { HorizontalCarousel } from '@/components/HorizontalCarousel';

export default function HomePage() {
  return (
    <div>
      <HomeRuntime />

      {/* HERO */}
      <section className="tg-snap" id="top">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/home/hero-robot.webp')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/20 to-black/85" />
        </div>

        <Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[60%] select-none blur-[2px]"
          >
            <Image
              src="/brand/logo-inverted.svg"
              alt=""
              width={2048}
              height={537}
              className="h-auto w-[88vw] max-w-none opacity-[0.14] md:w-[78vw]"
            />
          </div>

          <Reveal>
            <h2 className="mx-auto w-[min(560px,90vw)]">
              <Image
                src="/brand/logo-inverted.svg"
                alt=""
                width={2048}
                height={537}
                priority
                className="h-auto w-full drop-shadow-2xl"
              />
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-4 inline-flex items-center rounded-pill border border-white/10 bg-black/30 px-6 py-2 text-base font-light uppercase tracking-[0.2em] text-accent backdrop-blur-sm md:text-lg lg:text-xl">
              AI‑Driven Manufacturing &amp; Design
            </p>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href="/caelum-star">
                  Explore products <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                <Link href="/about">About</Link>
              </Button>
            </div>
          </Reveal>
        </Container>

        <div className="absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/50">
            Explore
          </span>
          <div className="motion-safe:animate-bounce">
            <ChevronDown className="h-6 w-6 text-white/60" aria-hidden />
          </div>
        </div>
      </section>

      {/* PURPOSE */}
      <section className="tg-snap bg-ink" id="purpose">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/home/purpose-laptop.webp')" }}
          />
          <div className="absolute inset-0 bg-ink/70 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
        </div>

        <Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          <Reveal>
            <div className="text-xs font-bold uppercase tracking-[0.5em] text-accent/90">
              Targon’s purpose
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-6 text-6xl font-semibold leading-[0.9] tracking-tighter text-white md:text-8xl lg:text-9xl">
              Dissolving
              <br />
              Complexity.
            </h2>
          </Reveal>
        </Container>
      </section>

      {/* MISSION */}
      <section className="tg-snap bg-black" id="mission">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-45 grayscale"
            style={{ backgroundImage: "url('/images/home/mission-abstract.webp')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-ink/40 to-black" />
        </div>

        <Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-3 border-b border-white/10 pb-4 text-xs font-bold uppercase tracking-[0.5em] text-white/50">
              Mission
            </div>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-12 max-w-5xl text-pretty text-3xl font-light leading-tight tracking-wide text-white/90 md:text-5xl lg:text-6xl">
              Simplify complexities by innovatively and efficiently using{' '}
              <span className="font-normal text-accent">intelligent business processes.</span>
            </p>
          </Reveal>
        </Container>
      </section>

      {/* VISION */}
      <section className="tg-snap" id="vision">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/home/vision-earth.webp')" }}
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
        </div>

        <Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          <Reveal>
            <span className="inline-flex items-center rounded-pill border border-white/20 bg-black/20 px-6 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white backdrop-blur-md">
              Vision
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-10 text-5xl font-bold leading-none tracking-tight text-white md:text-7xl lg:text-8xl">
              Empowering you with
              <br />
              <span className="font-light text-accent/90">simplicity and efficiency.</span>
            </h2>
          </Reveal>
        </Container>
      </section>

      {/* VALUES */}
      <section className="tg-snap tg-values bg-black" id="values">
        <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-6 md:p-10">
          <div>
            <Reveal>
              <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Core values</h2>
            </Reveal>
            <Reveal delay={100}>
              <div className="mt-3 h-0.5 w-16 bg-accent/50" />
            </Reveal>
          </div>
          <div className="hidden items-center gap-2 opacity-30 md:flex">
            <span className="text-xl text-white" aria-hidden>
              ∞
            </span>
          </div>
        </div>

        <div className="tg-value-row">
          <div
            className="tg-value-panel group"
            tabIndex={0}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div
              className="tg-value-bg"
              style={{ backgroundImage: "url('/images/home/value-efficiency.webp')" }}
            />
            <div className="tg-value-scrim" />
            <div className="tg-value-content">
              <h3 className="tg-value-title">Efficiency</h3>
              <div className="tg-value-desc">
                <div className="h-px w-12 bg-accent/70" />
                <p className="mt-4">
                  Optimizing every intelligent process for maximum, streamlined output.
                </p>
              </div>
            </div>
          </div>

          <div
            className="tg-value-panel group"
            tabIndex={0}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div
              className="tg-value-bg"
              style={{ backgroundImage: "url('/images/home/value-simplicity.webp')" }}
            />
            <div className="tg-value-scrim" />
            <div className="tg-value-content">
              <h3 className="tg-value-title">Simplicity</h3>
              <div className="tg-value-desc">
                <div className="h-px w-12 bg-accent/70" />
                <p className="mt-4">Clarity in thought. Purity in execution. Removing the unnecessary.</p>
              </div>
            </div>
          </div>

          <div
            className="tg-value-panel group"
            tabIndex={0}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div
              className="tg-value-bg"
              style={{ backgroundImage: "url('/images/home/value-curiosity.webp')" }}
            />
            <div className="tg-value-scrim" />
            <div className="tg-value-content">
              <h3 className="tg-value-title">Curiosity</h3>
              <div className="tg-value-desc">
                <div className="h-px w-12 bg-accent/70" />
                <p className="mt-4">Constantly seeking better answers in the unknown.</p>
              </div>
            </div>
          </div>

          <div
            className="tg-value-panel tg-value-panel--last group"
            tabIndex={0}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div
              className="tg-value-bg"
              style={{ backgroundImage: "url('/images/home/value-innovation.webp')" }}
            />

            <div className="tg-innovation-overlay">
              <div className="tg-innovation-glow" />
              <div className="tg-ring h-48 w-48 md:h-80 md:w-80" />
              <div className="tg-ring tg-ring--reverse h-36 w-36 md:h-64 md:w-64" />
              <div className="tg-ring tg-ring--core h-24 w-24 md:h-40 md:w-40" />
              <div className="h-12 w-12 rounded-full bg-accent blur-md motion-safe:animate-pulse" />
            </div>

            <div className="tg-value-scrim" />
            <div className="tg-value-content">
              <h3 className="tg-value-title text-accent">Innovation</h3>
              <div className="tg-value-desc">
                <div className="h-px w-12 bg-accent/80" />
                <p className="mt-4 text-white/85">
                  Redefining boundaries with high‑end architectural logic. The future is built here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="tg-snap bg-black" id="products">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
          <div className="absolute -left-24 top-24 h-[520px] w-[520px] rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -right-24 bottom-24 h-[520px] w-[520px] rounded-full bg-ink/30 blur-3xl" />
        </div>

        <Container className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6">
          <div className="w-full max-w-6xl">
            <div className="grid items-end gap-8 md:grid-cols-12">
              <div className="text-center md:col-span-5 md:text-left">
                <Reveal>
                  <div className="text-xs font-bold uppercase tracking-[0.5em] text-accent/90">
                    Products
                  </div>
                </Reveal>
                <Reveal delay={120}>
                  <h2 className="mt-6 flex justify-center md:justify-start">
                    <Image
                      src="/brand/cs/logo-on-dark.webp"
                      alt={site.productBrandName}
                      width={1384}
                      height={300}
                      className="h-auto w-[min(420px,90%)] opacity-95"
                    />
                  </h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mt-4 max-w-xl text-pretty text-base text-white/70 md:text-lg">
                    Extra‑large dust sheets built for clean decorating. Clear pack options. Available at select
                    retailers.
                  </p>
                </Reveal>
                <Reveal delay={280}>
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                    <Button asChild variant="accent" size="lg">
                      <Link href="/caelum-star">
                        View {site.productBrandName} <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                        Buy on Amazon
                      </a>
                    </Button>
                  </div>
                </Reveal>
              </div>

              <div className="md:col-span-7">
                <Reveal variant="media" delay={140}>
                  <HorizontalCarousel
                    scrollerClassName="flex gap-6 overflow-x-auto pb-3 pt-1 scroll-smooth snap-x snap-mandatory cursor-grab active:cursor-grabbing"
                  >
                    {products.map((product) => (
                      <div key={product.slug} className="shrink-0 snap-start">
                        <ProductFeatureCard product={product} className="motion-safe:hover:scale-[1.01]" />
                      </div>
                    ))}
                  </HorizontalCarousel>
                </Reveal>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
