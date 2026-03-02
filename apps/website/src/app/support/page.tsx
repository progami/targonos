import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { FAQ } from '@/components/FAQ';
import { site } from '@/content/site';
import { faqs } from '@/content/faqs';

export const metadata = {
  title: 'Support'
};

export default function SupportPage() {
  return (
    <div>
      {/* ─── HERO ─── */}
      <section className="pg-hero relative overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="pb-16 pt-14 md:pb-24 md:pt-20">
            <Reveal>
              <p className="cs-overline text-accent">Help</p>
              <h1 className="mt-3 text-balance text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                Support.
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-4 max-w-md text-base text-white/50 md:text-lg">
                Email us and we&apos;ll help.
              </p>
            </Reveal>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>

      {/* ─── CONTENT ─── */}
      <section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal variant="media">
                <Card className="p-6">
                  <div className="text-sm font-semibold text-ink">Email support</div>
                  <p className="mt-2 text-sm text-muted">Fastest help is email.</p>
                  <div className="mt-4">
                    <Button asChild variant="primary">
                      <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
                    </Button>
                  </div>
                  <div className="mt-4 text-xs text-muted">
                    Orders, payments, shipping and returns are handled on Amazon.
                  </div>
                </Card>
              </Reveal>

              <Reveal variant="media" delay={120}>
                <Card className="mt-6 p-6">
                  <div className="text-sm font-semibold text-ink">Where to buy</div>
                  <p className="mt-2 text-sm text-muted">
                    Compare packs here, then check out on Amazon.
                  </p>
                  <div className="mt-4">
                    <Button asChild variant="outline">
                      <Link href="/products">Compare packs</Link>
                    </Button>
                  </div>
                </Card>
              </Reveal>
            </div>

            <div className="md:col-span-7">
              <Reveal variant="media" delay={120}>
                <Card className="p-8">
                  <p className="cs-overline text-accent-strong">Quick guide</p>
                  <h2 className="mt-2 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">Using dust sheets</h2>
                  <div className="mt-6 space-y-4 text-sm text-muted md:text-base">
                    <p>
                      <strong className="text-ink">1) Cover first.</strong> Protect floors, furniture, and doorways before sanding or painting.
                    </p>
                    <p>
                      <strong className="text-ink">2) Tape edges.</strong> For best dust control, tape the perimeter and seams where sheets overlap.
                    </p>
                    <p>
                      <strong className="text-ink">3) Fold and store.</strong> After use, fold the sheet down and store it dry for the next job.
                    </p>
                    <p>
                      <strong className="text-ink">Safety note:</strong> Keep plastic sheeting away from babies and children.
                    </p>
                  </div>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── FAQ ─── Dark section */}
      <section className="cs-dark-section--navy py-20 md:py-28">
        <Container className="relative z-10">
          <Reveal>
            <p className="cs-overline text-accent">FAQ</p>
            <h2 className="mt-2 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white">
              Frequently asked questions
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/50">
              Quick answers to common questions about our dust sheets.
            </p>
          </Reveal>
          <Reveal variant="media" delay={120}>
            <div className="mt-8 space-y-3">
              <FAQ items={faqs} />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-12 pb-20">
        <Container>
          <Reveal variant="media">
            <div className="cs-support-card rounded-[28px] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <h3 className="text-balance text-[clamp(1.4rem,3vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-white">
                    Ready to get started?
                  </h3>
                  <p className="mt-3 text-sm text-white/50">
                    Compare packs, then buy on Amazon.
                  </p>
                </div>
                <div className="md:col-span-4 md:flex md:justify-end">
                  <Button asChild variant="accent" size="lg">
                    <Link href="/products">
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
