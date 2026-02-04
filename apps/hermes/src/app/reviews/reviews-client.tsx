"use client";

import * as React from "react";
import { Ban, Loader2, MailCheck, ShieldAlert, Timer, PackageCheck, Copy } from "lucide-react";
import { toast } from "sonner";

import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { KpiCard } from "@/components/hermes/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectionsStore } from "@/stores/connections-store";
import { useHermesUiPreferencesStore } from "@/stores/ui-preferences-store";

type Overview = {
  rangeDays: number;
  fromIso: string;
  toIso: string;
  summary: {
    sentInRange: number;
    attemptedDispatchesInRange: number;
    ineligibleDispatchesInRange: number;
    attemptsInRange: { sent: number; ineligible: number; throttled: number; failed: number };
    dispatchStateNow: { queued: number; sending: number; sent: number; skipped: number; failed: number };
    orders: { total: number; importedInRange: number; withAnyDispatch: number };
  };
  series: Array<{
    day: string;
    sent: number;
    ineligible: number;
    ineligibleUnique: number;
    throttled: number;
    failed: number;
    attemptedUnique: number;
  }>;
};

type Sample = {
  orderId: string;
  marketplaceId: string;
  sentAt: string;
};

const marketplaceCountryById: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A1F83G8C2ARO7P: "UK",
};

function fmtDayShort(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function compact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  const v = (n / d) * 100;
  return `${v.toFixed(1)}%`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

export function ReviewsClient() {
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

  const uiHydrated = useHermesUiPreferencesStore((s) => s.hasHydrated);
  const rangeDays = useHermesUiPreferencesStore((s) => s.insights.rangeDays);
  const setInsightsPreferences = useHermesUiPreferencesStore((s) => s.setInsightsPreferences);

  const connectionId = activeConnectionId ?? "";
  const connection = connections.find((c) => c.id === connectionId) ?? null;

  const [loading, setLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [samples, setSamples] = React.useState<Sample[]>([]);

  React.useEffect(() => {
    if (!uiHydrated) return;
    if (!connectionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("connectionId", connectionId);
        qs.set("rangeDays", String(rangeDays));

        const [overviewRes, samplesRes] = await Promise.all([
          fetch(hermesApiUrl(`/api/reviews/overview?${qs.toString()}`)),
          fetch(hermesApiUrl(`/api/reviews/samples?connectionId=${encodeURIComponent(connectionId)}&limit=10`)),
        ]);

        const o = await overviewRes.json();
        const s = await samplesRes.json();

        if (!overviewRes.ok || o?.ok !== true) {
          throw new Error(o?.error ?? `HTTP ${overviewRes.status}`);
        }

        if (!cancelled) {
          setOverview(o.overview as Overview);
          setSamples(Array.isArray(s?.samples) ? (s.samples as Sample[]) : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setOverview(null);
          setSamples([]);
        }
        toast.error("Could not load review outcomes", { description: e?.message ?? "" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [uiHydrated, connectionId, rangeDays]);

  const country = connection?.marketplaceIds?.[0] ? marketplaceCountryById[connection.marketplaceIds[0]] ?? null : null;
  const sentTotal = overview?.summary.dispatchStateNow.sent ?? 0;
  const ordersTotal = overview?.summary.orders.total ?? 0;
  const ordersWithDispatch = overview?.summary.orders.withAnyDispatch ?? 0;

  if (!uiHydrated) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reviews"
        subtitle={
          <span className="inline-flex items-center gap-2">
            Request-a-Review outcomes
            {country ? <Badge variant="secondary">{country}</Badge> : null}
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <Tabs value={String(rangeDays)} onValueChange={(v) => setInsightsPreferences({ rangeDays: Number(v) as 7 | 30 | 90 })}>
              <TabsList>
                <TabsTrigger value="7">7d</TabsTrigger>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={connectionId} onValueChange={setActiveConnectionId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={connectionsLoading ? "Loading…" : "Select account"} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.accountName} • {c.region} • {(c.marketplaceIds ?? []).join(",")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label={`Sent (${rangeDays}d)`} value={loading ? "—" : compact(overview?.summary.sentInRange ?? 0)} icon={MailCheck} />
        <KpiCard
          label="Ineligible (attempts)"
          value={loading ? "—" : compact(overview?.summary.attemptsInRange.ineligible ?? 0)}
          icon={Ban}
          hint={overview ? `${compact(overview.summary.ineligibleDispatchesInRange)} orders` : undefined}
        />
        <KpiCard label="Throttled" value={loading ? "—" : compact(overview?.summary.attemptsInRange.throttled ?? 0)} icon={Timer} />
        <KpiCard label="Failed" value={loading ? "—" : compact(overview?.summary.attemptsInRange.failed ?? 0)} icon={ShieldAlert} />
        <KpiCard
          label="Orders synced"
          value={loading ? "—" : compact(ordersTotal)}
          icon={PackageCheck}
          hint={overview ? `${compact(overview.summary.orders.importedInRange)} imported` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Totals</CardTitle>
          {overview ? (
            <div className="text-xs text-muted-foreground">
              Sent: {sentTotal}/{ordersWithDispatch} ({pct(sentTotal, ordersWithDispatch)}) • Out of orders: {sentTotal}/{ordersTotal} ({pct(sentTotal, ordersTotal)})
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <MiniStat label="Sent (all time)" value={sentTotal} loading={loading} />
          <MiniStat label="Queued" value={overview?.summary.dispatchStateNow.queued ?? 0} loading={loading} />
          <MiniStat label="Skipped" value={overview?.summary.dispatchStateNow.skipped ?? 0} loading={loading} />
          <MiniStat label="Failed" value={overview?.summary.dispatchStateNow.failed ?? 0} loading={loading} />
          <MiniStat label="Orders w/dispatch" value={ordersWithDispatch} loading={loading} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Daily outcomes (UTC)</CardTitle>
          <div className="text-xs text-muted-foreground">Ineligible is a preflight outcome; Hermes retries until eligible or expired.</div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-9 px-3">Day</TableHead>
                <TableHead className="h-9 px-3 text-right">Sent</TableHead>
                <TableHead className="h-9 px-3 text-right">Ineligible (attempts)</TableHead>
                <TableHead className="h-9 px-3 text-right">Ineligible (orders)</TableHead>
                <TableHead className="h-9 px-3 text-right">Throttled</TableHead>
                <TableHead className="h-9 px-3 text-right">Failed</TableHead>
                <TableHead className="h-9 px-3 text-right">Orders touched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview?.series ?? [])
                .slice()
                .reverse()
                .map((d) => (
                  <TableRow key={d.day}>
                    <TableCell className="px-3 py-2 font-medium">{fmtDayShort(d.day)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.sent)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.ineligible)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.ineligibleUnique)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.throttled)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.failed)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{compact(d.attemptedUnique)}</TableCell>
                  </TableRow>
                ))}
              {!loading && (overview?.series?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No data in range
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent sends (verification)</CardTitle>
          <div className="text-xs text-muted-foreground">Use these order IDs in Seller Central → Manage Orders</div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="h-9 px-3">Order ID</TableHead>
                <TableHead className="h-9 px-3">Marketplace</TableHead>
                <TableHead className="h-9 px-3">Sent at</TableHead>
                <TableHead className="h-9 px-3 text-right">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map((s) => (
                <TableRow key={s.orderId}>
                  <TableCell className="px-3 py-2 font-mono text-[11px]">{s.orderId}</TableCell>
                  <TableCell className="px-3 py-2">{marketplaceCountryById[s.marketplaceId] ?? s.marketplaceId}</TableCell>
                  <TableCell className="px-3 py-2 text-muted-foreground">{new Date(s.sentAt).toLocaleString()}</TableCell>
                  <TableCell className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => copy(s.orderId)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && samples.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                    No sends yet for this account
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{loading ? "—" : compact(value)}</div>
    </div>
  );
}

