import Link from 'next/link';
import styles from '../caelumStarLanding.module.css';

const columns = [
  {
    heading: 'Explore',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Caelum Star', href: '/caelum-star' },
      { label: 'Packs', href: '/caelum-star/products' },
      { label: 'Where to buy', href: '/caelum-star/where-to-buy' }
    ]
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Support', href: '/support' }
    ]
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' }
    ]
  }
];

export function CaelumStarFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.contentWrap}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrandCol}>
            <span className={styles.footerBrandName}>Caelum Star</span>
            <p className={styles.footerBrandDesc}>Premium extra large dust sheets for professional results.</p>
            <p className={styles.footerContact}>
              Contact: <a href="mailto:support@targonglobal.com" className={styles.footerContactLink}>support@targonglobal.com</a>
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.heading} className={styles.footerLinkCol}>
              <h3 className={styles.footerColHeading}>{col.heading}</h3>
              <ul className={styles.footerColList}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={styles.footerLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.copyright}>© 2026 Caelum Star. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
