import Link from 'next/link';
import styles from '../caelumStarLanding.module.css';

type RegionCardProps = {
  flag: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  href: string;
};

export function CaelumStarRegionCard({
  flag,
  title,
  subtitle,
  buttonLabel,
  href
}: RegionCardProps) {
  return (
    <article className={`${styles.regionCard} ${styles.fadeIn}`}>
      <span aria-hidden className={styles.regionFlag}>
        {flag}
      </span>
      <h2 className={styles.regionTitle}>{title}</h2>
      <p className={styles.regionSubtitle}>{subtitle}</p>
      <Link href={href} className={styles.regionButton}>
        {buttonLabel}
      </Link>
    </article>
  );
}
