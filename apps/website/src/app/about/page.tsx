import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';

export const metadata = {
  title: 'About'
};

export default function AboutPage() {
  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="pg-hero relative overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="pb-16 pt-14 md:pb-24 md:pt-20">
            <Reveal>
              <p className="cs-overline text-accent">Company</p>
              <h1 className="mt-3 text-balance text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                About.
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-4 max-w-2xl text-base text-white/50 md:text-lg">
                {site.name} builds protection products for decorating.
              </p>
            </Reveal>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>

      {/* ─── CONTENT ─── */}
      <section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-6 md:grid-cols-12 md:items-start">
            <div className="md:col-span-7">
              <Reveal variant="media">
                <Card className="p-8">
                  <p className="cs-overline text-accent-strong">Our mission</p>
                  <h2 className="mt-2 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">Built for clean work.</h2>
                  <div className="mt-5 space-y-3 text-sm text-muted md:text-base">
                    <p>Big coverage. Simple choices. Clear details.</p>
                    <p>Extra-large dust sheets designed for fast setup and easy cleanup.</p>
                    <p>Available through authorized retailers worldwide.</p>
                  </div>
                </Card>
              </Reveal>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Reveal variant="media" delay={0}>
                  <Card className="p-6">
                    <div className="text-sm font-semibold text-ink">What we care about</div>
                    <div className="mt-4 space-y-2 text-sm text-muted">
                      <p>Coverage that&apos;s actually extra-large.</p>
                      <p>Details that are easy to understand.</p>
                      <p>Support that replies.</p>
                    </div>
                  </Card>
                </Reveal>
                <Reveal variant="media" delay={120}>
                  <Card className="p-6">
                    <div className="text-sm font-semibold text-ink">Need help?</div>
                    <p className="mt-2 text-sm text-muted">Email us anytime.</p>
                    <p className="mt-4 text-sm">
                      <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>
                        {site.contactEmail}
                      </a>
                    </p>
                  </Card>
                </Reveal>
              </div>
            </div>

            <div className="md:col-span-5">
              <Reveal variant="media" delay={100}>
                <Card className="group overflow-hidden">
                  <div className="relative aspect-[4/5]">
                    <Image
                      src="/images/unsplash/painting-setup.webp"
                      alt="Decorating setup"
                      fill
                      className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105"
                      sizes="(min-width: 768px) 520px, 100vw"
                    />
                  </div>
                </Card>
              </Reveal>

              <Reveal variant="media" delay={220}>
                <Card className="mt-6 p-6">
                  <div className="text-sm font-semibold text-ink">Sales channels</div>
                  <p className="mt-2 text-sm text-muted">We sell on Amazon. Pricing and availability stay live there.</p>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── CTA ─── */}
      <section className="pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-[28px] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Ready to protect your space?
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Browse our packs and find your fit.
                  </p>
                </div>
                <div className="md:col-span-4 md:flex md:justify-end">
                  <Button asChild variant="accent" size="lg">
                    <Link href="/caelum-star/products">
                      Browse packs <ArrowRight className="h-4 w-4" />
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
