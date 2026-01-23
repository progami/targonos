import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Product } from '@/content/products';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="group overflow-hidden transition-shadow will-change-transform motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg">
      <div className="relative aspect-[3/2] w-full bg-white">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="object-contain p-6 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02] group-hover:brightness-[1.02]"
          sizes="(min-width: 768px) 650px, 100vw"
        />
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            {product.primary ? <Badge className="mb-3">Primary</Badge> : null}
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {product.packLabel} · {product.thicknessLabel}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tightish">{product.name}</div>
          </div>

          {product.price ? (
            <div className="text-sm font-semibold text-ink">{product.price}</div>
          ) : (
            <div className="text-xs font-semibold text-muted">On Amazon</div>
          )}
        </div>

        <div className="mt-2 text-sm font-semibold text-ink/80">{product.tagline}</div>
        {product.coverageLabel ? (
          <div className="mt-1 text-xs font-semibold text-muted">{product.coverageLabel} total coverage</div>
        ) : null}
        <p className="mt-3 text-sm text-muted">{product.description}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/products/${product.slug}`}>
              Learn more <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="accent" size="sm">
            <a href={product.amazonUrl} target="_blank" rel="noreferrer">
              Buy on Amazon <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
