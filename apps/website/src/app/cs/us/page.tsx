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
        description: 'Pick the pack size. Check the price. Buy on Amazon.',
        marketLabel: 'US',
        title: 'Drop Cloth Packs'
      }}
    />
  );
}
