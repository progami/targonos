import { notFound } from 'next/navigation';
import {
  readCaseReportBundle,
  type CaseReportBundle,
  type CaseReportMarketSlug,
} from '@/lib/cases/reader';
import { CasesDrilldownPage } from '@/components/cases/cases-drilldown-page';

export const dynamic = 'force-dynamic';

type CaseReportPageProps = {
  params: Promise<{
    market: string;
    reportDate: string;
  }>;
};

export default async function DatedCaseReportPage({ params }: CaseReportPageProps) {
  const { market, reportDate } = await params;

  let bundle: CaseReportBundle;
  try {
    bundle = await readCaseReportBundle(market as CaseReportMarketSlug, reportDate);
  } catch {
    notFound();
  }

  return <CasesDrilldownPage key={`${bundle.marketSlug}:${bundle.reportDate}`} bundle={bundle} />;
}
