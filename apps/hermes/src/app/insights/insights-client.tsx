"use client";

import * as React from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type ReviewSample = {
  orderId: string;
  marketplaceId: string;
  sentAt: string;
};

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtDayShort(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

  const [samples, setSamples] = React.useState<ReviewSample[]>([]);
  const [loadingSamples, setLoadingSamples] = React.useState(false);

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
    if (!connectionId) return;

    let cancelled = false;
    async function load() {
      setLoadingSamples(true);
      try {
        const qs = new URLSearchParams();
        qs.set("connectionId", connectionId);
        qs.set("limit", "25");
        const res = await fetch(hermesApiUrl(`/api/reviews/samples?${qs.toString()}`));
        const json = await res.json();
        if (!res.ok || json?.ok !== true) {
          throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
        }
        const next = Array.isArray(json.samples) ? (json.samples as ReviewSample[]) : [];
        if (!cancelled) setSamples(next);
      } catch (e: any) {
        if (!cancelled) setSamples([]);
        toast.error("Could not load samples", { description: e?.message ?? "" });
      } finally {
        if (!cancelled) setLoadingSamples(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [uiHydrated, connectionId]);

  const summary = overview?.summary ?? null;
  const notQueuedOrders = summary ? summary.orders.total - summary.orders.withAnyDispatch : 0;

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

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">Sent ({rangeDays}d) {summary ? fmtInt(summary.sentInRange) : "—"}</Badge>
        <Badge variant="outline">Queued {summary ? fmtInt(summary.dispatchStateNow.queued) : "—"}</Badge>
        <Badge variant="outline">Sending {summary ? fmtInt(summary.dispatchStateNow.sending) : "—"}</Badge>
        <Badge variant="outline">Orders {summary ? fmtInt(summary.orders.total) : "—"}</Badge>
        <Badge variant="outline">Not queued {summary ? fmtInt(notQueuedOrders) : "—"}</Badge>
        <Badge variant="outline">Ineligible (attempts) {summary ? fmtInt(summary.attemptsInRange.ineligible) : "—"}</Badge>
        <Badge variant="outline">Ineligible (orders) {summary ? fmtInt(summary.ineligibleDispatchesInRange) : "—"}</Badge>
        <Badge variant="outline">Throttled {summary ? fmtInt(summary.attemptsInRange.throttled) : "—"}</Badge>
        <Badge variant="outline">Failed {summary ? fmtInt(summary.attemptsInRange.failed) : "—"}</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Review requests</CardTitle>
          <div className="text-xs text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="daily">
            <div className="border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="queue">Queue</TabsTrigger>
                <TabsTrigger value="samples">Recent sends</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="daily" className="m-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day (UTC)</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Attempted</TableHead>
                      <TableHead className="text-right">Ineligible (orders)</TableHead>
                      <TableHead className="text-right">Ineligible (attempts)</TableHead>
                      <TableHead className="text-right">Throttled</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overview?.series ?? []).map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="font-mono text-[11px]">
                          {d.day} <span className="text-muted-foreground">({fmtDayShort(d.day)})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.sent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.attemptedUnique)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.ineligibleUnique)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.ineligible)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.throttled)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(d.failed)}</TableCell>
                      </TableRow>
                    ))}
                    {overview?.series?.length ? null : (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          No data
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="queue" className="m-0">
              <div className="max-h-[60vh] overflow-auto p-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-xs">Dispatch state</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table className="text-xs">
                        <TableBody>
                          {summary ? (
                            <>
                              <TableRow>
                                <TableCell>Queued</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.dispatchStateNow.queued)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Sending</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.dispatchStateNow.sending)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Sent</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.dispatchStateNow.sent)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Skipped</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.dispatchStateNow.skipped)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Failed</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.dispatchStateNow.failed)}</TableCell>
                              </TableRow>
                            </>
                          ) : (
                            <TableRow>
                              <TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">
                                No data
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-xs">Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table className="text-xs">
                        <TableBody>
                          {summary ? (
                            <>
                              <TableRow>
                                <TableCell>Total</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.orders.total)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>With review dispatch</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.orders.withAnyDispatch)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Not queued</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(notQueuedOrders)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell>Imported ({rangeDays}d)</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtInt(summary.orders.importedInRange)}</TableCell>
                              </TableRow>
                            </>
                          ) : (
                            <TableRow>
                              <TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">
                                No data
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="samples" className="m-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead className="hidden sm:table-cell">Marketplace</TableHead>
                      <TableHead className="hidden sm:table-cell">Sent</TableHead>
                      <TableHead className="w-[1%] text-right">Copy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {samples.map((s) => (
                      <TableRow key={s.orderId}>
                        <TableCell className="font-mono text-[11px]">{s.orderId}</TableCell>
                        <TableCell className="hidden sm:table-cell">{s.marketplaceId}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{fmtDateTime(s.sentAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Copy order id"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(s.orderId);
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {samples.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          {loadingSamples ? "Loading…" : "No sends"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

