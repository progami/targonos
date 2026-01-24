import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 text-muted" aria-hidden />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-muted transition hover:text-ink"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? 'font-medium text-ink' : 'text-muted'}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
