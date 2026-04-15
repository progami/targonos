import { notFound } from 'next/navigation';
import {
  readCaseReportBundle,
  type CaseReportBundle,
  type CaseReportMarketSlug,
} from '@/lib/cases/reader';
import { CaseApprovalQueuePage } from '@/components/cases/approval-queue-page';

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

  return <CaseApprovalQueuePage bundle={bundle} />;
}
