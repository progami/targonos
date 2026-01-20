import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Product } from '@/content/products';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[3/2] w-full">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="object-cover"
          sizes="(min-width: 768px) 500px, 100vw"
        />
      </div>
      <div className="p-6">
        <div className="text-lg font-semibold tracking-tightish">{product.name}</div>
        <div className="mt-1 text-sm text-muted">{product.tagline}</div>
        <p className="mt-3 text-sm text-muted">{product.description}</p>
        <div className="mt-5 flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/products/${product.slug}`}>
              Learn more <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="accent" size="sm">
            <Link href="/where-to-buy">Buy</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
