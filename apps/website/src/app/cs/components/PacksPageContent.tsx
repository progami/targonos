import Image from 'next/image';
import { Montserrat } from 'next/font/google';
import { ArrowDown, ArrowRight, CheckCircle2, Droplets, Expand, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Container } from '@/components/Container';
import { Reveal } from '@/components/Reveal';
import type { Product } from '@/content/products';
import styles from './PacksPageContent.module.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-cs-montserrat',
  display: 'swap'
});

type PacksPageCopy = {
  description: string;
  marketLabel: string;
  title: string;
};

function getProductPrice(product: Product) {
  if (!product.price) {
    throw new Error(`Missing price for ${product.slug}`);
  }

  return product.price;
}

function getProductCoverage(product: Product) {
  if (!product.coverageLabel) {
    throw new Error(`Missing coverage label for ${product.slug}`);
  }

  return product.coverageLabel;
}

function getMarketTrustLabel(marketLabel: string) {
  if (marketLabel === 'UK') {
    return 'Designed for the UK';
  }

  return 'Designed for the US';
}

const heroFeatures = [
  { label: 'Paint Protection', Icon: ShieldCheck },
  { label: 'Water Resistant', Icon: Droplets },
  { label: 'Dust & Debris Protection', Icon: Sparkles },
  { label: 'Generous Coverage', Icon: Expand }
];

export function PacksPageContent({
  catalog,
  copy
}: {
  catalog: Product[];
  copy: PacksPageCopy;
}) {
  const primaryProduct = catalog.find((product) => product.primary);

  if (!primaryProduct) {
    throw new Error('Missing primary pack product');
  }

  return (
    <main className={`${montserrat.variable} ${styles.page}`}>
      <section className={styles.hero}>
        <Container className={styles.heroContainer}>
          <div className={styles.heroGrid}>
            <Reveal>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>{copy.marketLabel} pack range</p>
                <h1 className={styles.title}>{copy.title}</h1>
                <p className={styles.description}>{copy.description}</p>

                <div className={styles.heroActions}>
                  <a className={styles.primaryCta} href={primaryProduct.amazonUrl} target="_blank" rel="noreferrer">
                    <span className={styles.amazonMark} aria-hidden="true">a</span>
                    Buy on Amazon
                    <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                  <a className={styles.secondaryCta} href="#packs">
                    <Scale className={styles.compareIcon} aria-hidden="true" />
                    Compare packs
                    <ArrowDown className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                </div>

                <div className={styles.featureStrip} aria-label="Product benefits">
                  {heroFeatures.map(({ label, Icon }) => (
                    <div className={styles.featureItem} key={label}>
                      <Icon className={styles.featureIcon} aria-hidden="true" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal variant="media" delay={100}>
              <div className={styles.heroProduct}>
                <Image
                  src={primaryProduct.image.src}
                  alt={primaryProduct.image.alt}
                  width={1200}
                  height={1200}
                  priority
                  className={styles.heroImage}
                  sizes="(min-width: 1200px) 520px, (min-width: 768px) 44vw, 86vw"
                />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <section id="packs" className={styles.packs}>
        <Container className={styles.packsContainer}>
          <Reveal>
            <div className={styles.packsIntro}>
              <p className={styles.kicker}>Compare & Choose</p>
              <h2>Pick the right pack for your project</h2>
            </div>
          </Reveal>

          <div className={styles.packGrid}>
            {catalog.map((product, index) => (
              <Reveal key={product.slug} variant="media" delay={index * 35}>
                <article className={styles.packCard}>
                  <div className={styles.packImageCell}>
                    <Image
                      src={product.image.src}
                      alt={product.image.alt}
                      width={1200}
                      height={1200}
                      className={styles.packImage}
                      sizes="112px"
                    />
                  </div>

                  <div className={styles.packDetails}>
                    <div className={styles.packNameBlock}>
                      <h3>{product.name} {product.thicknessLabel}</h3>
                      <div className={styles.priceLine}>
                        <strong>{getProductPrice(product)}</strong>
                        {product.priceBadge ? <span>{product.priceBadge}</span> : null}
                      </div>
                    </div>

                    <dl className={styles.packFacts}>
                      <div>
                        <dt>Coverage</dt>
                        <dd>{getProductCoverage(product)}</dd>
                      </div>
                      <div>
                        <dt>Durability</dt>
                        <dd>{product.thicknessLabel}</dd>
                      </div>
                    </dl>
                  </div>

                  <a className={styles.buyLink} href={product.amazonUrl} target="_blank" rel="noreferrer">
                    Buy on Amazon
                    <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                </article>
              </Reveal>
            ))}
          </div>

          <div className={styles.trustBar} aria-label="Caelum Star quality notes">
            <div className={styles.trustItem}>
              <span className={styles.flagBadge} aria-hidden="true">
                {copy.marketLabel === 'UK' ? '🇬🇧' : '🇺🇸'}
              </span>
              <div>
                <strong>{getMarketTrustLabel(copy.marketLabel)}</strong>
                <span>Sized for homes & projects</span>
              </div>
            </div>
            <div className={styles.trustItem}>
              <ShieldCheck className={styles.trustIcon} aria-hidden="true" />
              <div>
                <strong>Protects Surfaces</strong>
                <span>From paint, dust, spills & moisture</span>
              </div>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle2 className={styles.trustIcon} aria-hidden="true" />
              <div>
                <strong>Trusted Quality</strong>
                <span>Caelum Star by Targon</span>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
