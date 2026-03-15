import Link from 'next/link';
import styles from '../caelumStarLanding.module.css';

type RegionCardProps = {
  flag: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  href: string;
  external?: boolean;
};

export function CaelumStarRegionCard({
  flag,
  title,
  subtitle,
  buttonLabel,
  href,
  external
}: RegionCardProps) {
  return (
    <article className={`${styles.regionCard} ${styles.fadeIn}`}>
      <span aria-hidden className={styles.regionFlag}>
        {flag}
      </span>
      <h2 className={styles.regionTitle}>{title}</h2>
      <p className={styles.regionSubtitle}>{subtitle}</p>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={styles.regionButton}>
          {buttonLabel}
        </a>
      ) : (
        <Link href={href} className={styles.regionButton}>
          {buttonLabel}
        </Link>
      )}
    </article>
  );
}
