import { notFound, redirect } from 'next/navigation';
import {
  readCaseReportBundle,
  type CaseReportMarketSlug,
} from '@/lib/cases/reader';

export const dynamic = 'force-dynamic';

type MarketLatestPageProps = {
  params: Promise<{
    market: string;
  }>;
};

export default async function MarketLatestCaseReportPage({ params }: MarketLatestPageProps) {
  const { market } = await params;

  try {
    const bundle = await readCaseReportBundle(market as CaseReportMarketSlug);
    redirect(`/cases/${market}/${bundle.reportDate}`);
  } catch {
    notFound();
  }
}
