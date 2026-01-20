import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Product } from '@/content/products';
import { cn } from '@/lib/utils';

export function ProductFeatureCard({
  product,
  className
}: {
  product: Product;
  className?: string;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn(
        'group relative flex h-[460px] w-[min(92vw,420px)] shrink-0 flex-col overflow-hidden rounded-card bg-ink shadow-soft transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        product.primary && 'ring-1 ring-accent/40',
        className
      )}
    >
      <div className="p-6">
        {product.primary ? (
          <div className="mb-3 inline-flex items-center rounded-pill bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            Primary
          </div>
        ) : null}

        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
          {product.packLabel} · {product.thicknessLabel}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-4">
          <div className="text-3xl font-semibold tracking-tightish text-white">{product.name}</div>
          {product.price ? (
            <div className="text-sm font-semibold text-white/80">{product.price}</div>
          ) : (
            <div className="text-sm font-semibold text-white/60">On Amazon</div>
          )}
        </div>

        <div className="mt-2 text-lg font-semibold tracking-tightish text-white/90">
          {product.tagline}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/80">
          Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>

      <div className="relative mt-auto h-[270px] bg-white">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="object-contain p-6"
          sizes="420px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
    </Link>
  );
}
