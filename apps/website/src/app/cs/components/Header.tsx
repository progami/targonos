import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';
import styles from '../caelumStarLanding.module.css';

export function CaelumStarHeader({ region }: { region: 'us' | 'uk' }) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.contentWrap}>
        <div className={styles.headerTopRow}>
          <div className="flex items-center gap-4">
            <a href="https://targonglobal.com" className="opacity-50 transition-opacity hover:opacity-100">
              <Image src="/brand/logo-inverted.svg" alt="Targon" width={107} height={28} className="h-5 w-auto sm:h-7" />
            </a>
            <span className="text-white/20 text-lg">|</span>
            <Link href="/cs" className={styles.brandWrap}>
              <Image src="/logos/caelum-star-white.png" alt="Caelum Star logo" width={124} height={28} priority className="h-6 w-auto sm:h-7" />
            </Link>
          </div>

          <a href={region === 'uk' ? 'https://www.amazon.co.uk/dp/B09HXC3NL8' : site.amazonStoreUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
            Buy Now
          </a>
        </div>
      </div>
    </header>
  );
}
