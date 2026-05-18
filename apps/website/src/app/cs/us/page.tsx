import { PacksPageContent } from '../components/PacksPageContent';
import { products } from '@/content/products';

export const metadata = {
  title: 'Caelum Star US'
};

export default function CsUsPage() {
  return (
    <PacksPageContent
      catalog={products}
      copy={{
        description: 'Reliable protection for painting, decorating, DIY and renovation projects.',
        marketLabel: 'US',
        title: 'Premium Plastic Drop Cloth Packs'
      }}
    />
  );
}
