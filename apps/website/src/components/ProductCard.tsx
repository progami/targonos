import Image from 'next/image';
import { ArrowUpRight, Maximize2 } from 'lucide-react';
import type { Product } from '@/content/products';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

function DurabilityBars({ level }: { level: string }) {
  const filled = level === 'Strong' ? 3 : level === 'Standard' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('cs-durability-bar', i <= filled && 'cs-durability-bar--filled')}
        />
      ))}
    </span>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <div
      className={cn(
        'cs-product-card group flex h-full flex-col overflow-hidden rounded-card',
        'border border-white/20 shadow-lg',
        'backdrop-blur-3xl bg-ink/80 text-white',
        product.primary && 'ring-2 ring-accent'
      )}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {product.primary && <div className="cs-product-glow--strong" />}
        {product.primary && (
          <div className="cs-badge-shimmer absolute left-4 top-4 z-10 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
            Most Popular
          </div>
        )}
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="cs-card-image object-contain p-6"
          sizes="(min-width: 768px) 450px, 100vw"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        {/* Name */}
        <h3 className="text-xl font-semibold tracking-tight">{product.name}</h3>

        {/* Amazon-style pricing */}
        <div className="mt-2">
          {product.priceBadge && (
            <div className="mb-1.5 inline-block rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              {product.priceBadge}
            </div>
          )}
          <div className="flex items-baseline gap-2">
            {product.discount && (
              <span className="text-lg font-semibold text-red-400">{product.discount}</span>
            )}
            <span className="text-2xl font-bold text-white">
              <sup className="text-sm font-semibold">$</sup>
              {product.price?.replace('$', '').split('.')[0]}
              <sup className="text-sm font-semibold">{product.price?.split('.')[1]}</sup>
            </span>
            {product.unitPrice && (
              <span className="text-xs text-white/40">({product.unitPrice})</span>
            )}
          </div>
          {product.typicalPrice && (
            <div className="mt-0.5 text-xs text-white/40">
              Typical price: <span className="line-through">{product.typicalPrice}</span>
            </div>
          )}
        </div>

        {/* Specs row */}
        <div className="mt-3 flex items-center gap-3 text-sm text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <DurabilityBars level={product.thicknessLabel} />
            {product.thicknessLabel} durability
          </span>
          <span className="text-border">|</span>
          <span className="inline-flex items-center gap-1.5">
            <Maximize2 className="h-3 w-3 text-accent" />
            {product.coverageLabel} coverage
          </span>
        </div>

        {/* Tagline */}
        <p className="mt-2 text-sm text-white/60">{product.tagline}</p>

        {/* Actions */}
        <div className="mt-auto pt-4">
          <Button asChild variant="accent" size="sm" className="w-full">
            <a href={product.amazonUrl} target="_blank" rel="noreferrer">
              Buy Now <ArrowUpRight className="cs-buy-arrow h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
