import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Globe,
  Leaf,
  Package,
  Recycle,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Truck,
  X,
  Zap
} from 'lucide-react';
import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { products } from '@/content/products';
import { site } from '@/content/site';
import { CaelumStarHeader } from '../components/Header';
import { CaelumStarFooter } from '../components/Footer';

const bySlug = (slug: string) => products.find((p) => p.slug === slug)?.amazonUrl;

const rawInternationalAmazonLinks = [
  { label: '6 Pack — Light', region: 'US', url: site.amazonStoreUrl },
  { label: '12 Pack — Light', region: 'US', url: bySlug('12pk-light') ?? site.amazonStoreAltUrl ?? '#' },
  { label: '1 Pack — Strong', region: 'US', url: bySlug('1pk-strong') ?? '#' },
  { label: '3 Pack — Standard', region: 'US', url: bySlug('3pk-standard') ?? '#' },
  site.amazonStoreAltUrl && site.amazonStoreAltUrl !== (bySlug('12pk-light') ?? '')
    ? { label: '12 Pack — Light (Alternate)', region: 'US', url: site.amazonStoreAltUrl }
    : null
].filter(Boolean) as { label: string; region: string; url: string }[];

const internationalAmazonLinks = Array.from(
  new Map(rawInternationalAmazonLinks.map((l) => [l.url, l])).values()
);

const comparisonRows = [
  { feature: 'Sheet size', caelum: '12ft × 9ft (extra large)', standard: 'Varies (often smaller)' },
  { feature: 'Recycled content', caelum: '55% recycled plastic', standard: 'Usually 0%' },
  { feature: 'GRS certified', caelum: true, standard: false },
  { feature: 'Coverage per pack', caelum: 'Up to 1296 sq ft', standard: 'Varies' },
  { feature: 'Eco-kind packaging', caelum: true, standard: false }
];

export const metadata = {
  title: 'Where to buy'
};

export default function WhereToBuyPage() {
  return (
    <div style={{ paddingTop: 88 }}>
      <CaelumStarHeader />

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
          <div className="pt-[clamp(4rem,8vw,7rem)] pb-[clamp(10rem,18vw,16rem)]">
            <Reveal delay={0}>
              <p className="cs-overline text-[#3AF3FF]">Purchase</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-4 text-balance text-[clamp(3rem,6.5vw,4rem)] font-extrabold leading-[0.92] tracking-[-0.02em] text-white" style={{ textShadow: '0 0 40px rgba(58, 243, 255, 0.12)' }}>
                Get Your Sheets.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-white/60 md:text-lg">
                Available exclusively on Amazon. Compare packs, pick your coverage, and get fast delivery to your door.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="cs-hero-stats mt-10">
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">4</span>
                  <span className="cs-hero-stat-label">Pack Options</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">55%</span>
                  <span className="cs-hero-stat-label">Recycled</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">12×9</span>
                  <span className="cs-hero-stat-label">ft Per Sheet</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                  <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                    Shop on Amazon <ArrowUpRight className="cs-arrow-slide h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  <Link href="/caelum-star/products">Compare Packs</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── RETAILERS ─── */}
      <section className="relative overflow-hidden pt-[clamp(7rem,12vw,10rem)] pb-[clamp(5rem,10vw,7.5rem)]">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(58, 243, 255, 0.05), transparent 70%)'
          }}
        />
        <Container className="relative z-10">
          <Reveal>
            <p className="cs-overline text-center text-lg text-[#3AF3FF]">Where to Buy</p>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.01em] text-white">
              Choose How You Shop
            </h2>
          </Reveal>

          <div className="mt-20 grid gap-8 md:grid-cols-2">
            {/* Amazon Card */}
            <Reveal variant="media" delay={100}>
              <div className="cs-retailer-card cs-retailer-card--primary flex h-full flex-col">
                <div className="cs-retailer-badge bg-[#3AF3FF]/15 text-[#3AF3FF]">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Official Retailer
                </div>
                <h3 className="mt-6 text-3xl font-bold tracking-[-0.01em] text-white">Amazon</h3>
                <p className="mt-3 text-base leading-relaxed text-white/55">
                  Our official retail partner. Fast shipping, easy returns, and trusted checkout.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-3 text-base text-white/65">
                    <Truck className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                    <span>Fast Prime delivery available</span>
                  </div>
                  <div className="flex items-center gap-3 text-base text-white/65">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                    <span>Secure checkout & buyer protection</span>
                  </div>
                  <div className="flex items-center gap-3 text-base text-white/65">
                    <Zap className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                    <span>All 4 packs in stock</span>
                  </div>
                </div>

                <div className="mt-auto pt-10">
                  <Button asChild variant="accent" size="lg" className="cs-btn-glow w-full">
                    <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer">
                      Buy on Amazon <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </Reveal>

            {/* Bulk / Wholesale Card */}
            <Reveal variant="media" delay={200}>
              <div className="cs-retailer-card flex h-full flex-col">
                <div className="cs-retailer-badge bg-white/10 text-white/70">
                  <Package className="h-3.5 w-3.5" />
                  Trade & Bulk
                </div>
                <h3 className="mt-6 text-3xl font-bold tracking-[-0.01em] text-white">Wholesale</h3>
                <p className="mt-3 text-base leading-relaxed text-white/55">
                  Need larger quantities for trade, facilities management, or recurring jobs? Get in touch for volume pricing.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-3 text-base text-white/65">
                    <Package className="h-5 w-5 shrink-0 text-white/40" />
                    <span>Custom volume orders</span>
                  </div>
                  <div className="flex items-center gap-3 text-base text-white/65">
                    <Globe className="h-5 w-5 shrink-0 text-white/40" />
                    <span>International availability</span>
                  </div>
                </div>

                <div className="mt-auto pt-10">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  >
                    <a href={`mailto:${site.contactEmail}`}>
                      Email {site.contactEmail}
                    </a>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── PRODUCT SHOWCASE ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/value-curiosity.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.12
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#012D44] via-[#0B273F]/80 to-[#012D44]" />

        <Container className="relative z-10">
          <Reveal>
            <p className="cs-overline text-center text-[#3AF3FF]">Pick Your Pack</p>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.01em] text-white">
              Compare & Buy
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-white/45">
              Every sheet is 12ft × 9ft. Choose the pack that fits your project.
            </p>
          </Reveal>

          <div className="cs-product-showcase mt-14">
            {products.map((p, i) => (
              <Reveal key={p.slug} variant="media" delay={i * 100}>
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

      {/* ─── WHY CAELUM STAR ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(58, 243, 255, 0.04), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <Leaf className="h-6 w-6 text-[#3AF3FF]" />
              <p className="cs-overline text-lg text-[#3AF3FF]">Why Caelum Star</p>
            </div>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.01em] text-white">
              Built Different
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-base text-white/45">
              See how Caelum Star compares to standard plastic sheets.
            </p>
          </Reveal>

          <Reveal variant="media" delay={150}>
            <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl">
              <table className="cs-compare-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Caelum Star</th>
                    <th>Standard Sheets</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.feature}>
                      <td>{row.feature}</td>
                      <td>
                        {typeof row.caelum === 'boolean' ? (
                          row.caelum ? (
                            <Check className="h-5 w-5 text-[#3AF3FF]" />
                          ) : (
                            <X className="h-5 w-5 text-white/25" />
                          )
                        ) : (
                          <span className="text-[#3AF3FF]">{row.caelum}</span>
                        )}
                      </td>
                      <td>
                        {typeof row.standard === 'boolean' ? (
                          row.standard ? (
                            <Check className="h-5 w-5 text-[#3AF3FF]" />
                          ) : (
                            <X className="h-5 w-5 text-white/25" />
                          )
                        ) : (
                          row.standard
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── QUICK FACTS ─── */}
      <section className="cs-dark-section--navy py-[clamp(3.5rem,6vw,5rem)]">
        <Container className="relative z-10">
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
              <div className="cs-glass-card flex items-center gap-3">
                <Ruler className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                <span className="text-base text-white/80">All sheets: 12ft × 9ft (3.6m × 2.7m)</span>
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

      {/* ─── INTERNATIONAL LINKS ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/mission-abstract.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.06
          }}
        />
        <div className="absolute inset-0 bg-[#012D44]/95" />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <Globe className="h-6 w-6 text-[#3AF3FF]" />
              <h2 className="text-center text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.01em] text-white">
                Direct Amazon Links
              </h2>
            </div>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-white/45">
              Quick links to each pack on Amazon.
            </p>
          </Reveal>

          <div className="mx-auto mt-12 max-w-3xl space-y-4">
            {internationalAmazonLinks.map((l, i) => (
              <Reveal key={`${l.label}-${l.url}`} delay={i * 80}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="cs-intl-link group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3AF3FF]/10">
                      <ShoppingCart className="h-4 w-4 text-[#3AF3FF]" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-white">{l.label}</div>
                      <div className="text-sm text-white/35">Amazon {l.region}</div>
                    </div>
                  </div>
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-white/30 transition-colors group-hover:text-[#3AF3FF]" />
                </a>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── SUPPORT CTA + FOOTER ─── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/unsplash/painting-setup.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.08
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#012D44] via-[#012D44]/95 to-[#001220]" />

        <section className="relative z-10 py-[clamp(3rem,6vw,5rem)]">
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
                    <h3 className="text-balance text-[clamp(1.5rem,3.2vw,2.25rem)] font-bold leading-tight tracking-[-0.02em] text-white">
                      Not sure which pack to get?
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-white/50">
                      Compare all options on our{' '}
                      <Link
                        href="/caelum-star/products"
                        className="font-semibold text-[#3AF3FF] underline decoration-[#3AF3FF]/30 underline-offset-2 transition hover:decoration-[#3AF3FF]"
                      >
                        Packs page
                      </Link>{' '}
                      or reach out to{' '}
                      <a
                        className="font-semibold text-[#3AF3FF] underline decoration-[#3AF3FF]/30 underline-offset-2 transition hover:decoration-[#3AF3FF]"
                        href={`mailto:${site.contactEmail}`}
                      >
                        {site.contactEmail}
                      </a>
                      .
                    </p>
                  </div>
                  <div className="md:col-span-4 md:flex md:justify-end">
                    <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                      <Link href="/support">
                        Get support <ArrowRight className="cs-arrow-slide h-4 w-4" />
                      </Link>
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
