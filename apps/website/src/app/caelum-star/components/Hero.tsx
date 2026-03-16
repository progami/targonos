import type { ReactNode } from 'react';
import Image from 'next/image';
import styles from '../caelumStarLanding.module.css';

type CaelumStarHeroProps = {
  children?: ReactNode;
};

export function CaelumStarHero({ children }: CaelumStarHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.contentWrap}>
        <div className={styles.heroGrid}>
          <div className={`${styles.heroCopy} ${styles.fadeIn}`}>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroHighlight}>EXTRA LARGE</span>
              <span className={styles.heroSheets}> dust sheets</span>
            </h1>
            <p className={styles.heroSubheading}>Premium Protection for Professional Results.</p>
          </div>

          <div className={`${styles.heroVisual} ${styles.fadeInDelay}`}>
            <div className={styles.imageFrame}>
              <Image
                src="/images/dust-sheets-without-background.png"
                alt="Caelum Star Extra Large Dust Sheets"
                width={360}
                height={360}
                className={styles.heroImage}
                priority
              />
            </div>
          </div>

          {children ? <div className={styles.regionSlot}>{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
