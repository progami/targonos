import { notFound } from 'next/navigation';
import { CasesDrilldownPage } from '@/components/cases/cases-drilldown-page';
import { CasesUnavailablePage } from '@/components/cases/cases-unavailable-page';
import { resolveDatedCaseReportRouteState } from '@/lib/cases/route-state';

export const dynamic = 'force-dynamic';

type CaseReportPageProps = {
  params: Promise<{
    market: string;
    reportDate: string;
  }>;
};

export default async function DatedCaseReportPage({ params }: CaseReportPageProps) {
  const { market, reportDate } = await params;
  const routeState = await resolveDatedCaseReportRouteState(market, reportDate);

  if (routeState.kind === 'not_found') {
    notFound();
  }

  if (routeState.kind === 'unavailable') {
    return (
      <CasesUnavailablePage
        marketLabel={routeState.marketLabel}
        marketSlug={routeState.marketSlug}
        reportDate={routeState.reportDate}
      />
    );
  }

  return (
    <CasesDrilldownPage
      key={`${routeState.bundle.marketSlug}:${routeState.bundle.reportDate}`}
      bundle={routeState.bundle}
    />
  );
}
