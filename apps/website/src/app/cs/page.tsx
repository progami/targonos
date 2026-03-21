import { CaelumStarHeader } from './components/Header';
import { CaelumStarHero } from './components/Hero';
import { CaelumStarRegionCard } from './components/RegionCard';
import { CaelumStarFooter } from './components/Footer';
import styles from './caelumStarLanding.module.css';

export const metadata = {
  title: 'Caelum Star'
};

const regions = [
  {
    flag: '\u{1F1FA}\u{1F1F8}',
    title: 'USA',
    subtitle: 'Free Shipping & Fast Delivery.\nSelect Region.',
    buttonLabel: 'Shop USA Store',
    href: '/cs/us/packs',
    external: false
  },
  {
    flag: '\u{1F1EC}\u{1F1E7}',
    title: 'UK & Europe',
    subtitle: 'Next Day Delivery Available.\nSelect Region.',
    buttonLabel: 'Shop UK Store',
    href: '/cs/uk/packs',
    external: false
  }
];

export default function CaelumStarPage() {
  return (
    <>
      <div className={styles.pageWrap}>
        <CaelumStarHeader />
        <CaelumStarHero>
          <div className={styles.regionGrid}>
            {regions.map((region) => (
              <CaelumStarRegionCard
                key={region.title}
                flag={region.flag}
                title={region.title}
                subtitle={region.subtitle}
                buttonLabel={region.buttonLabel}
                href={region.href}
                external={region.external}
              />
            ))}
          </div>
        </CaelumStarHero>

        <CaelumStarFooter />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            body > header,
            main#main-content + footer,
            a[href="#main-content"] {
              display: none;
            }
            body,
            main#main-content {
              background: #012d44;
              padding: 0;
              margin: 0;
            }
          `
        }}
      />

    </>
  );
}
