import type { RegionImages } from '../CaelumStarContent';
import { CaelumStarContent } from '../CaelumStarContent';
import { productsUK } from '@/content/products';

export const metadata = {
  title: 'Caelum Star — UK'
};

const ukImages: RegionImages = {
  pickProtection: '/images/amazon/pick-protection.webp',
  fitCoverage: '/images/amazon/fit-coverage.webp',
  generalProjects: '/images/amazon/uk/6pk-light-lifestyle.webp',
  multiRoomProjects: '/images/amazon/uk/12pk-light-lifestyle.webp',
  applications: '/images/amazon/applications.webp',
  strongVsLight: '/images/amazon/strong-vs-light.webp',
  benefits: '/images/amazon/aplus-4.webp',
  sustainableProcess: '/images/amazon/sustainable-process.webp',
  sustainableEfficiency: '/images/amazon/sustainable-efficiency.webp'
};

export default function CaelumStarUKPage() {
  return <CaelumStarContent images={ukImages} products={productsUK} />;
}
