import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  Globe,
  Heart,
  Leaf,
  Mail,
  Shield,
  Sparkles,
  Target
} from 'lucide-react';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';
import { CaelumStarHeader } from '../caelum-star/components/Header';
import { CaelumStarFooter } from '../caelum-star/components/Footer';

export const metadata = {
  title: 'About'
};

const values = [
  {
    icon: Target,
    title: 'Coverage First',
    desc: 'Extra-large sheets designed for real rooms. Big enough for sofas, beds, and full floor areas.'
  },
  {
    icon: Eye,
    title: 'Clarity Always',
    desc: 'Simple pack options, honest specs, clear pricing. No guesswork, no fine print.'
  },
  {
    icon: Leaf,
    title: 'Sustainability Built In',
    desc: '55% recycled plastic, GRS certified. Eco-kind packaging as standard.'
  },
  {
    icon: Heart,
    title: 'Support That Replies',
    desc: 'Real people, real answers. Email us anytime and we\'ll help you find the right pack.'
  }
];

export default function AboutPage() {
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
      <section className="cs-prussian-hero relative min-h-[calc(100vh-88px)] overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/images/home/value-simplicity.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1
          }}
        />
        <div className="cs-hero-ambient" />

        <Container className="relative z-10">
          <div className="py-[clamp(4rem,8vw,7rem)]">
            <Reveal delay={0}>
              <p className="cs-overline text-[#3AF3FF]">Company</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-4 text-balance text-[clamp(3rem,6.5vw,4rem)] 2xl:text-[clamp(4rem,4.5vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.02em] text-white" style={{ textShadow: '0 0 40px rgba(58, 243, 255, 0.12)' }}>
                Built for Clean Work.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-white/60 md:text-lg 2xl:max-w-2xl 2xl:text-xl">
                {site.name} builds protection products for decorating. Big coverage, simple choices, clear details — available on Amazon worldwide.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="cs-hero-stats mt-10">
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">12×9</span>
                  <span className="cs-hero-stat-label">ft Per Sheet</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">55%</span>
                  <span className="cs-hero-stat-label">Recycled</span>
                </div>
                <div className="cs-hero-stat">
                  <span className="cs-hero-stat-value">GRS</span>
                  <span className="cs-hero-stat-label">Certified</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg" className="cs-btn-glow">
                  <Link href="/caelum-star/products">
                    Browse Packs <ArrowRight className="cs-arrow-slide h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  <Link href="/caelum-star">Caelum Star</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── MISSION ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/mission-abstract.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.08
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(58, 243, 255, 0.05), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          {/* Centered heading */}
          <Reveal>
            <p className="cs-overline text-center text-lg text-[#3AF3FF]">Our Mission</p>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              Protection Made Simple
            </h2>
          </Reveal>

          <div className="mt-14 grid items-center gap-14 md:grid-cols-12">
            {/* Image — left side */}
            <div className="md:col-span-5">
              <Reveal variant="media" delay={100}>
                <Image
                  src="/images/home/6 Pk - Img 5.jpg"
                  alt="Caelum Star dust sheet pack"
                  width={600}
                  height={600}
                  className="w-full h-auto rounded-[20px]"
                  sizes="(min-width: 768px) 460px, 100vw"
                />
              </Reveal>
            </div>

            {/* Text — right side */}
            <div className="md:col-span-7">
              <Reveal delay={150}>
                <div className="space-y-5 text-base leading-relaxed text-white/55 2xl:text-lg">
                  <p className="text-lg text-white/70">
                    We believe protecting your space shouldn&apos;t be complicated. One product, four pack sizes, honest specs — that&apos;s it.
                  </p>
                  <p>
                    Every Caelum Star sheet is extra-large at 12ft × 9ft, made with 55% recycled plastic, and globally certified. We focus on what matters: coverage that works and details you can trust.
                  </p>
                  <p>
                    We sell on Amazon so you get fast shipping, easy returns, and real reviews from real customers.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── VALUES ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div className="absolute inset-0 bg-[#0B273F]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/value-efficiency.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.06
          }}
        />

        <Container className="relative z-10">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="h-6 w-6 text-[#3AF3FF]" />
              <p className="cs-overline text-lg text-[#3AF3FF]">What We Stand For</p>
            </div>
            <h2 className="mt-3 text-center text-[clamp(1.75rem,4vw,2.625rem)] 2xl:text-[clamp(2.625rem,3vw,3.5rem)] font-bold tracking-[-0.01em] text-white">
              Our Values
            </h2>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-5xl 2xl:max-w-7xl gap-6 sm:grid-cols-2">
            {values.map((v, i) => (
              <Reveal key={v.title} variant="media" delay={i * 100}>
                <div className="cs-step-card group flex h-full gap-5 text-left">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#3AF3FF]/20 bg-[#3AF3FF]/10 transition-all duration-300 group-hover:border-[#3AF3FF]/40 group-hover:bg-[#3AF3FF]/15">
                    <v.icon className="h-6 w-6 text-[#3AF3FF]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-[-0.01em] text-white">{v.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/50">{v.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── SALES CHANNELS ─── */}
      <section className="relative overflow-hidden py-[clamp(3rem,6vw,4.5rem)]">
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
              <div className="flex items-center gap-2.5">
                <Globe className="h-5 w-5 text-[#3AF3FF]" />
                <span className="text-sm font-semibold tracking-wide text-white/70">Available Worldwide</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Shield className="h-5 w-5 text-[#3AF3FF]" />
                <span className="text-sm font-semibold tracking-wide text-white/70">Amazon Verified</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Leaf className="h-5 w-5 text-[#3AF3FF]" />
                <span className="text-sm font-semibold tracking-wide text-white/70">GRS Certified</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="h-5 w-5 text-[#3AF3FF]" />
                <span className="text-sm font-semibold tracking-wide text-white/70">Direct Support</span>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── CONTACT + CTA ─── */}
      <section className="relative overflow-hidden py-[clamp(5rem,10vw,7.5rem)]">
        <div className="absolute inset-0 bg-[#0B273F]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/images/home/purpose-laptop.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.08
          }}
        />

        <Container className="relative z-10">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Contact Card */}
            <Reveal variant="media">
              <div className="cs-retailer-card cs-retailer-card--primary flex h-full flex-col">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3AF3FF]/15">
                  <Mail className="h-7 w-7 text-[#3AF3FF]" />
                </div>
                <h3 className="mt-6 text-2xl font-bold tracking-[-0.01em] text-white">Get in Touch</h3>
                <p className="mt-3 text-base leading-relaxed text-white/55">
                  Questions about our products, wholesale enquiries, or just want to say hello? We&apos;d love to hear from you.
                </p>
                <div className="mt-auto pt-8">
                  <Button asChild variant="accent" size="lg" className="cs-btn-glow w-full">
                    <a href={`mailto:${site.contactEmail}`}>
                      {site.contactEmail} <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </Reveal>

            {/* Shop Card */}
            <Reveal variant="media" delay={150}>
              <div className="cs-retailer-card flex h-full flex-col">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <Sparkles className="h-7 w-7 text-white/60" />
                </div>
                <h3 className="mt-6 text-2xl font-bold tracking-[-0.01em] text-white">Ready to Protect?</h3>
                <p className="mt-3 text-base leading-relaxed text-white/55">
                  Compare all four packs, check specs and pricing, then buy on Amazon with fast delivery.
                </p>
                <div className="mt-auto pt-8 flex gap-3">
                  <Button asChild variant="outline" size="lg" className="flex-1 border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                    <Link href="/caelum-star/products">
                      View Packs <ArrowRight className="cs-arrow-slide h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="flex-1 border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                    <Link href="/caelum-star/where-to-buy">
                      Buy Now <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── FOOTER ─── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B273F] to-[#001220]" />
        <div className="relative z-10 [&>footer]:mt-0">
          <CaelumStarFooter />
        </div>
      </div>
    </div>
  );
}
