"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
    orders: {
      total: number;
      shipped: number;
      pending: number;
      canceled: number;
      oldestPurchaseIso: string | null;
      newestPurchaseIso: string | null;
      importedInRange: number;
      withAnyDispatch: number;
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

function fmtIsoDay(iso: string | null): string {
  if (!iso) return "—";
  if (iso.length >= 10) return iso.slice(0, 10);
  return iso;
}

const MARKETPLACE_LABELS: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A1F83G8C2ARO7P: "UK",
};

function connectionShortLabel(c: { marketplaceIds: string[]; accountName: string }): string {
  for (const id of c.marketplaceIds) {
    const label = MARKETPLACE_LABELS[id];
    if (label) return label;
  }
  return c.accountName;
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

function MultiSentChart(params: {
  data: Array<{ day: string } & Record<string, number | string>>;
  bars: Array<{ key: string; label: string; color: string }>;
}) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={params.data} margin={{ left: 6, right: 10, top: 12, bottom: 6 }}>
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
            formatter={(value, name) => [fmtInt(Number(value ?? 0)), String(name)]}
            labelFormatter={(label) => String(label)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {params.bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MultiQueueChart(params: {
  data: Array<{ day: string } & Record<string, number | string>>;
  bars: Array<{ key: string; label: string; color: string }>;
}) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={params.data} margin={{ left: 6, right: 10, top: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="day" tickFormatter={fmtDayShort} className="text-[11px]" />
          <YAxis className="text-[11px]" width={36} />
          <Tooltip
            formatter={(value, name) => [fmtInt(Number(value ?? 0)), String(name)]}
            labelFormatter={(label) => String(label)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {params.bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
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
    fetch: fetchConnections,
  } = useConnectionsStore();

  React.useEffect(() => {
    if (!connectionsHydrated) return;
    fetchConnections();
  }, [connectionsHydrated, fetchConnections]);

  const uiHydrated = useHermesUiPreferencesStore((s) => s.hasHydrated);
  const rangeDays = useHermesUiPreferencesStore((s) => s.insights.rangeDays);
  const setInsightsPreferences = useHermesUiPreferencesStore((s) => s.setInsightsPreferences);

  const [scopeConnectionId, setScopeConnectionId] = React.useState<string>("all");

  const connectionIdsKey = React.useMemo(
    () => connections.map((c) => c.id).sort().join("|"),
    [connections]
  );
  const [allOverviews, setAllOverviews] = React.useState<Record<string, Overview | null>>({});
  const [allLoading, setAllLoading] = React.useState(false);

  React.useEffect(() => {
    if (!uiHydrated) return;
    setScopeConnectionId((prev) => {
      if (connections.length === 0) return prev;
      if (connections.length === 1) return connections[0]!.id;
      if (prev === "all") return prev;
      const exists = connections.some((c) => c.id === prev);
      return exists ? prev : "all";
    });
  }, [uiHydrated, connections]);

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

  const todayUtc = new Date().toISOString().slice(0, 10);
  const tomorrowUtc = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const scopedConnections = React.useMemo(() => {
    if (scopeConnectionId === "all") return connections;
    return connections.filter((c) => c.id === scopeConnectionId);
  }, [connections, scopeConnectionId]);

  const scopedOverviews = React.useMemo(() => {
    return scopedConnections.map((c) => ({ connection: c, overview: allOverviews[c.id] ?? null }));
  }, [scopedConnections, allOverviews]);

  const hasMulti = scopedConnections.length > 1;

  const bars = React.useMemo(() => {
    const colors = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ];

    return scopedConnections.map((c, idx) => ({
      key: c.id,
      label: connectionShortLabel(c),
      color: colors[idx % colors.length],
    }));
  }, [scopedConnections]);

  const sentSeriesByConnection = React.useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const { connection, overview } of scopedOverviews) {
      const map = new Map<string, number>();
      if (overview) {
        for (const d of overview.series) map.set(d.day, d.sent);
      }
      out.set(connection.id, map);
    }
    return out;
  }, [scopedOverviews]);

  const queuedSeriesByConnection = React.useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const { connection, overview } of scopedOverviews) {
      const map = new Map<string, number>();
      if (overview) {
        for (const d of overview.queue.series) map.set(d.day, d.queued);
      }
      out.set(connection.id, map);
    }
    return out;
  }, [scopedOverviews]);

  const tableDays = React.useMemo(() => {
    const days = new Set<string>();
    for (const map of sentSeriesByConnection.values()) {
      for (const day of map.keys()) days.add(day);
    }
    for (const map of queuedSeriesByConnection.values()) {
      for (const day of map.keys()) days.add(day);
    }

    const out = Array.from(days);
    out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return out;
  }, [sentSeriesByConnection, queuedSeriesByConnection]);

  const sentInRange = React.useMemo(() => {
    let sum = 0;
    for (const { overview } of scopedOverviews) sum += overview ? overview.summary.sentInRange : 0;
    return sum;
  }, [scopedOverviews]);

  const queuedToday = React.useMemo(() => {
    let sum = 0;
    for (const { overview } of scopedOverviews) sum += overview ? (overview.queue.series[0]?.queued ?? 0) : 0;
    return sum;
  }, [scopedOverviews]);

  const queuedTomorrow = React.useMemo(() => {
    let sum = 0;
    for (const { overview } of scopedOverviews) sum += overview ? (overview.queue.series[1]?.queued ?? 0) : 0;
    return sum;
  }, [scopedOverviews]);

  const hasAnyOverview = React.useMemo(() => scopedOverviews.some((x) => x.overview), [scopedOverviews]);

  const overviewOrderRange = React.useMemo(() => {
    let oldest: string | null = null;
    let newest: string | null = null;
    for (const { overview } of scopedOverviews) {
      const nextOldest = overview?.summary.orders.oldestPurchaseIso ?? null;
      const nextNewest = overview?.summary.orders.newestPurchaseIso ?? null;
      if (typeof nextOldest === "string") {
        if (oldest === null || nextOldest < oldest) oldest = nextOldest;
      }
      if (typeof nextNewest === "string") {
        if (newest === null || nextNewest > newest) newest = nextNewest;
      }
    }
    if (!oldest && !newest) return null;
    return `${fmtIsoDay(oldest)} → ${fmtIsoDay(newest)}`;
  }, [scopedOverviews]);

  const sentChartData = React.useMemo(() => {
    const dayToRow = new Map<string, { day: string } & Record<string, number | string>>();
    for (const day of tableDays) {
      if (day > todayUtc) continue;
      dayToRow.set(day, { day });
    }

    for (const c of scopedConnections) {
      const map = sentSeriesByConnection.get(c.id);
      if (!map) continue;
      for (const [day, sent] of map.entries()) {
        if (day > todayUtc) continue;
        const row = dayToRow.get(day);
        if (row) row[c.id] = sent;
      }
    }

    const out = Array.from(dayToRow.values());
    out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return out;
  }, [scopedConnections, sentSeriesByConnection, tableDays, todayUtc]);

  const queueChartData = React.useMemo(() => {
    const dayToRow = new Map<string, { day: string } & Record<string, number | string>>();
    for (const day of tableDays) {
      if (day < todayUtc) continue;
      dayToRow.set(day, { day });
    }

    for (const c of scopedConnections) {
      const map = queuedSeriesByConnection.get(c.id);
      if (!map) continue;
      for (const [day, queued] of map.entries()) {
        if (day < todayUtc) continue;
        const row = dayToRow.get(day);
        if (row) row[c.id] = queued;
      }
    }

    const out = Array.from(dayToRow.values());
    out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return out;
  }, [scopedConnections, queuedSeriesByConnection, tableDays, todayUtc]);

  const accountsTableRows = React.useMemo(() => {
    const rows = connections.map((c) => {
      const ov = allOverviews[c.id] ?? null;
      const sentAll = ov ? ov.summary.dispatchStateNow.sent : null;
      const sentRange = ov ? ov.summary.sentInRange : null;
      const queuedAll = ov ? ov.summary.dispatchStateNow.queued : null;
      const shipped = ov ? ov.summary.orders.shipped : null;
      const pending = ov ? ov.summary.orders.pending : null;
      const canceled = ov ? ov.summary.orders.canceled : null;
      const queuedToday = ov ? (ov.queue.series[0]?.queued ?? 0) : null;
      const queuedTomorrow = ov ? (ov.queue.series[1]?.queued ?? 0) : null;
      const queuedNext7 = ov ? ov.queue.queuedTotal : null;

      return {
        id: c.id,
        label: `${connectionShortLabel(c)} • ${c.accountName}`,
        active: scopeConnectionId === c.id,
        shipped,
        pending,
        canceled,
        sentAll,
        sentRange,
        queuedAll,
        queuedToday,
        queuedTomorrow,
        queuedNext7,
      };
    });

    if (connections.length <= 1) return rows;

    let shipped = 0;
    let pending = 0;
    let canceled = 0;
    let sentAll = 0;
    let sentRange = 0;
    let queuedAll = 0;
    let queuedToday = 0;
    let queuedTomorrow = 0;
    let queuedNext7 = 0;
    let seen = 0;

    for (const r of rows) {
      if (typeof r.shipped !== "number") continue;
      seen += 1;
      shipped += r.shipped;
      pending += r.pending ?? 0;
      canceled += r.canceled ?? 0;
      sentAll += r.sentAll ?? 0;
      sentRange += r.sentRange ?? 0;
      queuedAll += r.queuedAll ?? 0;
      queuedToday += r.queuedToday ?? 0;
      queuedTomorrow += r.queuedTomorrow ?? 0;
      queuedNext7 += r.queuedNext7 ?? 0;
    }

    const allRow = {
      id: "all",
      label: "All accounts",
      active: scopeConnectionId === "all",
      shipped: seen > 0 ? shipped : null,
      pending: seen > 0 ? pending : null,
      canceled: seen > 0 ? canceled : null,
      sentAll: seen > 0 ? sentAll : null,
      sentRange: seen > 0 ? sentRange : null,
      queuedAll: seen > 0 ? queuedAll : null,
      queuedToday: seen > 0 ? queuedToday : null,
      queuedTomorrow: seen > 0 ? queuedTomorrow : null,
      queuedNext7: seen > 0 ? queuedNext7 : null,
    };

    return [allRow, ...rows];
  }, [connections, allOverviews, scopeConnectionId]);

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

            {connections.length > 1 ? (
              <Select value={scopeConnectionId} onValueChange={setScopeConnectionId}>
                <SelectTrigger className="h-9 w-[220px]" disabled={connectionsLoading}>
                  <SelectValue placeholder={connectionsLoading ? "Loading…" : "Scope"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {connectionShortLabel(c)} • {c.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
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
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Sent / shipped</TableHead>
                    <TableHead className="text-right">Sent ({rangeDays}d)</TableHead>
                    <TableHead className="text-right">Queued</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Canceled</TableHead>
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
                      onClick={() => setScopeConnectionId(r.id)}
                    >
                      <TableCell className="min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{r.label}</span>
                          {r.active ? <Badge variant="secondary" className="text-[10px]">Scope</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(typeof r.sentAll === "number" && typeof r.shipped === "number")
                          ? `${fmtInt(r.sentAll)} / ${fmtInt(r.shipped)}`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.sentRange === "number" ? fmtInt(r.sentRange) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.queuedAll === "number" ? fmtInt(r.queuedAll) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.pending === "number" ? fmtInt(r.pending) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof r.canceled === "number" ? fmtInt(r.canceled) : <span className="text-muted-foreground">—</span>}
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
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
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
            {overviewOrderRange ? <Badge variant="outline">Orders {overviewOrderRange}</Badge> : null}
            <Badge variant="secondary">Sent ({rangeDays}d) {hasAnyOverview ? fmtInt(sentInRange) : "—"}</Badge>
            <Badge variant="outline">Queued today {hasAnyOverview ? fmtInt(queuedToday) : "—"}</Badge>
            <Badge variant="outline">Queued tomorrow {hasAnyOverview ? fmtInt(queuedTomorrow) : "—"}</Badge>
            {allLoading ? (
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
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Day (UTC)</TableHead>
                      {hasMulti ? (
                        <>
                          {scopedConnections.map((c) => (
                            <TableHead key={`sent-${c.id}`} className="text-right whitespace-nowrap">
                              Sent {connectionShortLabel(c)}
                            </TableHead>
                          ))}
                          <TableHead className="text-right whitespace-nowrap">Sent</TableHead>
                          {scopedConnections.map((c) => (
                            <TableHead key={`queued-${c.id}`} className="text-right whitespace-nowrap">
                              Queued {connectionShortLabel(c)}
                            </TableHead>
                          ))}
                          <TableHead className="text-right whitespace-nowrap">Queued</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-right">Sent</TableHead>
                          <TableHead className="text-right">Queued</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableDays.map((day) => {
                      const keyDay = day === todayUtc || day === tomorrowUtc;
                      let sentTotal = 0;
                      let queuedTotal = 0;

                      for (const c of scopedConnections) {
                        sentTotal += sentSeriesByConnection.get(c.id)?.get(day) ?? 0;
                        queuedTotal += queuedSeriesByConnection.get(c.id)?.get(day) ?? 0;
                      }

                      return (
                        <TableRow key={day} className={keyDay ? "bg-muted/30" : undefined}>
                          <TableCell className="font-mono text-[11px]">
                            {day} <span className="text-muted-foreground">({fmtDayShort(day)})</span>
                          </TableCell>
                          {hasMulti ? (
                            <>
                              {scopedConnections.map((c) => {
                                const sent = sentSeriesByConnection.get(c.id)?.get(day);
                                return (
                                  <TableCell key={`sent-${c.id}-${day}`} className="text-right tabular-nums">
                                    {typeof sent === "number" ? fmtInt(sent) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right tabular-nums">{fmtInt(sentTotal)}</TableCell>
                              {scopedConnections.map((c) => {
                                const queued = queuedSeriesByConnection.get(c.id)?.get(day);
                                return (
                                  <TableCell key={`queued-${c.id}-${day}`} className="text-right tabular-nums">
                                    {typeof queued === "number" ? fmtInt(queued) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right tabular-nums">{fmtInt(queuedTotal)}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="text-right tabular-nums">
                                {fmtInt(sentTotal)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtInt(queuedTotal)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                    {tableDays.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={hasMulti ? scopedConnections.length * 2 + 3 : 3}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          {allLoading ? "Loading…" : "No data"}
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
                {sentChartData.length > 0 ? (
                  hasMulti ? <MultiSentChart data={sentChartData} bars={bars} /> : (
                    <SentChart series={(scopedOverviews[0]?.overview?.series ?? []) as Overview["series"]} />
                  )
                ) : (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    {allLoading ? "Loading…" : "No data"}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Queued</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {queueChartData.length > 0 ? (
                  hasMulti ? <MultiQueueChart data={queueChartData} bars={bars} /> : (
                    <QueueChart series={(scopedOverviews[0]?.overview?.queue.series ?? []) as Overview["queue"]["series"]} />
                  )
                ) : (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    {allLoading ? "Loading…" : "No queue"}
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
