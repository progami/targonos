import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RunNowButton } from '@/components/RunNowButton';
import { AlertRulesClient } from '@/components/AlertRulesClient';
import { ArrowLeft, Clock, Activity, Bell } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RankingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = await prisma.watchTarget.findUnique({
    where: { id },
    include: {
      runs: { take: 20, orderBy: { startedAt: 'desc' } },
      jobs: { take: 10, orderBy: { scheduledAt: 'desc' } },
      alertRules: true,
    },
  });
  if (!target) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/rankings"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Back</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{target.keyword ?? target.label}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="info" className="text-2xs">SEARCH</Badge>
            <Badge variant={target.marketplace === 'US' ? 'info' : 'neutral'} className="text-2xs">{target.marketplace}</Badge>
            <Badge variant={target.enabled ? 'success' : 'neutral'} className="text-2xs">{target.enabled ? 'Active' : 'Paused'}</Badge>
          </div>
          {target.trackedAsins.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {target.trackedAsins.map((asin) => (
                <code key={asin} className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs">{asin}</code>
              ))}
            </div>
          )}
        </div>
        <RunNowButton targetId={target.id} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div><p className="text-xs text-muted-foreground">Cadence</p><p className="text-sm font-medium">{target.cadenceMinutes}m</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div><p className="text-xs text-muted-foreground">Captures</p><p className="text-sm font-medium">{target.runs.length}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Capture Timeline */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Capture History</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {target.runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No captures yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Changes</th>
                    <th className="pb-2 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {target.runs.map((run) => {
                    const summary = run.changeSummary as Array<{ path: string; before: unknown; after: unknown }> | null;
                    const hasChanges = Array.isArray(summary) && summary.length > 0;
                    return (
                      <tr key={run.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-xs">{formatRelativeTime(run.startedAt)}</td>
                        <td className="py-2 pr-4">
                          {hasChanges ? (
                            <Badge variant="warning" className="text-2xs">{summary!.length} changes</Badge>
                          ) : (
                            <Badge variant="success" className="text-2xs">No changes</Badge>
                          )}
                        </td>
                        <td className="py-2 font-mono text-2xs text-muted-foreground">{run.contentHash.slice(0, 12)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Rules */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Alert Rules</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <AlertRulesClient targetId={target.id} targetType={target.type} rules={target.alertRules} />
        </CardContent>
      </Card>
    </div>
  );
}
