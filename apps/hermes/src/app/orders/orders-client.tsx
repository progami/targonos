"use client";

import * as React from "react";
import { CalendarClock, PackageSearch, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { AmazonConnection } from "@/lib/types";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hermesApiUrl } from "@/lib/base-path";
import { useConnectionsStore } from "@/stores/connections-store";

type RecentOrder = {
  orderId: string;
  marketplaceId: string;
  purchaseDate: string | null;
  latestDeliveryDate: string | null;
  orderStatus: string | null;
  fulfillmentChannel: string | null;
  dispatchState: string | null;
  dispatchScheduledAt: string | null;
  dispatchExpiresAt: string | null;
  dispatchSentAt: string | null;
};

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTimeShort(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;

  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function shortMarketplace(id: string) {
  if (!id) return "";
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id;
}

const marketplaceCountryById: Record<string, string> = {
  ATVPDKIKX0DER: "US", // Amazon.com
  A1F83G8C2ARO7P: "UK", // Amazon.co.uk
};

function marketplaceCountry(id: string): string | null {
  if (!id) return null;
  const code = marketplaceCountryById[id];
  if (typeof code === "string") return code;
  return null;
}

function marketplaceDisplay(id: string): string {
  const code = marketplaceCountry(id);
  if (code) return code;
  return shortMarketplace(id);
}

function connectionLabel(c: AmazonConnection): string {
  const firstMarketplace = c.marketplaceIds[0];
  const suffixCount = c.marketplaceIds.length > 1 ? c.marketplaceIds.length - 1 : 0;
  const suffix = suffixCount > 0 ? ` +${suffixCount}` : "";
  const marketplacePart = firstMarketplace ? ` • ${marketplaceDisplay(firstMarketplace)}${suffix}` : "";
  return `${c.accountName} • ${c.region}${marketplacePart}`;
}

function stateBadge(state: string | null) {
  if (!state) return <Badge variant="outline">Not queued</Badge>;
  if (state === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (state === "queued") return <Badge variant="outline">Queued</Badge>;
  if (state === "sending") return <Badge variant="outline">Sending</Badge>;
  if (state === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (state === "skipped") return <Badge variant="outline">Skipped</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

type BackfillPreset = { label: string; days: number };
const presets: BackfillPreset[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "180d", days: 180 },
  { label: "2y", days: 730 },
];

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function isoMinutesAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000);
  return d.toISOString();
}

function clampCreatedBefore(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;

  // Amazon Orders API rejects CreatedBefore values too close to "now" (and any future time).
  // Keep a small safety buffer to avoid 400 InvalidInput and gateway retries.
  const maxMs = Date.now() - 5 * 60 * 1000;
  const clampedMs = Math.min(d.getTime(), maxMs);
  return new Date(clampedMs).toISOString();
}

function toDateInputValue(iso: string): string {
  // yyyy-mm-dd
  return iso.slice(0, 10);
}

function fromDateInputValue(value: string): string {
  // value is yyyy-mm-dd; interpret as start-of-day UTC
  return new Date(`${value}T00:00:00Z`).toISOString();
}

function fromDateInputValueEnd(value: string): string {
  // value is yyyy-mm-dd; interpret as end-of-day UTC
  return new Date(`${value}T23:59:59Z`).toISOString();
}

export function OrdersClient() {
  const {
    connections,
    loaded: connectionsLoaded,
    loading: connectionsLoading,
    activeConnectionId,
    setActiveConnectionId,
    fetch: fetchConnections,
  } = useConnectionsStore();

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const connectionId = activeConnectionId ?? "";
  const connection = connections.find((c) => c.id === connectionId);

  const [orders, setOrders] = React.useState<RecentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const loadSeqRef = React.useRef(0);
  const [pageSize, setPageSize] = React.useState<number>(50);
  const [ordersCursor, setOrdersCursor] = React.useState<string | null>(null);
  const [ordersNextCursor, setOrdersNextCursor] = React.useState<string | null>(null);
  const [ordersCursorStack, setOrdersCursorStack] = React.useState<(string | null)[]>([]);
  const [ordersTotalCount, setOrdersTotalCount] = React.useState<number | null>(null);
  const [loadingOrdersTotal, setLoadingOrdersTotal] = React.useState(false);
  const totalSeqRef = React.useRef(0);

  // Table filters
  const [filterMarketplaceId, setFilterMarketplaceId] = React.useState<string>("any");
  const [filterDelivery, setFilterDelivery] = React.useState<string>("any");
  const [filterOrderStatus, setFilterOrderStatus] = React.useState<string>("any");
  const [filterReviewState, setFilterReviewState] = React.useState<string>("any");

  // Backfill dialog
  const [open, setOpen] = React.useState(false);
  const [presetDays, setPresetDays] = React.useState<number>(60);
  const [createdAfter, setCreatedAfter] = React.useState<string>(isoDaysAgo(60));
  const [createdBefore, setCreatedBefore] = React.useState<string>(isoMinutesAgo(5));
  const [enqueue, setEnqueue] = React.useState(false);

  // Scheduling knobs (compact presets)
  const [delayDays, setDelayDays] = React.useState(10);
  const [windowEnabled, setWindowEnabled] = React.useState(true);
  const [startHour, setStartHour] = React.useState(9);
  const [endHour, setEndHour] = React.useState(18);
  const [spreadEnabled, setSpreadEnabled] = React.useState(true);
  const [spreadMaxMinutes, setSpreadMaxMinutes] = React.useState(90);

  // Progress state
  const [syncing, setSyncing] = React.useState(false);
  const [pages, setPages] = React.useState(0);
  const [imported, setImported] = React.useState(0);
  const [enqueued, setEnqueued] = React.useState(0);
  const [alreadyExists, setAlreadyExists] = React.useState(0);
  const [skippedExpired, setSkippedExpired] = React.useState(0);
  const cancelRef = React.useRef(false);
  const [syncNote, setSyncNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Keep date inputs in sync with preset.
    setCreatedAfter(isoDaysAgo(presetDays));
    setCreatedBefore(isoMinutesAgo(5));
  }, [presetDays]);

  async function loadOrdersTotal() {
    if (!connectionId) return;
    const seq = totalSeqRef.current + 1;
    totalSeqRef.current = seq;

    setLoadingOrdersTotal(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      if (filterMarketplaceId !== "any") qs.set("marketplaceId", filterMarketplaceId);
      if (filterDelivery !== "any") qs.set("delivery", filterDelivery);
      if (filterOrderStatus !== "any") qs.set("orderStatus", filterOrderStatus);
      if (filterReviewState !== "any") qs.set("reviewState", filterReviewState);

      const res = await fetch(hermesApiUrl(`/api/orders/count?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }
      if (typeof json.total !== "number") {
        throw new Error("Invalid response (total)");
      }

      if (totalSeqRef.current !== seq) return;
      setOrdersTotalCount(json.total);
    } catch {
      if (totalSeqRef.current !== seq) return;
      setOrdersTotalCount(null);
    } finally {
      if (totalSeqRef.current !== seq) return;
      setLoadingOrdersTotal(false);
    }
  }

  async function loadOrdersPage(opts: { cursor: string | null; stack: (string | null)[] }) {
    if (!connectionId) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;

    setLoadingOrders(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      qs.set("limit", String(pageSize));
      if (opts.cursor) qs.set("cursor", opts.cursor);
      if (filterMarketplaceId !== "any") qs.set("marketplaceId", filterMarketplaceId);
      if (filterDelivery !== "any") qs.set("delivery", filterDelivery);
      if (filterOrderStatus !== "any") qs.set("orderStatus", filterOrderStatus);
      if (filterReviewState !== "any") qs.set("reviewState", filterReviewState);

      if (loadSeqRef.current !== seq) return;

      const res = await fetch(hermesApiUrl(`/api/orders/list?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }
      if (!Array.isArray(json.orders)) {
        throw new Error("Invalid response (orders)");
      }
      if (json.nextCursor !== null && typeof json.nextCursor !== "string") {
        throw new Error("Invalid response (nextCursor)");
      }

      if (loadSeqRef.current !== seq) return;
      setOrders(json.orders as RecentOrder[]);
      setOrdersCursor(opts.cursor);
      setOrdersCursorStack(opts.stack);
      setOrdersNextCursor(json.nextCursor);
    } catch (e: any) {
      if (loadSeqRef.current !== seq) return;
      setOrders([]);
      setOrdersCursor(null);
      setOrdersCursorStack([]);
      setOrdersNextCursor(null);
      toast.error("Could not load orders", { description: e?.message ?? "" });
    } finally {
      if (loadSeqRef.current !== seq) return;
      setLoadingOrders(false);
    }
  }

  React.useEffect(() => {
    loadOrdersPage({ cursor: null, stack: [] });
    loadOrdersTotal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, pageSize, filterMarketplaceId, filterDelivery, filterOrderStatus, filterReviewState]);

  async function runBackfill() {
    if (!connectionId || !connection?.marketplaceIds?.[0]) {
      toast.error("Select an account");
      return;
    }

    const maxGatewayAttempts = 20;

    function isRetryableGatewayStatus(status: number): boolean {
      // Cloudflare/origin transient gateway errors
      if (status === 502) return true;
      if (status === 503) return true;
      if (status === 504) return true;
      if (status === 520) return true;
      if (status === 521) return true;
      if (status === 522) return true;
      if (status === 523) return true;
      if (status === 524) return true;
      return false;
    }

    function gatewayRetryDelayMs(attempt: number): number {
      const base = Math.min(10_000, 500 * attempt);
      return base + Math.floor(Math.random() * 250);
    }

    async function waitWithCancel(ms: number, label?: (remainingMs: number) => string) {
      const endMs = Date.now() + ms;
      let lastSecond = -1;
      while (!cancelRef.current && Date.now() < endMs) {
        const remainingMs = endMs - Date.now();
        if (label) {
          const remainingSec = Math.ceil(remainingMs / 1000);
          if (remainingSec !== lastSecond) {
            lastSecond = remainingSec;
            setSyncNote(label(remainingMs));
          }
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, remainingMs)));
      }
    }

    cancelRef.current = false;
    setSyncing(true);
    setPages(0);
    setImported(0);
    setEnqueued(0);
    setAlreadyExists(0);
    setSkippedExpired(0);
    setSyncNote(null);

    const marketplaceId = connection.marketplaceIds[0];

    let nextToken: string | null = null;
    let page = 0;
    let importedTotal = 0;
    let enqueuedTotal = 0;
    let alreadyTotal = 0;
    let expiredTotal = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelRef.current) break;

        const body: any = {
          connectionId,
          marketplaceId,
          enqueueReviewRequests: enqueue,
          schedule: {
            delayDays,
            windowEnabled,
            startHour,
            endHour,
            spreadEnabled,
            spreadMaxMinutes,
          },
        };

        if (nextToken) body.nextToken = nextToken;
        else {
          body.createdAfter = createdAfter;
          body.createdBefore = clampCreatedBefore(createdBefore);
          body.orderStatuses = ["Shipped", "PartiallyShipped", "Unshipped"]; // pragmatic default
          body.maxResultsPerPage = 100;
        }

        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelRef.current) break;
          attempt += 1;

          setSyncNote(`Fetching page ${page + 1}…`);
          const res = await fetch(hermesApiUrl("/api/orders/backfill"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });

          const text = await res.text();
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            if (isRetryableGatewayStatus(res.status) && attempt <= maxGatewayAttempts) {
              const waitMs = gatewayRetryDelayMs(attempt);
              await waitWithCancel(waitMs, (remainingMs) => {
                const remainingSec = Math.ceil(remainingMs / 1000);
                return `Gateway error (${res.status}) — retrying in ${remainingSec}s (${attempt}/${maxGatewayAttempts})…`;
              });
              continue;
            }

            throw new Error(`HTTP ${res.status} (non-JSON)`);
          }

          if (res.status === 429) {
            const retryAfterMs = typeof json?.retryAfterMs === "number" ? json.retryAfterMs : null;
            if (retryAfterMs && retryAfterMs > 0) {
              const waitMs = retryAfterMs + Math.floor(Math.random() * 250);
              await waitWithCancel(waitMs, (remainingMs) => {
                const remainingSec = Math.ceil(remainingMs / 1000);
                return `Rate limited — retrying in ${remainingSec}s…`;
              });
              continue;
            }
            throw new Error(typeof json?.error === "string" ? json.error : "Rate limited");
          }

          if (isRetryableGatewayStatus(res.status) && attempt <= maxGatewayAttempts) {
            const waitMs = gatewayRetryDelayMs(attempt);
            await waitWithCancel(waitMs, (remainingMs) => {
              const remainingSec = Math.ceil(remainingMs / 1000);
              return `Gateway error (${res.status}) — retrying in ${remainingSec}s (${attempt}/${maxGatewayAttempts})…`;
            });
            continue;
          }

          if (!res.ok || !json?.ok) {
            throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
          }

          page += 1;
          setPages(page);

          importedTotal += json.imported ?? 0;
          enqueuedTotal += json.enqueue?.enqueued ?? 0;
          alreadyTotal += json.enqueue?.alreadyExists ?? 0;
          expiredTotal += json.enqueue?.skippedExpired ?? 0;

          setImported(importedTotal);
          setEnqueued(enqueuedTotal);
          setAlreadyExists(alreadyTotal);
          setSkippedExpired(expiredTotal);

          nextToken = json.nextToken ?? null;
          break;
        }

        if (cancelRef.current) break;
        if (!nextToken) break;
      }

      if (cancelRef.current) {
        toast.message("Sync stopped", {
          description: `${importedTotal} imported • ${enqueuedTotal} queued`,
        });
      } else {
        toast.success("Sync complete", {
          description: `${importedTotal} imported • ${enqueuedTotal} queued`,
        });
      }
      setOpen(false);
      await loadOrdersPage({ cursor: null, stack: [] });
      await loadOrdersTotal();
    } catch (e: any) {
      toast.error("Sync failed", { description: e?.message ?? "" });
    } finally {
      setSyncNote(null);
      setSyncing(false);
    }
  }

  const progress = syncing ? Math.min(95, pages * 5) : 0;
  const pageNumber = ordersCursorStack.length + 1;
  const canPrev = ordersCursorStack.length > 0;
  const canNext = ordersNextCursor !== null;
  const totalPages = ordersTotalCount !== null ? Math.ceil(ordersTotalCount / pageSize) : null;
  const pageLabel = totalPages !== null && totalPages > 0 ? `Page ${pageNumber} of ${totalPages}` : `Page ${pageNumber}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        right={
          <div className="flex items-center gap-2">
            <Select
              value={connectionId}
              onValueChange={(id) => {
                setActiveConnectionId(id);
                setFilterMarketplaceId("any");
                setFilterDelivery("any");
                setFilterOrderStatus("any");
                setFilterReviewState("any");
              }}
            >
              <SelectTrigger className="w-[220px]" disabled={!connectionsLoaded && connectionsLoading}>
                <SelectValue placeholder={connectionsLoading ? "Loading…" : "Select account"} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {connectionLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4" />
                  Sync
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sync orders</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Backfill window</Label>
                      <div className="flex gap-1">
                        {presets.map((p) => (
                          <Button
                            key={p.days}
                            type="button"
                            size="sm"
                            variant={presetDays === p.days ? "default" : "outline"}
                            onClick={() => setPresetDays(p.days)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">After</Label>
                        <Input
                          type="date"
                          value={toDateInputValue(createdAfter)}
                          onChange={(e) => setCreatedAfter(fromDateInputValue(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Before</Label>
                        <Input
                          type="date"
                          value={toDateInputValue(createdBefore)}
                          onChange={(e) => setCreatedBefore(fromDateInputValueEnd(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Auto-send review requests</Label>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        <div className="text-sm font-medium">Queue eligible orders</div>
                      </div>
                      <Switch checked={enqueue} onCheckedChange={setEnqueue} />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Timing preset</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <PresetTile
                        title="Balanced"
                        meta="D+10 • 9–18"
                        active={delayDays === 10 && windowEnabled}
                        onClick={() => {
                          setDelayDays(10);
                          setWindowEnabled(true);
                          setStartHour(9);
                          setEndHour(18);
                          setSpreadEnabled(true);
                          setSpreadMaxMinutes(90);
                        }}
                      />
                      <PresetTile
                        title="Early"
                        meta="D+5 • 9–18"
                        active={delayDays === 5 && windowEnabled}
                        onClick={() => {
                          setDelayDays(5);
                          setWindowEnabled(true);
                          setStartHour(9);
                          setEndHour(18);
                          setSpreadEnabled(true);
                          setSpreadMaxMinutes(90);
                        }}
                      />
                      <PresetTile
                        title="Late"
                        meta="D+20 • Any"
                        active={delayDays === 20 && !windowEnabled}
                        onClick={() => {
                          setDelayDays(20);
                          setWindowEnabled(false);
                          setSpreadEnabled(true);
                          setSpreadMaxMinutes(120);
                        }}
                      />
                    </div>
                  </div>

                  {syncing ? (
                    <div className="grid gap-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Syncing</div>
                        <Badge variant="outline">Page {pages}</Badge>
                      </div>
                      <Progress value={progress} />
                      {syncNote ? <div className="text-xs text-muted-foreground">{syncNote}</div> : null}
                      <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                        <div>
                          <div className="font-medium text-foreground">{imported}</div>
                          Imported
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{enqueued}</div>
                          Queued
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{alreadyExists}</div>
                          Exists
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{skippedExpired}</div>
                          Expired
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <DialogFooter>
                  {syncing ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        cancelRef.current = true;
                      }}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                  )}
                  <Button type="button" disabled={syncing} onClick={runBackfill}>
                    <Sparkles className="h-4 w-4" />
                    Start
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Orders</CardTitle>
            <div className="flex items-center gap-2">
              {ordersTotalCount !== null ? (
                <Badge variant="secondary">Total {fmtInt(ordersTotalCount)}</Badge>
              ) : null}
              <Badge variant="outline">{pageLabel}</Badge>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!canPrev) return;
                  const prevCursor = ordersCursorStack[ordersCursorStack.length - 1] ?? null;
                  const nextStack = ordersCursorStack.slice(0, -1);
                  loadOrdersPage({ cursor: prevCursor, stack: nextStack });
                }}
                disabled={!canPrev || loadingOrders}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!ordersNextCursor) return;
                  const nextStack = [...ordersCursorStack, ordersCursor];
                  loadOrdersPage({ cursor: ordersNextCursor, stack: nextStack });
                }}
                disabled={!canNext || loadingOrders}
              >
                Next
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  loadOrdersPage({ cursor: ordersCursor, stack: ordersCursorStack });
                  loadOrdersTotal();
                }}
                disabled={loadingOrders || loadingOrdersTotal}
              >
                <CalendarClock className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <div>Marketplace</div>
                      <Select value={filterMarketplaceId} onValueChange={setFilterMarketplaceId}>
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All</SelectItem>
                          {(connection?.marketplaceIds ?? []).map((id) => (
                            <SelectItem key={id} value={id}>
                              {marketplaceDisplay(id)} • {shortMarketplace(id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                  <TableHead>Purchase</TableHead>
                  <TableHead>
                    <div className="flex flex-col gap-1">
                      <div>Delivery</div>
                      <Select value={filterDelivery} onValueChange={setFilterDelivery}>
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All</SelectItem>
                          <SelectItem value="has">Has date</SelectItem>
                          <SelectItem value="missing">Missing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex flex-col gap-1">
                      <div>Status</div>
                      <Select value={filterOrderStatus} onValueChange={setFilterOrderStatus}>
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Unshipped">Unshipped</SelectItem>
                          <SelectItem value="PartiallyShipped">PartiallyShipped</SelectItem>
                          <SelectItem value="Shipped">Shipped</SelectItem>
                          <SelectItem value="Canceled">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div>Review request</div>
                      <Select value={filterReviewState} onValueChange={setFilterReviewState}>
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All</SelectItem>
                          <SelectItem value="not_queued">Not queued</SelectItem>
                          <SelectItem value="queued">Queued</SelectItem>
                          <SelectItem value="sending">Sending</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="skipped">Skipped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const country = marketplaceCountry(o.marketplaceId);
                  const marketplaceTitle = country ? `${country} • ${o.marketplaceId}` : o.marketplaceId;
                  const purchase = fmtDateTimeShort(o.purchaseDate);

                  return (
                    <TableRow key={o.orderId}>
                      <TableCell className="font-mono text-xs">{o.orderId}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" title={marketplaceTitle}>
                          {marketplaceDisplay(o.marketplaceId)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {purchase ? (
                          <div className="leading-tight">
                            <div>{purchase.date}</div>
                            <div className="text-xs text-muted-foreground">{purchase.time}</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{fmtDateShort(o.latestDeliveryDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{o.orderStatus ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{stateBadge(o.dispatchState)}</TableCell>
                    </TableRow>
                  );
                })}

                {(!loadingOrders && orders.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-card">
                          <PackageSearch className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium">No orders yet</div>
                        <div className="text-xs text-muted-foreground">Run a sync to import orders from Amazon.</div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}

                {loadingOrders ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PresetTile({
  title,
  meta,
  active,
  onClick,
}: {
  title: string;
  meta: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-3 text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active ? "bg-accent text-accent-foreground" : "bg-card",
      ].join(" ")}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </button>
  );
}
