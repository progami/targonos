"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Mail, ShieldCheck, Timer, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { KpiCard } from "@/components/hermes/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { hermesApiUrl } from "@/lib/base-path";
import { formatDateTime } from "@/lib/time";

type Stats = { liveCampaigns: number; queued: number; sent: number; failed: number };
type RecentDispatch = {
  id: string;
  orderId: string;
  state: string;
  createdAt: string;
};

function dispatchBadge(state: string) {
  const map: Record<string, string> = {
    queued: "secondary",
    sending: "secondary",
    sent: "default",
    skipped: "outline",
    failed: "destructive",
  };
  return <Badge variant={(map[state] ?? "outline") as any}>{state}</Badge>;
}

export default function DashboardPage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [recent, setRecent] = React.useState<RecentDispatch[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const [statsRes, recentRes] = await Promise.all([
          fetch(hermesApiUrl("/api/dispatches/stats")),
          fetch(hermesApiUrl("/api/dispatches/recent")),
        ]);
        const statsJson = await statsRes.json();
        const recentJson = await recentRes.json();
        if (statsJson?.ok) setStats(statsJson.stats);
        if (recentJson?.ok) setRecent(recentJson.dispatches ?? []);
      } catch {
        // leave defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hermes"
        subtitle={<span className="inline-flex items-center gap-2">Amazon Request-a-Review</span>}
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Live" value={String(stats?.liveCampaigns ?? 0)} icon={Mail} />
            <KpiCard label="Queued" value={String(stats?.queued ?? 0)} icon={Timer} />
            <KpiCard label="Sent" value={String(stats?.sent ?? 0)} icon={ShieldCheck} />
            <KpiCard label="Needs attention" value={String(stats?.failed ?? 0)} icon={TriangleAlert} />
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
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 px-3">Order</TableHead>
                      <TableHead className="h-9 px-3">Status</TableHead>
                      <TableHead className="hidden h-9 px-3 sm:table-cell">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="px-3 py-2 font-mono text-[11px]">{d.orderId}</TableCell>
                        <TableCell className="px-3 py-2">{dispatchBadge(d.state)}</TableCell>
                        <TableCell className="hidden px-3 py-2 sm:table-cell text-muted-foreground">
                          {formatDateTime(d.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recent.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="px-3 py-10 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-card">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="text-sm font-medium">No activity yet</div>
                            <div className="text-xs text-muted-foreground">Dispatches appear after order sync / campaigns enqueue sends.</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href="/orders">
                    Orders (sync / queue) <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href="/reviews">
                    Review outcomes <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href="/accounts">
                    Accounts / SP-API test <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <div className="mt-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  Request-a-Review is 1/order and only sends when Amazon exposes the eligible action.
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
