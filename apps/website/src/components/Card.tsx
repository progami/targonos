import { cn } from '@/lib/utils';

export function Card({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface shadow-softer transition-shadow duration-300 hover:shadow-soft',
        className
      )}
    >
      {children}
    </div>
  );
}
