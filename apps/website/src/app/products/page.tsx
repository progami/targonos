import { Container } from '@/components/Container';
import { ProductCard } from '@/components/ProductCard';
import { products } from '@/content/products';

export const metadata = {
  title: 'Products'
};

export default function ProductsPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Products</h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            A focused lineup with clear differences. Choose the tier that matches your work style and coverage needs.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
