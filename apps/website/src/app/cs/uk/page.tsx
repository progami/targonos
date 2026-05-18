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
        description: 'Reliable protection for painting, decorating, DIY and renovation projects.',
        marketLabel: 'UK',
        title: 'Premium Plastic Dust Sheet Packs'
      }}
    />
  );
}
