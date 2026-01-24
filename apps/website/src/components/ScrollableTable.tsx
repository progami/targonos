'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function ScrollableTable({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < maxScroll - 2);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* Left shadow */}
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface to-transparent transition-opacity duration-300',
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
      {/* Right shadow */}
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface to-transparent transition-opacity duration-300',
          canScrollRight ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        onScroll={updateScrollState}
      >
        {children}
      </div>
    </div>
  );
}
