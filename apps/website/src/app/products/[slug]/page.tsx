import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Check } from 'lucide-react';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { products, getProductBySlug, getProductSlugs } from '@/content/products';

export function generateStaticParams() {
  return getProductSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.image.src]
    }
  };
}

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const otherProducts = products.filter((p) => p.slug !== product.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Targon ${product.name}`,
    description: product.description,
    image: product.gallery.map((g) => g.src),
    brand: { '@type': 'Brand', name: 'Targon' },
    offers: {
      '@type': 'Offer',
      url: product.amazonUrl,
      availability: 'https://schema.org/InStock'
    }
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="pt-14 md:pt-20">
        <Container>
          <div className="grid gap-10 md:grid-cols-12 md:items-start">
            <div className="md:col-span-6">
              <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">{product.name}</h1>
              <p className="mt-3 text-base text-muted md:text-lg">{product.tagline}</p>
              <p className="mt-5 text-sm text-muted md:text-base">{product.description}</p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <a href={product.amazonUrl} target="_blank" rel="noreferrer">
                    Buy on Amazon <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/where-to-buy">Where to buy</Link>
                </Button>
              </div>

              <div className="mt-10 grid gap-2">
                {product.highlights.map((h) => (
                  <div key={h} className="flex items-start gap-2 text-sm text-muted">
                    <Check className="mt-0.5 h-4 w-4 text-ink" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-6">
              <Card className="overflow-hidden">
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={product.image.src}
                    alt={product.image.alt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 600px, 100vw"
                    priority
                  />
                </div>
              </Card>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {product.gallery.slice(0, 3).map((img) => (
                  <div key={img.src} className="relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-surface">
                    <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="200px" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="mt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Details</h2>
              <div className="mt-5 space-y-3 text-sm text-muted md:text-base">
                {product.longDescription.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>

            <div className="md:col-span-5">
              <Card className="p-6">
                <div className="text-sm font-semibold text-ink">Specs</div>
                <dl className="mt-4 space-y-3">
                  {product.specs.map((s) => (
                    <div key={s.label} className="flex items-start justify-between gap-6">
                      <dt className="text-sm text-muted">{s.label}</dt>
                      <dd className="text-sm font-semibold text-ink">{s.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/support">Support & care</Link>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>

      <section className="mt-20">
        <Container>
          <div className="flex items-end justify-between gap-6">
            <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">More products</h2>
            <Button asChild variant="outline">
              <Link href="/products">View all</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {otherProducts.slice(0, 3).map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="rounded-card border border-border bg-surface p-5 shadow-softer transition hover:-translate-y-0.5"
              >
                <div className="text-lg font-semibold tracking-tightish">{p.name}</div>
                <div className="mt-1 text-sm text-muted">{p.tagline}</div>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
