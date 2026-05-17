import Image from 'next/image';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/Container';
import { Reveal } from '@/components/Reveal';
import type { Product } from '@/content/products';
import styles from './PacksPageContent.module.css';

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

function getRowClassName(product: Product) {
  if (product.primary) {
    return `${styles.packRow} ${styles.packRowPrimary}`;
  }

  return styles.packRow;
}

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
    <main className={styles.page}>
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
                    Buy {primaryProduct.name}
                    <span>{getProductPrice(primaryProduct)}</span>
                    <ArrowUpRight className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                  <a className={styles.secondaryCta} href="#packs">
                    Compare packs
                    <ArrowDown className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </Reveal>

            <Reveal variant="media" delay={100}>
              <div className={styles.heroProduct}>
                <div className={styles.productShelf} aria-hidden="true" />
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
              <p className={styles.kicker}>Compare</p>
              <h2>Pick the pack.</h2>
            </div>
          </Reveal>

          <div className={styles.packList}>
            {catalog.map((product, index) => (
              <Reveal key={product.slug} variant="media" delay={index * 35}>
                <article className={getRowClassName(product)}>
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
                    <div className={styles.packNameLine}>
                      <h3>{product.name} {product.thicknessLabel}</h3>
                      <strong>{getProductPrice(product)}</strong>
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
                    Buy
                    <ArrowUpRight className={styles.ctaIcon} aria-hidden="true" />
                  </a>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
