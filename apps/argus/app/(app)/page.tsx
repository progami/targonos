import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Target,
  Activity,
  Bell,
  AlertTriangle,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalTargets,
    enabledTargets,
    recentRuns,
    todaySucceeded,
    todayFailed,
    alertEvents24h,
    blockedJobs,
  ] = await Promise.all([
    prisma.watchTarget.count(),
    prisma.watchTarget.count({ where: { enabled: true } }),
    prisma.captureRun.findMany({
      take: 15,
      orderBy: { startedAt: 'desc' },
      include: { target: true },
    }),
    prisma.captureJob.count({
      where: { status: 'SUCCEEDED', finishedAt: { gte: dayAgo } },
    }),
    prisma.captureJob.count({
      where: { status: 'FAILED', finishedAt: { gte: dayAgo } },
    }),
    prisma.alertEvent.count({
      where: { sentAt: { gte: dayAgo } },
    }),
    prisma.captureJob.findMany({
      where: { status: 'BLOCKED' },
      take: 10,
      orderBy: { scheduledAt: 'desc' },
      include: { target: true },
    }),
  ]);

  const stats = [
    {
      label: 'Total Targets',
      value: totalTargets,
      sub: `${enabledTargets} enabled`,
      icon: Target,
      color: 'text-brand-navy-500',
      bg: 'bg-brand-navy-50',
    },
    {
      label: 'Captures (24h)',
      value: todaySucceeded + todayFailed,
      sub: `${todaySucceeded} succeeded`,
      icon: Activity,
      color: 'text-brand-teal-600',
      bg: 'bg-brand-teal-50',
    },
    {
      label: 'Alerts (24h)',
      value: alertEvents24h,
      sub: 'triggered',
      icon: Bell,
      color: alertEvents24h > 0 ? 'text-warning-600' : 'text-muted-foreground',
      bg: alertEvents24h > 0 ? 'bg-warning-50' : 'bg-muted',
    },
    {
      label: 'Blocked Jobs',
      value: blockedJobs.length,
      sub: blockedJobs.length > 0 ? 'needs attention' : 'all clear',
      icon: AlertTriangle,
      color: blockedJobs.length > 0 ? 'text-danger-600' : 'text-muted-foreground',
      bg: blockedJobs.length > 0 ? 'bg-danger-50' : 'bg-muted',
    },
  ];

  const changedRuns = recentRuns.filter((r) => r.changeSummary);
  const unchangedRuns = recentRuns.filter((r) => !r.changeSummary);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Mission control for Amazon listing monitoring." />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent Changes */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Changes</CardTitle>
              <Badge variant="info" className="text-2xs">{changedRuns.length} detected</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {changedRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-brand-teal-400" />
                <p className="text-sm text-muted-foreground">No changes detected recently.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {changedRuns.map((run) => {
                  const summary = run.changeSummary as Array<{ path: string; before: unknown; after: unknown }> | null;
                  const changeCount = Array.isArray(summary) ? summary.length : 0;
                  return (
                    <Link
                      key={run.id}
                      href={`/products/${run.targetId}`}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-600">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{run.target.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {changeCount} field{changeCount !== 1 ? 's' : ''} changed · {run.target.type} · {run.target.marketplace}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">{formatRelativeTime(run.startedAt)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Latest Captures</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {recentRuns.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No captures yet.</p>
            ) : (
              <div className="space-y-1">
                {recentRuns.slice(0, 8).map((run) => (
                  <div key={run.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
                    {run.changeSummary ? (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-warning-500" />
                    ) : (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-brand-teal-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs">{run.target.label}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Blocked Jobs */}
      {blockedJobs.length > 0 && (
        <Card className="border-danger-200 bg-danger-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-danger-600" />
              <CardTitle className="text-sm font-semibold text-danger-700">
                Blocked Jobs ({blockedJobs.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedJobs.map((job) => (
                    <tr key={job.id} className="border-b border-danger-100 last:border-0">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/products/${job.targetId}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {job.target.label}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-2xs">
                          {job.target.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {formatRelativeTime(job.scheduledAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
