import { notFound, redirect } from 'next/navigation';
import { CasesUnavailablePage } from '@/components/cases/cases-unavailable-page';
import { resolveLatestCaseReportRouteState } from '@/lib/cases/route-state';

export const dynamic = 'force-dynamic';

type MarketLatestPageProps = {
  params: Promise<{
    market: string;
  }>;
};

export default async function MarketLatestCaseReportPage({ params }: MarketLatestPageProps) {
  const { market } = await params;
  const routeState = await resolveLatestCaseReportRouteState(market);

  if (routeState.kind === 'not_found') {
    notFound();
  }

  if (routeState.kind === 'unavailable') {
    return (
      <CasesUnavailablePage
        marketLabel={routeState.marketLabel}
        marketSlug={routeState.marketSlug}
      />
    );
  }

  redirect(`/cases/${routeState.marketSlug}/${routeState.reportDate}`);
}
