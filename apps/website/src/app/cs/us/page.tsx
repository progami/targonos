import type { RegionImages } from '../CaelumStarContent';
import { CaelumStarContent } from '../CaelumStarContent';
import { products } from '@/content/products';

export const metadata = {
  title: 'Caelum Star — US'
};

const usImages: RegionImages = {
  pickProtection: '/images/amazon/pick-protection.webp',
  fitCoverage: '/images/amazon/fit-coverage.webp',
  generalProjects: '/images/amazon/general-projects.webp',
  multiRoomProjects: '/images/amazon/multi-room-projects.webp',
  applications: '/images/amazon/applications.webp',
  strongVsLight: '/images/amazon/strong-vs-light.webp',
  benefits: '/images/amazon/aplus-4.webp',
  sustainableProcess: '/images/amazon/sustainable-process.webp',
  sustainableEfficiency: '/images/amazon/sustainable-efficiency.webp'
};

export default function CsUsPage() {
  return <CaelumStarContent images={usImages} products={products} />;
}
