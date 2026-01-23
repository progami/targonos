import type { ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold tracking-tightish transition will-change-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-white shadow-softer motion-safe:hover:shadow-soft motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]',
  accent:
    'bg-accent text-ink shadow-softer motion-safe:hover:shadow-soft motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]',
  outline:
    'border border-border bg-surface text-ink hover:bg-bg motion-safe:active:scale-[0.98]',
  ghost:
    'bg-transparent text-ink hover:bg-bg motion-safe:active:scale-[0.98]'
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base'
};

export function Button({
  asChild,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: Variant;
  size?: Size;
}) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
}
