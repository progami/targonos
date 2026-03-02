import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';

export const metadata = {
  title: 'Caelum Star'
};

export default function CaelumStarPage() {
  return (
    <div>
      <section className="cs-hero relative min-h-[70vh] overflow-hidden">
        <div className="cs-hero-ambient" />
        <Container className="relative z-10">
          <div className="flex flex-col items-center pb-20 pt-16 text-center md:pb-28 md:pt-24">
            <Reveal delay={0}>
              <Image
                src="/brand/cs/logo-on-dark.webp"
                alt="Caelum Star"
                width={520}
                height={120}
                className="h-auto w-[220px] max-w-full opacity-90 md:w-[260px]"
                priority
              />
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-6 text-balance text-[clamp(2.8rem,6vw,4.5rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white">
                Extra&#x2011;large dust sheets.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-white/50">
                Select your region to see products and pricing.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-12 grid w-full max-w-2xl gap-5 sm:grid-cols-2">
                <Link
                  href="/caelum-star-us"
                  className="group flex flex-col items-center rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-8 py-10 text-center transition-all duration-300 hover:border-accent/25 hover:bg-white/10"
                >
                  <span className="text-5xl">&#x1F1FA;&#x1F1F8;</span>
                  <span className="mt-4 text-xl font-bold tracking-tight text-white">
                    United States
                  </span>
                  <span className="mt-2 text-sm text-white/50">
                    Amazon.com &middot; USD pricing
                  </span>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent/70 transition group-hover:text-accent">
                    View US products <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>

                <Link
                  href="/caelum-star-uk"
                  className="group flex flex-col items-center rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-8 py-10 text-center transition-all duration-300 hover:border-accent/25 hover:bg-white/10"
                >
                  <span className="text-5xl">&#x1F1EC;&#x1F1E7;</span>
                  <span className="mt-4 text-xl font-bold tracking-tight text-white">
                    United Kingdom
                  </span>
                  <span className="mt-2 text-sm text-white/50">
                    Amazon.co.uk &middot; GBP pricing
                  </span>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent/70 transition group-hover:text-accent">
                    View UK products <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button asChild variant="outline" className="border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]">
                  <Link href="/products">Compare packs</Link>
                </Button>
                <Button asChild variant="ghost" className="text-white/60 hover:text-white">
                  <Link href="/support">
                    Need help? <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
        <div className="cs-hero-fade" />
      </section>
    </div>
  );
}
