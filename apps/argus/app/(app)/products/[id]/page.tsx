import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RunNowButton } from '@/components/RunNowButton';
import { AlertRulesClient } from '@/components/AlertRulesClient';
import { ArrowLeft, Clock, Globe, Activity, Bell } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const target = await prisma.watchTarget.findUnique({
    where: { id },
    include: {
      runs: {
        take: 30,
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { artifacts: true } } },
      },
      jobs: {
        take: 10,
        orderBy: { scheduledAt: 'desc' },
      },
      alertRules: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!target) notFound();

  const typeRoute =
    target.type === 'ASIN'
      ? 'products'
      : target.type === 'SEARCH'
        ? 'rankings'
        : 'bestsellers';

  const alertRules = target.alertRules.map((r) => ({
    id: r.id,
    enabled: r.enabled,
    thresholds: r.thresholds,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/${typeRoute}`}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{target.label}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="info" className="text-2xs">
              {target.type}
            </Badge>
            <Badge
              variant={target.marketplace === 'US' ? 'info' : 'neutral'}
              className="text-2xs"
            >
              {target.marketplace}
            </Badge>
            <Badge
              variant={target.owner === 'OURS' ? 'success' : 'warning'}
              className="text-2xs"
            >
              {target.owner}
            </Badge>
            <Badge variant={target.enabled ? 'success' : 'neutral'} className="text-2xs">
              {target.enabled ? 'Active' : 'Paused'}
            </Badge>
            {target.asin && (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {target.asin}
              </code>
            )}
            {target.keyword && (
              <span className="text-xs text-muted-foreground">Keyword: {target.keyword}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RunNowButton targetId={target.id} />
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Cadence</p>
              <p className="text-sm font-medium">{target.cadenceMinutes}m</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total Runs</p>
              <p className="text-sm font-medium">{target.runs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="text-sm font-medium">{target.source}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Alert Rules</p>
              <p className="text-sm font-medium">{target.alertRules.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capture Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Capture Timeline</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {target.runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No captures yet. Click &quot;Run now&quot; to start.
            </p>
          ) : (
            <div className="space-y-0">
              {target.runs.map((run, i) => {
                const summary = run.changeSummary as Array<{
                  path: string;
                  before: unknown;
                  after: unknown;
                }> | null;
                const hasChanges = Array.isArray(summary) && summary.length > 0;
                const isBlocked = run.notes?.includes('BLOCKED');
                return (
                  <div key={run.id} className="relative flex gap-3 pb-4">
                    {/* Timeline line */}
                    {i < target.runs.length - 1 && (
                      <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
                    )}
                    {/* Dot */}
                    <div
                      className={`relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        isBlocked
                          ? 'border-danger-400 bg-danger-50'
                          : hasChanges
                            ? 'border-warning-400 bg-warning-50'
                            : 'border-brand-teal-400 bg-brand-teal-50'
                      }`}
                    >
                      <div
                        className={`h-2 w-2 rounded-full ${
                          isBlocked
                            ? 'bg-danger-500'
                            : hasChanges
                              ? 'bg-warning-500'
                              : 'bg-brand-teal-500'
                        }`}
                      />
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {formatRelativeTime(run.startedAt)}
                        </span>
                        {isBlocked && (
                          <Badge variant="danger" className="text-2xs">
                            Blocked
                          </Badge>
                        )}
                        {hasChanges && (
                          <Badge variant="warning" className="text-2xs">
                            {summary!.length} changes
                          </Badge>
                        )}
                        {!hasChanges && !isBlocked && (
                          <Badge variant="success" className="text-2xs">
                            No changes
                          </Badge>
                        )}
                        {run._count.artifacts > 0 && (
                          <span className="text-2xs text-muted-foreground">
                            {run._count.artifacts} artifacts
                          </span>
                        )}
                      </div>
                      {hasChanges && (
                        <div className="mt-1.5 space-y-1">
                          {summary!.slice(0, 5).map((change, ci) => (
                            <div key={ci} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-muted-foreground">
                                {change.path}
                              </span>
                              <span className="text-danger-600 line-through">
                                {String(change.before)}
                              </span>
                              <span className="text-foreground">&rarr;</span>
                              <span className="text-success-600">{String(change.after)}</span>
                            </div>
                          ))}
                          {summary!.length > 5 && (
                            <p className="text-2xs text-muted-foreground">
                              +{summary!.length - 5} more changes
                            </p>
                          )}
                        </div>
                      )}
                      {isBlocked && run.notes && (
                        <p className="mt-1 text-xs text-danger-600">{run.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
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
          <AlertRulesClient targetId={target.id} targetType={target.type} rules={alertRules} />
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {target.jobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Scheduled</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Attempts</th>
                    <th className="pb-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {target.jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-xs">
                        {formatRelativeTime(job.scheduledAt)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            job.status === 'SUCCEEDED'
                              ? 'success'
                              : job.status === 'FAILED'
                                ? 'danger'
                                : job.status === 'BLOCKED'
                                  ? 'destructive'
                                  : job.status === 'RUNNING'
                                    ? 'info'
                                    : 'neutral'
                          }
                          className="text-2xs"
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-xs text-muted-foreground">
                        {job.attemptCount}
                      </td>
                      <td className="py-2 text-xs text-danger-600">{job.lastError}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
