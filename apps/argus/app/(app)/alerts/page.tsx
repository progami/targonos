import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const [recentEvents, allRules] = await Promise.all([
    prisma.alertEvent.findMany({
      take: 30,
      orderBy: { sentAt: 'desc' },
      include: {
        rule: { include: { target: true } },
      },
    }),
    prisma.alertRule.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { target: true, _count: { select: { events: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" subtitle="Alert events and monitoring rules." />

      {/* Recent Alert Events */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Alert Events</CardTitle>
            <Badge variant="info" className="text-2xs">{recentEvents.length} events</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No alerts triggered yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-100">
                    <Mail className="h-3.5 w-3.5 text-warning-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{event.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.rule.target.label} · {event.rule.target.type} · {event.rule.target.marketplace}
                    </p>
                    {event.bodyPreview && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.bodyPreview}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-2xs text-muted-foreground">{formatRelativeTime(event.sentAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">All Alert Rules ({allRules.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {allRules.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No alert rules configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Events</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {allRules.map((rule) => (
                    <tr key={rule.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{rule.target.label}</td>
                      <td className="py-2 pr-4"><Badge variant="outline" className="text-2xs">{rule.target.type}</Badge></td>
                      <td className="py-2 pr-4"><Badge variant={rule.enabled ? 'success' : 'neutral'} className="text-2xs">{rule.enabled ? 'Active' : 'Disabled'}</Badge></td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{rule._count.events}</td>
                      <td className="py-2 text-xs text-muted-foreground">{formatRelativeTime(rule.updatedAt)}</td>
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
