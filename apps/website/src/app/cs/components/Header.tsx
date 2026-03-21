import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';
import styles from '../caelumStarLanding.module.css';

const navLinks = [
  { label: 'Packs', href: '/packs' },
  { label: 'Where to buy', href: '/where-to-buy' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Support', href: '/support' },
  { label: 'About', href: '/about' }
];

export function CaelumStarHeader({ hideNav = false, hideBuyNow = false, region }: { hideNav?: boolean; hideBuyNow?: boolean; region?: string }) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.contentWrap}>
        <div className={styles.headerTopRow}>
          <div className="flex items-center gap-4">
            <Link href="/" className="opacity-50 transition-opacity hover:opacity-100">
              <Image src="/brand/logo-inverted.svg" alt="Targon" width={80} height={16} className="h-4 w-auto" />
            </Link>
            <span className="text-white/20">|</span>
            <Link href="/cs" className={styles.brandWrap}>
              <Image src="/logos/caelum-star-white.png" alt="Caelum Star logo" width={186} height={42} className={styles.brandLogo} priority />
            </Link>
          </div>

          {!hideNav && region && (
            <nav aria-label="Main navigation" className={styles.headerNav}>
              {navLinks.map((link) => (
                <Link key={link.label} href={`/cs/${region}${link.href}`} className={styles.headerNavLink}>
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {!hideBuyNow && (
            <a href={region === 'uk' ? 'https://www.amazon.co.uk/dp/B09HXC3NL8' : site.amazonStoreUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
              Buy Now
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
