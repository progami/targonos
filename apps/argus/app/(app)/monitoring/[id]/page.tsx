import { notFound } from 'next/navigation';
import { Prisma } from '@targon/prisma-argus';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductDetailHeader } from '@/components/ProductDetailHeader';
import { RunNowButton } from '@/components/RunNowButton';
import { LatestScreenshotButton } from '@/components/LatestScreenshotButton';
import { SignalHistoryClient, type SignalHistoryItem } from '@/components/SignalHistoryClient';
import { JobIssuesClient, type JobIssueItem } from '@/components/JobIssuesClient';
import { AlertRuleClient } from '@/components/AlertRuleClient';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function pickNumber(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pickStringArray(obj: Record<string, unknown> | null, key: string): string[] {
  if (!obj) return [];
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string') as string[];
}

export default async function MonitoringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const target = await prisma.watchTarget.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      asin: true,
      marketplace: true,
      owner: true,
      enabled: true,
      source: true,
      cadenceMinutes: true,
      activeImageVersionId: true,
      activeImageVersion: { select: { versionNumber: true } },
    },
  });

  if (!target) notFound();

  const [latestRun, signalRuns, jobIssues, rule] = await Promise.all([
    prisma.captureRun.findFirst({
      where: { targetId: target.id, normalizedExtracted: { not: Prisma.DbNull } },
      orderBy: [{ startedAt: 'desc' }],
      select: { id: true, startedAt: true, normalizedExtracted: true, finalUrl: true },
    }),
    prisma.captureRun.findMany({
      where: { targetId: target.id, changeSummary: { not: Prisma.DbNull } },
      orderBy: [{ startedAt: 'desc' }],
      take: 30,
      select: { id: true, startedAt: true, changeSummary: true, acknowledgedAt: true },
    }),
    prisma.captureJob.findMany({
      where: { targetId: target.id, status: { in: ['FAILED', 'BLOCKED'] } },
      orderBy: [{ scheduledAt: 'desc' }],
      take: 30,
      select: { id: true, status: true, scheduledAt: true, finishedAt: true, lastError: true, acknowledgedAt: true },
    }),
    prisma.alertRule.findUnique({
      where: { targetId: target.id },
      select: { id: true, enabled: true, thresholds: true },
    }),
  ]);

  const structuredSignalRuns = signalRuns.filter((r) => {
    const s = r.changeSummary as unknown;
    return Boolean(s) && typeof s === 'object' && !Array.isArray(s);
  });

  const extracted = asObject(latestRun?.normalizedExtracted ?? null);
  const title = pickString(extracted, 'title');
  const price = pickNumber(extracted, 'price');
  const rating = pickNumber(extracted, 'rating');
  const reviewCount = pickNumber(extracted, 'reviewCount');
  const imageUrls = pickStringArray(extracted, 'imageUrls');
  const mainImageUrl = imageUrls[0] ?? null;

  const historyItems: SignalHistoryItem[] = structuredSignalRuns.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    changeSummary: r.changeSummary,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
  }));

  const jobItems: JobIssueItem[] = jobIssues.map((j) => ({
    id: j.id,
    status: j.status as 'FAILED' | 'BLOCKED',
    scheduledAt: j.scheduledAt.toISOString(),
    finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
    lastError: j.lastError,
    acknowledgedAt: j.acknowledgedAt ? j.acknowledgedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <ProductDetailHeader
        target={{
          id: target.id,
          label: target.label,
          asin: target.asin,
          marketplace: target.marketplace,
          owner: target.owner,
          enabled: target.enabled,
          activeImageVersionNumber: target.activeImageVersion?.versionNumber ?? null,
        }}
        activeTab="monitoring"
        backHref="/monitoring"
        backLabel="Monitoring"
        actions={
          <div className="flex items-center gap-2">
            {latestRun ? <LatestScreenshotButton runId={latestRun.id} /> : null}
            <RunNowButton targetId={target.id} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">Current Snapshot</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-2xs">{target.source}</Badge>
                <Badge variant="neutral" className="text-2xs">{target.cadenceMinutes}m</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {latestRun ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <div className="aspect-square overflow-hidden rounded-lg border bg-muted/20">
                    {mainImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={mainImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-3 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="mt-0.5 text-sm font-medium leading-snug">{title ?? '—'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {price !== null ? `$${price.toFixed(2)}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rating</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {rating !== null ? rating.toFixed(1) : '—'}
                        {reviewCount !== null ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({reviewCount.toLocaleString('en-US')})
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {latestRun.finalUrl ? (
                    <p className="truncate text-2xs text-muted-foreground">
                      {latestRun.finalUrl}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No successful captures yet. Use Capture Now to create a baseline.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Ops + Alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Cadence</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums">{target.cadenceMinutes} minutes</p>
            </div>

            <AlertRuleClient targetId={target.id} rule={rule} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Signal History</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SignalHistoryClient items={historyItems} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Monitoring Issues</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <JobIssuesClient items={jobItems} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
