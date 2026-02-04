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

  const sentSeries = overview?.series ?? [];
  const queueSeries = overview?.queue?.series ?? [];
  const queuedTomorrow = queueSeries[0]?.queued ?? 0;
  const sentInRange = overview?.summary?.sentInRange ?? 0;

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

      <Tabs defaultValue="table">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">Sent ({rangeDays}d) {overview ? fmtInt(sentInRange) : "—"}</Badge>
            <Badge variant="outline">Queued tomorrow {overview ? fmtInt(queuedTomorrow) : "—"}</Badge>
            {loading ? (
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
              <CardTitle className="text-sm">Sent per day</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day (UTC)</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentSeries.slice().reverse().map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="font-mono text-[11px]">
                          {d.day} <span className="text-muted-foreground">({fmtDayShort(d.day)})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.sent)}</TableCell>
                      </TableRow>
                    ))}
                    {sentSeries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">
                          {loading ? "Loading…" : "No data"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Queued (next {overview?.queue?.nextDays ?? 7} days)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[40vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day (UTC)</TableHead>
                      <TableHead className="text-right">Queued</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueSeries.map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="font-mono text-[11px]">
                          {d.day} <span className="text-muted-foreground">({fmtDayShort(d.day)})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.queued)}</TableCell>
                      </TableRow>
                    ))}
                    {queueSeries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">
                          {loading ? "Loading…" : "No queue"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart" className="m-0 space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Sent per day</CardTitle>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

