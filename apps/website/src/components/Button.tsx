import type { ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold tracking-tightish transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-white hover:brightness-110 active:brightness-95 shadow-softer',
  accent:
    'bg-accent text-ink hover:brightness-105 active:brightness-95 shadow-softer',
  outline:
    'border border-border bg-surface text-ink hover:bg-bg active:brightness-95',
  ghost:
    'bg-transparent text-ink hover:bg-bg active:brightness-95'
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
