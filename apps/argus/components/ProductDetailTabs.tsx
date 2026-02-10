import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ProductDetailTab = 'monitoring' | 'images';

export function ProductDetailTabs(props: {
  targetId: string;
  activeTab: ProductDetailTab;
  imagesEnabled: boolean;
  activeImageVersionNumber: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex rounded-full border bg-muted/40 p-1">
        <Link
          href={`/products/${props.targetId}`}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            props.activeTab === 'monitoring'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Monitoring
        </Link>

        {props.imagesEnabled ? (
          <Link
            href={`/products/${props.targetId}/images`}
            className={cn(
              'ml-1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
              props.activeTab === 'images'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Image Versions
            {props.activeImageVersionNumber !== null && (
              <Badge variant="outline" className="h-5 px-1.5 text-2xs">
                v{props.activeImageVersionNumber}
              </Badge>
            )}
          </Link>
        ) : (
          <div className="ml-1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground opacity-70">
            <span>Image Versions</span>
            <Lock className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
