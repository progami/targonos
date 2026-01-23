'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'fade-up' | 'fade' | 'zoom' | 'media';

export function Reveal({
  children,
  className,
  variant = 'fade-up',
  delay = 0,
  duration = 780,
  once = true,
  threshold = 0.18
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * - fade-up: subtle lift (default)
   * - fade: opacity only
   * - zoom: gentle scale-in
   * - media: tuned for big images/cards
   */
  variant?: Variant;
  /** ms */
  delay?: number;
  /** ms */
  duration?: number;
  /** if false, will toggle on/off as it enters/leaves viewport */
  once?: boolean;
  /** intersection threshold 0..1 */
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  return (
    <div
      ref={ref}
      className={cn('reveal', `reveal--${variant}`, visible && 'reveal--visible', className)}
      style={{
        // CSS variables allow per-instance timing without generating extra utility classes.
        ['--reveal-delay' as any]: `${delay}ms`,
        ['--reveal-duration' as any]: `${duration}ms`
      }}
    >
      {children}
    </div>
  );
}
