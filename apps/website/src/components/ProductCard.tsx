import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Product } from '@/content/products';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Card className={cn(
      "group overflow-hidden transition-shadow will-change-transform motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg",
      product.primary && "ring-2 ring-accent"
    )}>
      {/* Image */}
      <div className="relative aspect-[4/3] w-full bg-white">
        {product.primary && (
          <div className="absolute left-4 top-4 z-10 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
            Most Popular
          </div>
        )}
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="object-contain p-6 transition-all duration-500 ease-out group-hover:scale-[1.03]"
          sizes="(min-width: 768px) 450px, 100vw"
        />
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Name + Price row */}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold tracking-tight">{product.name}</h3>
          <div className="text-2xl font-bold text-accent">
            {product.price ?? <span className="text-base text-muted">See Amazon</span>}
          </div>
        </div>

        {/* Specs row */}
        <div className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span>{product.thicknessLabel} durability</span>
          <span className="text-border">|</span>
          <span>{product.coverageLabel} coverage</span>
        </div>

        {/* Tagline */}
        <p className="mt-3 text-sm text-muted">{product.tagline}</p>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <Button asChild variant="accent" size="sm" className="flex-1">
            <a href={product.amazonUrl} target="_blank" rel="noreferrer">
              Buy on Amazon <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
          <Link
            href={`/products/${product.slug}`}
            className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Details
          </Link>
        </div>
      </div>
    </Card>
  );
}
