'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function HorizontalCarousel({
  children,
  className,
  scrollerClassName,
  showDots = true
}: {
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
  showDots?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemCount = Children.count(children);

  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollLeft(scroller.scrollLeft > 2);
    setCanScrollRight(scroller.scrollLeft < maxScrollLeft - 2);

    // Calculate active dot based on scroll position
    if (itemCount > 1 && maxScrollLeft > 0) {
      const scrollProgress = scroller.scrollLeft / maxScrollLeft;
      const newIndex = Math.round(scrollProgress * (itemCount - 1));
      setActiveIndex(Math.min(Math.max(newIndex, 0), itemCount - 1));
    }
  }, [itemCount]);

  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller || itemCount <= 1) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const targetScroll = (index / (itemCount - 1)) * maxScrollLeft;
    scroller.scrollTo({ left: targetScroll, behavior: 'smooth' });
  }, [itemCount]);

  useEffect(() => {
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [update]);

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
          className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill border border-white/15 bg-black/35 text-white shadow-softer backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg md:h-10 md:w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollByViewport('right')}
          className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill border border-white/15 bg-black/35 text-white shadow-softer backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg md:h-10 md:w-10"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        className={cn('touch-pan-x overscroll-x-contain', scrollerClassName)}
        style={{ WebkitOverflowScrolling: 'touch' }}
        onScroll={update}
      >
        {children}
      </div>

      {/* Dot pagination - visible on mobile */}
      {showDots && itemCount > 1 && (
        <div className="mt-4 flex justify-center gap-2 md:hidden">
          {Array.from({ length: itemCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-300',
                i === activeIndex
                  ? 'w-6 bg-white'
                  : 'bg-white/40 hover:bg-white/60'
              )}
              aria-label={`Go to item ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
