'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function HorizontalCarousel({
  children,
  className,
  scrollerClassName
}: {
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const update = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollLeft(scroller.scrollLeft > 2);
    setCanScrollRight(scroller.scrollLeft < maxScrollLeft - 2);
  };

  useEffect(() => {
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollByViewport = (direction: 'left' | 'right') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const amount = Math.round(scroller.clientWidth * 0.9);
    scroller.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-black to-transparent transition-opacity duration-500',
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-black to-transparent transition-opacity duration-500',
          canScrollRight ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />

      {canScrollLeft ? (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollByViewport('left')}
          className="absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-pill border border-white/15 bg-black/35 text-white shadow-softer backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg md:inline-flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollByViewport('right')}
          className="absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-pill border border-white/15 bg-black/35 text-white shadow-softer backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg md:inline-flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <div ref={scrollerRef} className={cn(scrollerClassName)} onScroll={update}>
        {children}
      </div>
    </div>
  );
}
