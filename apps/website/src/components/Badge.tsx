import { cn } from '@/lib/utils';

const variants = {
  default: 'border-border bg-surface text-ink',
  subtle: 'border-transparent bg-surface/60 text-muted'
} as const;

export function Badge({
  children,
  className,
  variant = 'default'
}: {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof variants;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1 text-xs font-semibold',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
