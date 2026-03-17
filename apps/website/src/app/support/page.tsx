import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  CircleCheck,
  HelpCircle,
  Layers,
  Mail,
  Package,
  Recycle,
  Scissors,
  ShieldCheck,
  Star,
  StretchHorizontal
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { FAQ } from '@/components/FAQ';
import { site } from '@/content/site';
import { faqs } from '@/content/faqs';
import { CaelumStarHeader } from '../caelum-star/components/Header';
import { CaelumStarFooter } from '../caelum-star/components/Footer';

export const metadata = {
  title: 'Support'
};

const steps = [
  {
    icon: Layers,
    title: 'Cover first',
    desc: 'Protect floors, furniture, and doorways before sanding or painting.'
  },
  {
    icon: StretchHorizontal,
    title: 'Tape edges',
    desc: 'For best dust control, tape the perimeter and seams where sheets overlap.'
  },
  {
    icon: Scissors,
    title: 'Fold and store',
    desc: 'After use, fold the sheet down and store it dry for the next job.'
  }
];

const trustPoints = [
  { icon: Recycle, label: '55% Recycled Plastic' },
  { icon: Award, label: 'GRS Certified' },
  { icon: Star, label: '4.5★ Amazon Rating' },
  { icon: ShieldCheck, label: 'Buyer Protected' }
];

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const { region } = await searchParams;
  const isUS = region === 'us';
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
            backgroundImage: "url('/images/home/value-innovation.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.12
          }}
        />
        <div className="cs-hero-ambient" />

        <Container className="relative z-10">
          <div className="cs-section--hero">
            <Reveal delay={0}>
              <p className="cs-overline text-[#3AF3FF]">Help Centre</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-4 text-balance text-[clamp(3rem,6.5vw,4rem)] 2xl:text-[clamp(4rem,4.5vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.02em] text-white" style={{ textShadow: '0 0 40px rgba(58, 243, 255, 0.12)' }}>
                We&apos;re Here to Help.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-white/60 md:text-lg 2xl:max-w-xl 2xl:text-xl">
                Got questions about our {isUS ? 'drop cloths' : 'dust sheets'}? Need help choosing the right pack? We&apos;ve got you covered.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                  <a href={`mailto:${site.contactEmail}`}>
                    <Mail className="h-4 w-4" /> Email Us
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  <a href="#faq">View FAQ</a>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── CONTACT CARDS ─── */}
      <section className="cs-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(58, 243, 255, 0.05), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <p className="cs-overline text-center text-lg text-[#3AF3FF]">Get in Touch</p>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              How Can We Help?
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {/* Email Support */}
            <Reveal variant="media" delay={100} className="h-full">
              <div className="cs-retailer-card cs-retailer-card--primary flex h-full flex-col">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3AF3FF]/15">
                  <Mail className="h-7 w-7 text-[#3AF3FF]" />
                </div>
                <h3 className="mt-6 text-xl font-bold tracking-[-0.01em] text-white">Email Support</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55 2xl:text-lg">
                  The fastest way to reach us. We typically respond within 24 hours.
                </p>
                <div className="mt-auto pt-8">
                  <Button asChild variant="accent" size="lg" className="cs-btn-glow w-full">
                    <a href={`mailto:${site.contactEmail}`}>
                      {site.contactEmail} <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <p className="mt-3 text-center text-xs text-white/35">
                    Orders, payments & returns are handled on Amazon
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Browse Packs */}
            <Reveal variant="media" delay={200} className="h-full">
              <div className="cs-retailer-card flex h-full flex-col">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <Package className="h-7 w-7 text-white/60" />
                </div>
                <h3 className="mt-6 text-xl font-bold tracking-[-0.01em] text-white">Compare Packs</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55 2xl:text-lg">
                  Not sure which pack to get? Compare all options side by side.
                </p>
                <div className="mt-auto pt-8">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  >
                    <Link href={`/caelum-star/products${regionQuery}`}>
                      View Packs <ArrowRight className="cs-arrow-slide h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>

            {/* Where to Buy */}
            <Reveal variant="media" delay={300} className="h-full">
              <div className="cs-retailer-card flex h-full flex-col">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <ShieldCheck className="h-7 w-7 text-white/60" />
                </div>
                <h3 className="mt-6 text-xl font-bold tracking-[-0.01em] text-white">Where to Buy</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55 2xl:text-lg">
                  Find direct Amazon links for every pack with fast delivery.
                </p>
                <div className="mt-auto pt-8">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  >
                    <Link href="/caelum-star/where-to-buy">
                      Shop Now <ArrowRight className="cs-arrow-slide h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── TRUSTED BY ─── */}
      <section className="cs-section--compact relative overflow-hidden">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(58, 243, 255, 0.03), transparent 70%)'
          }}
        />
        <Container className="relative z-10">
          <Reveal>
            <div className="cs-proof-strip">
              {trustPoints.map((tp) => (
                <div key={tp.label} className="flex items-center gap-2.5">
                  <tp.icon className="h-5 w-5 text-[#3AF3FF]" />
                  <span className="text-sm font-semibold tracking-wide text-white/70">{tp.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── QUICK GUIDE ─── */}
      <section className="cs-section relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/unsplash/painting-setup.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.06
          }}
        />
        <div className="absolute inset-0 bg-[#0B273F]" style={{ opacity: 0.96 }} />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <BookOpen className="h-6 w-6 text-[#3AF3FF]" />
              <p className="cs-overline text-lg text-[#3AF3FF]">Quick Guide</p>
            </div>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              {isUS ? 'Using Your Drop Cloths' : 'Using Your Dust Sheets'}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-white/45">
              Three simple steps for the best protection.
            </p>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-4xl 2xl:max-w-6xl gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <Reveal key={step.title} variant="media" delay={i * 120} className="h-full">
                <div className="cs-step-card group flex h-full flex-col items-center text-center">
                  <div className="relative">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[#3AF3FF]/20 bg-[#3AF3FF]/10 transition-all duration-300 group-hover:border-[#3AF3FF]/40 group-hover:bg-[#3AF3FF]/15">
                      <step.icon className="h-8 w-8 text-[#3AF3FF]" />
                    </div>
                    <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[#012D44]" style={{ background: 'linear-gradient(180deg, #3AF3FF, #00D1FF)', boxShadow: '0 0 12px rgba(58, 243, 255, 0.4)' }}>
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="mt-6 text-lg font-bold tracking-[-0.01em] text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={400}>
            <div className="mx-auto mt-14 max-w-md">
              <div className="cs-glass-card flex items-center gap-3">
                <CircleCheck className="h-5 w-5 shrink-0 text-[#3AF3FF]" />
                <span className="text-sm text-white/70">
                  <strong className="text-white">Safety note:</strong> Keep plastic sheeting away from babies and children.
                </span>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="cs-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0B273F]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/purpose-laptop.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(58, 243, 255, 0.04), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <HelpCircle className="h-6 w-6 text-[#3AF3FF]" />
              <p className="cs-overline text-lg text-[#3AF3FF]">FAQ</p>
            </div>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-white/45">
              Quick answers to common questions about our {isUS ? 'drop cloths' : 'dust sheets'}.
            </p>
          </Reveal>
          <Reveal variant="media" delay={120}>
            <div className="mx-auto mt-12 max-w-3xl 2xl:max-w-5xl">
              <FAQ items={faqs} variant="dark" />
            </div>
          </Reveal>
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
                      Ready to get started?
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-white/50">
                      Compare all packs and buy on Amazon with fast delivery.
                    </p>
                  </div>
                  <div className="md:col-span-4 md:flex md:justify-end">
                    <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                      <Link href={`/caelum-star/products${regionQuery}`}>
                        Browse Packs <ArrowRight className="cs-arrow-slide h-4 w-4" />
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
