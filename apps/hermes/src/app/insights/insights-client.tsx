"use client";

import * as React from "react";
import { Ban, MailCheck, ShieldAlert, Timer, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import type { AmazonConnection } from "@/lib/types";
import { PageHeader } from "@/components/hermes/page-header";
import { KpiCard } from "@/components/hermes/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Recharts (shadcn/ui charts are built on this)
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

type Overview = {
  rangeDays: number;
  fromIso: string;
  toIso: string;
  summary: {
    sentInRange: number;
    attemptsInRange: { sent: number; ineligible: number; throttled: number; failed: number };
    dispatchStateNow: { queued: number; sending: number; sent: number; skipped: number; failed: number };
    orders: { total: number; importedInRange: number; withAnyDispatch: number };
  };
  series: Array<{ day: string; sent: number; ineligible: number; throttled: number; failed: number }>;
};

function fmtDayShort(day: string): string {
  // day is YYYY-MM-DD
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function compact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-sm">
      <div className="text-xs text-muted-foreground">{fmtDayShort(label)}</div>
      <div className="mt-2 grid gap-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">{p.name}</div>
            <div className="font-medium">{p.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InsightsClient({ connections }: { connections: AmazonConnection[] }) {
  const [connectionId, setConnectionId] = React.useState(connections[0]?.id ?? "");
  const [rangeDays, setRangeDays] = React.useState<7 | 30 | 90>(30);
  const [loading, setLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<Overview | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("rangeDays", String(rangeDays));
        if (connectionId) qs.set("connectionId", connectionId);

        const res = await fetch(`/api/analytics/overview?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setOverview(json.overview);
      } catch (e: any) {
        if (!cancelled) setOverview(null);
        toast.error("Analytics unavailable", {
          description: e?.message ?? "Verify DATABASE_URL and run migrations.",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [connectionId, rangeDays]);

  const series = overview?.series ?? [];

  const kpis = React.useMemo(() => {
    if (!overview) {
      return {
        sent: 0,
        ineligible: 0,
        throttled: 0,
        failed: 0,
        orders: 0,
      };
    }
    return {
      sent: overview.summary.sentInRange,
      ineligible: overview.summary.attemptsInRange.ineligible,
      throttled: overview.summary.attemptsInRange.throttled,
      failed: overview.summary.attemptsInRange.failed,
      orders: overview.summary.orders.total,
    };
  }, [overview]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        right={
          <div className="flex items-center gap-2">
            <Tabs value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v) as any)}>
              <TabsList>
                <TabsTrigger value="7">7d</TabsTrigger>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label={`Sent (${rangeDays}d)`}
          value={loading ? "—" : compact(kpis.sent)}
          icon={MailCheck}
        />
        <KpiCard
          label="Ineligible"
          value={loading ? "—" : compact(kpis.ineligible)}
          icon={Ban}
        />
        <KpiCard
          label="Throttled"
          value={loading ? "—" : compact(kpis.throttled)}
          icon={Timer}
        />
        <KpiCard
          label="Failed"
          value={loading ? "—" : compact(kpis.failed)}
          icon={ShieldAlert}
        />
        <KpiCard
          label="Orders synced"
          value={loading ? "—" : compact(kpis.orders)}
          icon={PackageCheck}
          hint={overview ? `${compact(overview.summary.orders.importedInRange)} imported` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Sends</CardTitle>
            {overview ? (
              <div className="text-xs text-muted-foreground">
                {fmtDayShort(overview.series[0]?.day ?? dayKey(new Date()))}–{fmtDayShort(overview.series[overview.series.length - 1]?.day ?? dayKey(new Date()))}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={fmtDayShort}
                  interval="preserveStartEnd"
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip content={<TooltipCard />} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Sent"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={fmtDayShort}
                  interval="preserveStartEnd"
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip content={<TooltipCard />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ineligible" name="Ineligible" stackId="a" fill="hsl(var(--muted-foreground))" />
                <Bar dataKey="throttled" name="Throttled" stackId="a" fill="hsl(var(--secondary-foreground))" />
                <Bar dataKey="failed" name="Failed" stackId="a" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Queue health</CardTitle>
          <div className="text-xs text-muted-foreground">Now</div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <MiniStat label="Queued" value={overview?.summary.dispatchStateNow.queued ?? 0} loading={loading} />
          <MiniStat label="Sending" value={overview?.summary.dispatchStateNow.sending ?? 0} loading={loading} />
          <MiniStat label="Sent" value={overview?.summary.dispatchStateNow.sent ?? 0} loading={loading} />
          <MiniStat label="Skipped" value={overview?.summary.dispatchStateNow.skipped ?? 0} loading={loading} />
          <MiniStat label="Failed" value={overview?.summary.dispatchStateNow.failed ?? 0} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function MiniStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{loading ? "—" : compact(value)}</div>
    </div>
  );
}
