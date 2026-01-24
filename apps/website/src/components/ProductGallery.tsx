'use client';

import Image from 'next/image';
import { Expand } from 'lucide-react';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { Lightbox, useLightbox } from '@/components/Lightbox';
import { cn } from '@/lib/utils';

type GalleryImage = {
  src: string;
  alt: string;
  variant?: 'wide' | 'square';
};

export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const lightbox = useLightbox();

  const lightboxImages = images.map((img) => ({
    src: img.src,
    alt: img.alt
  }));

  return (
    <>
      <div className="mt-8 grid gap-6 md:grid-cols-12">
        {images.map((img, i) => (
          <Reveal key={img.src} variant="media" delay={i * 80}>
            <button
              type="button"
              onClick={() => lightbox.open(i)}
              className={cn(
                'group relative w-full overflow-hidden rounded-card border border-border bg-surface shadow-softer transition-shadow duration-300 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                img.variant === 'wide' ? 'md:col-span-12' : 'md:col-span-6'
              )}
            >
              <div
                className={cn(
                  'relative bg-white',
                  img.variant === 'wide' ? 'aspect-[61/25]' : 'aspect-square'
                )}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={
                    img.variant === 'wide'
                      ? '(max-width: 768px) 100vw, 1440px'
                      : '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 820px'
                  }
                  className="object-contain transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.01]"
                />
                {/* Expand icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft transition-opacity duration-300 group-hover:opacity-100">
                    <Expand className="h-5 w-5 text-ink" />
                  </div>
                </div>
              </div>
            </button>
          </Reveal>
        ))}
      </div>

      {lightbox.isOpen && (
        <Lightbox
          images={lightboxImages}
          initialIndex={lightbox.initialIndex}
          onClose={lightbox.close}
        />
      )}
    </>
  );
}
