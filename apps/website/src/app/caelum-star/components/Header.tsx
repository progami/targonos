import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';
import styles from '../caelumStarLanding.module.css';

const navLinks = [
  { label: 'Caelum Star', href: '/caelum-star' },
  { label: 'Packs', href: '/caelum-star/products' },
  { label: 'Where to buy', href: '/caelum-star/where-to-buy' },
  { label: 'Support', href: '/support' },
  { label: 'About', href: '/about' }
];

export function CaelumStarHeader() {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.contentWrap}>
        <div className={styles.headerTopRow}>
          <div className={styles.brandWrap}>
            <Image src="/logos/caelum-star-white.png" alt="Caelum Star logo" width={186} height={42} className={styles.brandLogo} priority />
          </div>

          <nav aria-label="Main navigation" className={styles.headerNav}>
            {navLinks.map((link) => (
              <Link key={link.label} href={link.href} className={styles.headerNavLink}>
                {link.label}
              </Link>
            ))}
          </nav>

          <a href={site.amazonStoreUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
            Buy 6 Pack
          </a>
        </div>
      </div>
    </header>
  );
}
