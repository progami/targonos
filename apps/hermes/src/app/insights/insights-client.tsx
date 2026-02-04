"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectionsStore } from "@/stores/connections-store";
import { useHermesUiPreferencesStore } from "@/stores/ui-preferences-store";

type Overview = {
  rangeDays: number;
  fromIso: string;
  toIso: string;
  queue: {
    nextDays: number;
    fromIso: string;
    toIso: string;
    queuedTotal: number;
    series: Array<{ day: string; queued: number }>;
  };
  summary: {
    sentInRange: number;
    dispatchStateNow: {
      queued: number;
      sending: number;
      sent: number;
      skipped: number;
      failed: number;
    };
  };
  series: Array<{ day: string; sent: number }>;
};

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtDayShort(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SentChart({ series }: { series: Overview["series"] }) {
  const data = series.map((d) => ({ day: d.day, sent: d.sent }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 6, right: 10, top: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="day"
            tickFormatter={fmtDayShort}
            className="text-[11px]"
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis className="text-[11px]" width={36} />
          <Tooltip
            formatter={(value) => [fmtInt(Number(value ?? 0)), "Sent"]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="sent" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function QueueChart({ series }: { series: Overview["queue"]["series"] }) {
  const data = series.map((d) => ({ day: d.day, queued: d.queued }));

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 6, right: 10, top: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="day" tickFormatter={fmtDayShort} className="text-[11px]" />
          <YAxis className="text-[11px]" width={36} />
          <Tooltip
            formatter={(value) => [fmtInt(Number(value ?? 0)), "Queued"]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="queued" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InsightsClient() {
  const {
    connections,
    loading: connectionsLoading,
    hasHydrated: connectionsHydrated,
    activeConnectionId,
    setActiveConnectionId,
    fetch: fetchConnections,
  } = useConnectionsStore();

  React.useEffect(() => {
    if (!connectionsHydrated) return;
    fetchConnections();
  }, [connectionsHydrated, fetchConnections]);

  const connectionId = activeConnectionId ?? "";

  const uiHydrated = useHermesUiPreferencesStore((s) => s.hasHydrated);
  const rangeDays = useHermesUiPreferencesStore((s) => s.insights.rangeDays);
  const setInsightsPreferences = useHermesUiPreferencesStore((s) => s.setInsightsPreferences);

  const [loading, setLoading] = React.useState(false);
  const [overview, setOverview] = React.useState<Overview | null>(null);

  const connectionIdsKey = React.useMemo(
    () => connections.map((c) => c.id).sort().join("|"),
    [connections]
  );
  const [allOverviews, setAllOverviews] = React.useState<Record<string, Overview | null>>({});
  const [allLoading, setAllLoading] = React.useState(false);

  React.useEffect(() => {
    if (!uiHydrated) return;
    if (!connectionId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("rangeDays", String(rangeDays));
        qs.set("connectionId", connectionId);

        const res = await fetch(hermesApiUrl(`/api/analytics/overview?${qs.toString()}`));
        const json = await res.json();
        if (!res.ok || json?.ok !== true) {
          throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
        }
        if (!cancelled) setOverview(json.overview as Overview);
      } catch (e: any) {
        if (!cancelled) setOverview(null);
        toast.error("Insights unavailable", { description: e?.message ?? "" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [uiHydrated, connectionId, rangeDays]);

  React.useEffect(() => {
    if (!uiHydrated) return;
    if (connections.length === 0) return;

    let cancelled = false;
    async function loadAll() {
      setAllLoading(true);
      try {
        const results = await Promise.all(
          connections.map(async (c) => {
            const qs = new URLSearchParams();
            qs.set("rangeDays", String(rangeDays));
            qs.set("connectionId", c.id);

            const res = await fetch(hermesApiUrl(`/api/analytics/overview?${qs.toString()}`));
            const json = await res.json();
            if (!res.ok || json?.ok !== true) {
              return [c.id, null] as const;
            }
            return [c.id, json.overview as Overview] as const;
          })
        );

        if (cancelled) return;
        const next: Record<string, Overview | null> = {};
        for (const [id, ov] of results) next[id] = ov;
        setAllOverviews(next);
      } finally {
        if (!cancelled) setAllLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [uiHydrated, rangeDays, connectionIdsKey, connections]);

  const sentSeries = React.useMemo(() => (overview ? overview.series : []), [overview]);
  const queueSeries = React.useMemo(() => (overview ? overview.queue.series : []), [overview]);
  const queuedToday = queueSeries[0]?.queued ?? 0;
  const queuedTomorrow = queueSeries[1]?.queued ?? 0;
  const sentInRange = overview ? overview.summary.sentInRange : 0;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const tomorrowUtc = queueSeries[1]?.day ?? null;

  const sentByDay = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const d of sentSeries) map.set(d.day, d.sent);
    return map;
  }, [sentSeries]);

  const queuedByDay = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const d of queueSeries) map.set(d.day, d.queued);
    return map;
  }, [queueSeries]);

  const tableDays = React.useMemo(() => {
    const days = new Set<string>();
    for (const d of queueSeries) days.add(d.day);
    for (const d of sentSeries) days.add(d.day);

    const out = Array.from(days);
    out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return out;
  }, [queueSeries, sentSeries]);

  const accountsTableRows = React.useMemo(() => {
    return connections.map((c) => {
      const ov = c.id === connectionId && overview ? overview : (allOverviews[c.id] ?? null);
      const sentAll = ov ? ov.summary.dispatchStateNow.sent : null;
      const sentRange = ov ? ov.summary.sentInRange : null;
      const queuedAll = ov ? ov.summary.dispatchStateNow.queued : null;
      const queuedToday = ov ? (ov.queue.series[0]?.queued ?? 0) : null;
      const queuedTomorrow = ov ? (ov.queue.series[1]?.queued ?? 0) : null;
      const queuedNext7 = ov ? ov.queue.queuedTotal : null;

      return {
        id: c.id,
        label: `${c.accountName} • ${c.region}`,
        active: c.id === connectionId,
        sentAll,
        sentRange,
        queuedAll,
        queuedToday,
        queuedTomorrow,
        queuedNext7,
      };
    });
  }, [connections, connectionId, overview, allOverviews]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insights"
        right={
          <div className="flex items-center gap-2">
            <Tabs
              value={String(rangeDays)}
              onValueChange={(v) => setInsightsPreferences({ rangeDays: Number(v) as 7 | 30 | 90 })}
            >
              <TabsList>
                <TabsTrigger value="7">7d</TabsTrigger>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={connectionId} onValueChange={setActiveConnectionId}>
              <SelectTrigger className="h-9 w-[240px]" disabled={connectionsLoading}>
                <SelectValue placeholder={connectionsLoading ? "Loading…" : "Account"} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.accountName} • {c.region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {connections.length > 1 ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Accounts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Sent (all)</TableHead>
                    <TableHead className="text-right">Sent ({rangeDays}d)</TableHead>
                    <TableHead className="text-right">Queued (all)</TableHead>
                    <TableHead className="text-right">Queued (today)</TableHead>
                    <TableHead className="text-right">Queued (tomorrow)</TableHead>
                    <TableHead className="text-right">Queued (next 7d)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountsTableRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={r.active ? "bg-muted/30" : "cursor-pointer"}
                      onClick={() => setActiveConnectionId(r.id)}
                    >
                      <TableCell className="min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{r.label}</span>
                          {r.active ? <Badge variant="secondary" className="text-[10px]">Active</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.sentAll === "number" ? fmtInt(r.sentAll) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.sentRange === "number" ? fmtInt(r.sentRange) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.queuedAll === "number" ? fmtInt(r.queuedAll) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.queuedToday === "number" ? fmtInt(r.queuedToday) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.queuedTomorrow === "number" ? fmtInt(r.queuedTomorrow) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.queuedNext7 === "number" ? fmtInt(r.queuedNext7) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                {accountsTableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      {connectionsLoading ? "Loading…" : "No accounts"}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="table">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">Sent ({rangeDays}d) {overview ? fmtInt(sentInRange) : "—"}</Badge>
            <Badge variant="outline">Queued today {overview ? fmtInt(queuedToday) : "—"}</Badge>
            <Badge variant="outline">Queued tomorrow {overview ? fmtInt(queuedTomorrow) : "—"}</Badge>
            {loading || allLoading ? (
              <Badge variant="outline" className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </Badge>
            ) : null}
          </div>
        </div>

        <TabsContent value="table" className="m-0 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Daily</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day (UTC)</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Queued</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableDays.map((day) => {
                      const sent = sentByDay.get(day);
                      const queued = queuedByDay.get(day);
                      const keyDay = day === todayUtc || day === tomorrowUtc;

                      return (
                        <TableRow key={day} className={keyDay ? "bg-muted/30" : undefined}>
                          <TableCell className="font-mono text-[11px]">
                            {day} <span className="text-muted-foreground">({fmtDayShort(day)})</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {typeof sent === "number" ? fmtInt(sent) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {typeof queued === "number" ? fmtInt(queued) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {tableDays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          {loading ? "Loading…" : "No data"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart" className="m-0">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Sent / day</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {sentSeries.length > 0 ? <SentChart series={sentSeries} /> : (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No data"}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Queued</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {queueSeries.length > 0 ? <QueueChart series={queueSeries} /> : (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No queue"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
