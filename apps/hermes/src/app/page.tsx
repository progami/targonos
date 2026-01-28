import Link from "next/link";
import { ArrowUpRight, Mail, ShieldCheck, Timer, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { KpiCard } from "@/components/hermes/kpi-card";
import { DispatchStatusBadge } from "@/components/hermes/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaigns, dispatches } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/time";

export default function DashboardPage() {
  const live = campaigns.filter((c) => c.status === "live").length;
  const queued = dispatches.filter((d) => d.status === "queued").length;
  const sent = dispatches.filter((d) => d.status === "sent").length;
  const failed = dispatches.filter((d) => d.status === "failed" || d.status === "rate_limited").length;

  const recent = [...dispatches].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hermes"
        subtitle={<span className="inline-flex items-center gap-2">Request-a-review automation</span>}
        right={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/campaigns">
                Campaigns <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/campaigns/new">New campaign</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Live" value={String(live)} icon={Mail} />
        <KpiCard label="Queued" value={String(queued)} icon={Timer} />
        <KpiCard label="Sent (mock)" value={String(sent)} icon={ShieldCheck} />
        <KpiCard label="Needs attention" value={String(failed)} icon={TriangleAlert} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/logs">Logs</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.orderId}</TableCell>
                    <TableCell>
                      <DispatchStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {formatDateTime(d.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {recent.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      No activity yet
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Next up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Default guardrails</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                  1 / order
                </span>
                <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                  5–30 days
                </span>
                <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                  Rate-limited
                </span>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Quick actions</div>
              <div className="mt-3 grid gap-2">
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href="/accounts">
                    Connect Amazon <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href="/experiments">
                    Run an A/B test <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
