import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Leaf,
  Recycle,
  Ruler,
  Truck
} from 'lucide-react';
import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { products, productsUK } from '@/content/products';
import { site } from '@/content/site';
import { CaelumStarHeader } from '../components/Header';
import { CaelumStarFooter } from '../components/Footer';

export const metadata = {
  title: 'Packs'
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const { region } = await searchParams;
  const isUK = region === 'uk';
  const isUS = region === 'us';
  const catalog = isUK ? productsUK : products;
  const regionQuery = region ? `?region=${region}` : '';
  return (
    <div className="cs-scroll-wrap">
      <CaelumStarHeader region={region} />

      <style
        dangerouslySetInnerHTML={{
          __html: `
            body > header,
            main#main-content + footer,
            a[href="#main-content"] {
              display: none;
            }
          `
        }}
      />

      {/* ─── HERO ─── */}
      <section className="cs-prussian-hero relative overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/images/home/6%20Pk%20-%20Img%205.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.12
          }}
        />
        <div className="cs-hero-ambient" />

        <Container className="relative z-10">
          <div className="cs-section--hero">
            <Reveal delay={0}>
              <p className="cs-overline text-[#3AF3FF]">Our Range</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-4 text-balance text-[clamp(3rem,6.5vw,4.5rem)] 2xl:text-[clamp(4rem,4.5vw,6rem)] font-extrabold leading-[0.92] tracking-[-0.02em] text-white" style={{ textShadow: '0 0 40px rgba(58, 243, 255, 0.12)' }}>
                {isUK ? 'Dust Sheet Packs.' : 'Drop Cloth Packs.'}
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-white/60 md:text-lg 2xl:max-w-xl 2xl:text-[1.25rem]">
                Pick your coverage. Four pack sizes, one extra large {isUS ? 'drop cloth' : 'sheet'}. Available exclusively on Amazon.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="cs-hero-stats mt-10">
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">4</span>
                  <span className="cs-hero-stat-label">Pack Options</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">12×9</span>
                  <span className="cs-hero-stat-label">ft Per Sheet</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">55%</span>
                  <span className="cs-hero-stat-label">Recycled</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                  <Link href={`/caelum-star/where-to-buy${regionQuery}`}>
                    Where to Buy <ArrowRight className="cs-arrow-slide h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  <Link href="/caelum-star">About Caelum Star</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── PRODUCT GRID ─── */}
      <section className="cs-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/value-curiosity.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(58, 243, 255, 0.04), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <p className="cs-overline text-center text-[#3AF3FF]">Compare</p>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              Choose Your Pack
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-white/45 2xl:text-lg">
              Every {isUS ? 'drop cloth' : 'sheet'} is 12ft × 9ft. Choose the pack that fits your project.
            </p>
          </Reveal>

          <div className="cs-product-showcase mt-14">
            {catalog.map((p, i) => (
              <Reveal key={p.slug} variant="media" delay={i * 100} className="h-full">
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={440}>
            <p className="mt-6 text-center text-sm text-white/50">
              Prices shown are RRP. Actual prices may vary by retailer.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* ─── QUICK FACTS ─── */}
      <section className="cs-section--compact relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0B273F]" />
        <Container className="relative z-10">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
              <div className="cs-glass-card flex items-center gap-3">
                <Ruler className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                <span className="text-base text-white/80">All {isUS ? 'drop cloths' : 'sheets'}: 12ft × 9ft (3.6m × 2.7m)</span>
              </div>
              <div className="cs-glass-card flex items-center gap-3">
                <Recycle className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                <span className="text-base text-white/80">55% recycled plastic (GRS certified)</span>
              </div>
              <div className="cs-glass-card flex items-center gap-3">
                <Truck className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                <span className="text-base text-white/80">Fast Amazon delivery</span>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── WHY CAELUM STAR ─── */}
      <section className="cs-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(58, 243, 255, 0.03), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <Leaf className="h-6 w-6 text-[#3AF3FF]" />
              <p className="cs-overline text-lg text-[#3AF3FF]">Why Caelum Star</p>
            </div>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              Built Different
            </h2>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-4xl 2xl:max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Extra Large', desc: `Every ${isUS ? 'drop cloth' : 'sheet'} is 12ft × 9ft — bigger than standard alternatives.` },
              { title: 'Recycled Material', desc: '55% recycled plastic with GRS certification.' },
              { title: 'Fast Delivery', desc: 'Available on Amazon with Prime delivery options.' },
              { title: 'Easy Cleanup', desc: 'Fold, store, reuse. Designed for quick setup and teardown.' },
              { title: 'Pack Options', desc: `From 1 ${isUS ? 'drop cloth' : 'sheet'} to 12 — pick the size for your project.` },
              { title: 'Eco Packaging', desc: 'Eco-kind packaging as standard across all packs.' }
            ].map((item, i) => (
              <Reveal key={item.title} variant="media" delay={i * 80} className="h-full">
                <div className="cs-step-card group flex h-full flex-col items-center text-center">
                  <h3 className="text-lg font-bold tracking-[-0.01em] text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50 2xl:text-base">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── CTA + FOOTER ─── */}
      <div className="cs-snap-section relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/mission-abstract.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.08
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#012D44] via-[#012D44]/95 to-[#001220]" />

        <section className="cs-section--compact relative z-10">
          <Container>
            <Reveal variant="media">
              <div className="relative overflow-hidden rounded-[20px] border border-white/10 p-10 shadow-lg md:p-14" style={{ background: 'rgba(230, 250, 255, 0.05)', backdropFilter: 'blur(12px)' }}>
                <div
                  className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full opacity-30"
                  style={{
                    background: 'radial-gradient(circle, rgba(58,243,255,0.35), transparent 70%)',
                    filter: 'blur(40px)'
                  }}
                />

                <div className="relative z-10 grid gap-8 md:grid-cols-12 md:items-center">
                  <div className="md:col-span-8">
                    <h3 className="text-balance text-[clamp(1.5rem,3.2vw,2.25rem)] 2xl:text-[clamp(2.25rem,2.5vw,3rem)] font-bold leading-tight tracking-[-0.02em] text-white">
                      Not sure which pack to get?
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-white/50">
                      Email{' '}
                      <a
                        className="font-semibold text-[#3AF3FF] underline decoration-[#3AF3FF]/30 underline-offset-2 transition hover:decoration-[#3AF3FF]"
                        href={`mailto:${site.contactEmail}`}
                      >
                        {site.contactEmail}
                      </a>{' '}
                      or visit our{' '}
                      <Link
                        href="/support"
                        className="font-semibold text-[#3AF3FF] underline decoration-[#3AF3FF]/30 underline-offset-2 transition hover:decoration-[#3AF3FF]"
                      >
                        support page
                      </Link>
                      .
                    </p>
                  </div>
                  <div className="md:col-span-4 md:flex md:justify-end">
                    <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                      <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                        Buy Now <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        <div className="relative z-10 [&>footer]:mt-0">
          <CaelumStarFooter />
        </div>
      </div>
    </div>
  );
}
