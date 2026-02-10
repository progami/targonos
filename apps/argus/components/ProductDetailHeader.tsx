import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProductDetailTabs, type ProductDetailTab } from '@/components/ProductDetailTabs';

export type ProductDetailHeaderTarget = {
  id: string;
  label: string;
  asin: string | null;
  marketplace: string;
  owner: string;
  enabled: boolean;
  activeImageVersionNumber: number | null;
};

export function ProductDetailHeader(props: {
  target: ProductDetailHeaderTarget;
  activeTab: ProductDetailTab;
  actions?: React.ReactNode;
}) {
  const imagesEnabled = props.target.owner === 'OURS';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Products
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-muted/35 via-background to-muted/10 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{props.target.label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={props.target.marketplace === 'US' ? 'info' : 'neutral'} className="text-2xs">
                {props.target.marketplace}
              </Badge>
              <Badge variant={props.target.owner === 'OURS' ? 'success' : 'warning'} className="text-2xs">
                {props.target.owner}
              </Badge>
              <Badge variant={props.target.enabled ? 'success' : 'neutral'} className="text-2xs">
                {props.target.enabled ? 'Active' : 'Paused'}
              </Badge>
              {props.target.asin && (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{props.target.asin}</code>
              )}
            </div>
          </div>

          {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
        </div>

        <div className="mt-4">
          <ProductDetailTabs
            targetId={props.target.id}
            activeTab={props.activeTab}
            imagesEnabled={imagesEnabled}
            activeImageVersionNumber={props.target.activeImageVersionNumber}
          />
        </div>
      </div>
    </div>
  );
}

