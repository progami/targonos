import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Container({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        // Apple-like: generous max width with comfortable side padding.
        'mx-auto w-full max-w-[1680px] px-5 md:px-10 lg:px-12',
        className
      )}
    >
      {children}
    </div>
  );
}
