import { cn } from '@/lib/utils';

export function Container({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // Apple-like: wider canvas + comfortable side padding.
        'mx-auto w-full max-w-[1920px] px-5 md:px-10 lg:px-12 2xl:px-20 min-[1920px]:px-28',
        className
      )}
    >
      {children}
    </div>
  );
}
