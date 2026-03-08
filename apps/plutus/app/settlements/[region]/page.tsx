import { notFound, redirect } from 'next/navigation';

import { normalizeSettlementMarketplaceQuery } from '@/lib/plutus/settlement-marketplace-query';

type RegionPageProps = {
  params: Promise<{ region: string }>;
};

export default async function SettlementRegionRedirectPage({ params }: RegionPageProps) {
  const { region } = await params;
  const marketplace = normalizeSettlementMarketplaceQuery(region);

  if (marketplace !== 'US' && marketplace !== 'UK') {
    notFound();
  }

  redirect(`/settlements?marketplace=${marketplace}`);
}
