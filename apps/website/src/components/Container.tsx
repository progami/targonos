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
        // Apple-like: wider canvas + comfortable side padding.
        'mx-auto w-full max-w-[1920px] px-5 md:px-10 lg:px-12',
        className
      )}
    >
      {children}
    </div>
  );
}
