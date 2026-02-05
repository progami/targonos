"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConnectionsStore } from "@/stores/connections-store";
import { useHermesUiPreferencesStore, type LogsPreferences } from "@/stores/ui-preferences-store";

type AttemptRow = {
  id: string;
  dispatchId: string;
  attemptNo: number;
  status: "sent" | "ineligible" | "throttled" | "failed";
  httpStatus: number | null;
  spapiRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  orderId: string;
  marketplaceId: string;
  type: "request_review" | "buyer_message";
  messageKind: string | null;
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusBadge(status: AttemptRow["status"]) {
  if (status === "sent") return <Badge variant="secondary">sent</Badge>;
  if (status === "ineligible") return <Badge variant="outline">ineligible</Badge>;
  if (status === "throttled") return <Badge variant="outline">throttled</Badge>;
  return <Badge variant="destructive">failed</Badge>;
}

export function LogsClient() {
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
  const logsPrefs = useHermesUiPreferencesStore((s) => s.logs);
  const setLogsPreferences = useHermesUiPreferencesStore((s) => s.setLogsPreferences);

  const type = logsPrefs.type;
  const status = logsPrefs.status;
  const orderIdQuery = logsPrefs.orderIdQuery;

  const [rows, setRows] = React.useState<AttemptRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  async function loadFirstPage() {
    if (!connectionId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      if (type !== "any") qs.set("type", type);
      if (status !== "any") qs.set("status", status);
      if (orderIdQuery.trim().length > 0) qs.set("orderIdQuery", orderIdQuery.trim());
      qs.set("limit", "200");

      const res = await fetch(hermesApiUrl(`/api/logs/attempts?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      setRows(Array.isArray(json.attempts) ? (json.attempts as AttemptRow[]) : []);
      setNextCursor(typeof json.nextCursor === "string" ? json.nextCursor : null);
    } catch (e: any) {
      setRows([]);
      setNextCursor(null);
      toast.error("Could not load logs", { description: e?.message ?? "" });
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!connectionId) return;
    if (!nextCursor) return;

    setLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      if (type !== "any") qs.set("type", type);
      if (status !== "any") qs.set("status", status);
      if (orderIdQuery.trim().length > 0) qs.set("orderIdQuery", orderIdQuery.trim());
      qs.set("limit", "200");
      qs.set("cursor", nextCursor);

      const res = await fetch(hermesApiUrl(`/api/logs/attempts?${qs.toString()}`));
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }

      const nextRows = Array.isArray(json.attempts) ? (json.attempts as AttemptRow[]) : [];
      setRows((prev) => [...prev, ...nextRows]);
      setNextCursor(typeof json.nextCursor === "string" ? json.nextCursor : null);
    } catch (e: any) {
      toast.error("Could not load more", { description: e?.message ?? "" });
    } finally {
      setLoadingMore(false);
    }
  }

  React.useEffect(() => {
    if (!uiHydrated) return;
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiHydrated, connectionId, type, status]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Logs"
        right={
          <div className="flex flex-wrap items-center gap-2">
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

            <Select value={type} onValueChange={(v) => setLogsPreferences({ type: v as LogsPreferences["type"] })}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="request_review">request_review</SelectItem>
                <SelectItem value="buyer_message">buyer_message</SelectItem>
                <SelectItem value="any">any</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => setLogsPreferences({ status: v as LogsPreferences["status"] })}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sent">sent</SelectItem>
                <SelectItem value="ineligible">ineligible</SelectItem>
                <SelectItem value="throttled">throttled</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
                <SelectItem value="any">any</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={orderIdQuery}
              onChange={(e) => setLogsPreferences({ orderIdQuery: e.target.value })}
              placeholder="Order id…"
              className="h-9 w-[200px] font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadFirstPage();
              }}
            />

            <Button size="sm" variant="outline" onClick={loadFirstPage} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Attempts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>At</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden md:table-cell">HTTP</TableHead>
                  <TableHead className="hidden md:table-cell">Code</TableHead>
                  <TableHead className="hidden lg:table-cell">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.type}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="font-mono text-[11px]">{r.orderId}</TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums">{r.httpStatus ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.errorCode ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{r.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      {loading ? "Loading…" : "No logs"}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
