import Image from 'next/image';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';

export const metadata = {
  title: 'About'
};

export default function AboutPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">About.</h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">{site.name} builds protection products for decorating.</p>
          </Reveal>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-12 md:items-start">
            <div className="md:col-span-7">
              <Reveal variant="media">
                <Card className="p-8">
                  <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Built for clean work.</h2>
                  <div className="mt-5 space-y-3 text-sm text-muted md:text-base">
                    <p>Big coverage. Simple choices. Clear details.</p>
                    <p>We focus on extra-large dust sheets designed for fast setup and easy cleanup.</p>
                    <p>Checkout stays on Amazon for shipping and returns.</p>
                  </div>
                </Card>
              </Reveal>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Reveal variant="media" delay={0}>
                  <Card className="p-6">
                    <div className="text-sm font-semibold text-ink">What we care about</div>
                    <div className="mt-4 space-y-2 text-sm text-muted">
                      <p>Coverage that’s actually extra-large.</p>
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
                <Card className="overflow-hidden">
                  <div className="relative aspect-[4/5]">
                    <Image
                      src="/images/unsplash/painting-setup.webp"
                      alt="Decorating setup"
                      fill
                      className="object-cover"
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
    </div>
  );
}
