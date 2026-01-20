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
        'group relative flex h-[440px] w-[min(92vw,380px)] shrink-0 flex-col overflow-hidden rounded-card bg-black shadow-soft transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className
      )}
    >
      <div className="p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
          {product.name}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tightish text-white">
          {product.tagline}
        </div>
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/80">
          Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>

      <div className="relative mt-auto h-[260px]">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          className="object-cover opacity-95"
          sizes="380px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
    </Link>
  );
}
