import Image from 'next/image';
import { Container } from '@/components/Container';
import { Reveal } from '@/components/Reveal';
import { CaelumStarFooter } from '../../components/Footer';

export const metadata = {
  title: 'Gallery — Caelum Star US'
};

const galleryItems = [
  { src: '/images/gallery/us/1.png', alt: 'Caelum Star product design 1', date: 'March 2026' },
  { src: '/images/gallery/us/2.png', alt: 'Caelum Star product design 2', date: 'March 2026' },
  { src: '/images/gallery/us/3.png', alt: 'Caelum Star product design 3', date: 'March 2026' },
  { src: '/images/gallery/us/4.png', alt: 'Caelum Star product design 4', date: 'March 2026' },
  { src: '/images/gallery/us/5_.jpg', alt: 'Caelum Star product shot', date: 'March 2026' },
  { src: '/images/gallery/us/6.png', alt: 'Caelum Star product design 6', date: 'March 2026' },
  { src: '/images/gallery/us/merged.png', alt: 'Caelum Star product overview', date: 'March 2026' },
];

export default function GalleryPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="cs-prussian-hero relative overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/images/gallery/us/1.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1
          }}
        />
        <div className="cs-hero-ambient" />

        <Container className="relative z-10">
          <div className="cs-section--hero">
            <Reveal delay={0}>
              <p className="cs-overline text-[#3AF3FF]">Product Imagery</p>
            </Reveal>
            <Reveal delay={60}>
              <h1
                className="mt-4 text-balance text-[clamp(3rem,6.5vw,4rem)] 2xl:text-[clamp(4rem,4.5vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.02em] text-white"
                style={{ textShadow: '0 0 40px rgba(58, 243, 255, 0.12)' }}
              >
                Gallery
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-white/60 md:text-lg 2xl:max-w-2xl 2xl:text-xl">
                Official Caelum Star product visuals — United States.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── IMAGE GRID ─── */}
      <section className="cs-section relative overflow-hidden">
        <div className="absolute inset-0 bg-[#012D44]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(58, 243, 255, 0.05), transparent 70%)'
          }}
        />

        <Container className="relative z-10">
          {/* Individual images — 2-column grid on desktop, 1 column on mobile */}
          <div className="grid gap-8 md:grid-cols-2">
            {galleryItems
              .filter((item) => item.src !== '/images/gallery/us/merged.png')
              .map((item, i) => (
                <Reveal key={item.src} variant="media" delay={i * 80}>
                  <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      width={960}
                      height={720}
                      className="h-auto w-full"
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <p className="mt-3 text-sm text-white/40">{item.date}</p>
                </Reveal>
              ))}
          </div>

          {/* Merged composite — full width */}
          <div className="mt-8">
            <Reveal variant="media" delay={0}>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                <Image
                  src="/images/gallery/us/merged.png"
                  alt="Caelum Star product overview"
                  width={1920}
                  height={1080}
                  className="h-auto w-full"
                  sizes="100vw"
                />
              </div>
              <p className="mt-3 text-sm text-white/40">March 2026</p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ─── FOOTER ─── */}
      <div className="cs-snap-section relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B273F] to-[#001220]" />
        <div className="relative z-10 [&>footer]:mt-0">
          <CaelumStarFooter region="us" />
        </div>
      </div>
    </>
  );
}
