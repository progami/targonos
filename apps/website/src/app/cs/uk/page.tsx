import { PacksPageContent } from '../components/PacksPageContent';
import { productsUK } from '@/content/products';

export const metadata = {
  title: 'Caelum Star UK'
};

export default function CsUkPage() {
  return (
    <PacksPageContent
      catalog={productsUK}
      copy={{
        description: 'Pick the pack size. Check the price. Buy on Amazon.',
        marketLabel: 'UK',
        title: 'Dust Sheet Packs'
      }}
    />
  );
}
