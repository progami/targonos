"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  KeyRound,
  Loader2,
  MessagesSquare,
  PackageCheck,
  PencilRuler,
  ShieldAlert,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hermesApiUrl } from "@/lib/base-path";
import { formatDate, formatDateTime } from "@/lib/time";
import { useConnectionsStore } from "@/stores/connections-store";
import { useHermesUiPreferencesStore, type MessagingPreferences } from "@/stores/ui-preferences-store";

type RecentOrder = {
  orderId: string;
  marketplaceId: string;
  purchaseDate?: string | null;
  orderStatus?: string | null;
  latestDeliveryDate?: string | null;
};

type ActionLink = { name?: string; href?: string };

type DispatchRow = {
  id: string;
  order_id: string;
  marketplace_id: string;
  message_kind: string | null;
  state: string;
  updated_at: string;
};

type AttemptRow = {
  id: string;
  attemptNo: number;
  status: "sent" | "ineligible" | "throttled" | "failed";
  httpStatus: number | null;
  spapiRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const KIND_UI: Record<
  string,
  {
    label: string;
    icon: any;
    mode: "text" | "attachments";
    risk?: "advanced";
  }
> = {
  confirmDeliveryDetails: { label: "Delivery", icon: Truck, mode: "text" },
  confirmOrderDetails: { label: "Order", icon: PackageCheck, mode: "text" },
  confirmCustomizationDetails: { label: "Customize", icon: PencilRuler, mode: "text" },
  confirmServiceDetails: { label: "Service", icon: CalendarClock, mode: "text" },
  digitalAccessKey: { label: "Access key", icon: KeyRound, mode: "text" },
  unexpectedProblem: { label: "Issue", icon: AlertTriangle, mode: "text" },
  legalDisclosure: { label: "Disclosure", icon: ShieldAlert, mode: "text" },
  // These exist in the API, but are not enabled in the UI by default.
  // invoice requires Uploads API + attachments.
  invoice: { label: "Invoice", icon: PackageCheck, mode: "attachments", risk: "advanced" },
  negativeFeedbackRemoval: { label: "Feedback", icon: AlertTriangle, mode: "text", risk: "advanced" },
  amazonMotors: { label: "Motors", icon: PackageCheck, mode: "text", risk: "advanced" },
  warranty: { label: "Warranty", icon: ShieldAlert, mode: "text", risk: "advanced" },
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(hermesApiUrl(url), init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

const MARKETPLACE_LABELS: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A1F83G8C2ARO7P: "UK",
};

function marketplaceDisplay(id: string): string {
  if (!id) return "";
  return MARKETPLACE_LABELS[id] ?? (id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id);
}

export function MessagingClient() {
  const {
    connections,
    loading: connectionsLoading,
    hasHydrated,
    activeConnectionId,
    setActiveConnectionId,
    fetch: fetchConnections,
  } = useConnectionsStore();

  useEffect(() => {
    if (!hasHydrated) return;
    fetchConnections();
  }, [hasHydrated, fetchConnections]);

  const connectionId = activeConnectionId ?? "";
  const connection = useMemo(() => {
    const selected = connections.find((c) => c.id === connectionId);
    if (selected) return selected;
    return connections[0];
  }, [connections, connectionId]);

  const messagingPrefs = useHermesUiPreferencesStore((s) => s.messaging);
  const setMessagingPreferences = useHermesUiPreferencesStore((s) => s.setMessagingPreferences);

  const tab = messagingPrefs.tab;
  const orderIdQuery = messagingPrefs.ordersOrderIdQuery;
  const historyOrderQuery = messagingPrefs.historyOrderIdQuery;
  const historyState = messagingPrefs.historyState;

  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const [history, setHistory] = useState<DispatchRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [activeOrder, setActiveOrder] = useState<RecentOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsAttempts, setDetailsAttempts] = useState<AttemptRow[]>([]);
  const [detailsAttemptsLoading, setDetailsAttemptsLoading] = useState(false);

  useEffect(() => {
    if (!detailsOpen || !selectedDispatch) return;
    if (!connectionId) return;

    setDetailsAttemptsLoading(true);
    setDetailsAttempts([]);

    const qs = new URLSearchParams();
    qs.set("connectionId", connectionId);
    qs.set("dispatchId", selectedDispatch.id);
    qs.set("limit", "50");

    fetchJson<{ ok: boolean; attempts: AttemptRow[] }>(`/api/logs/attempts?${qs.toString()}`)
      .then((d) => {
        setDetailsAttempts(Array.isArray(d.attempts) ? d.attempts : []);
      })
      .catch((e: any) => {
        toast.error(e?.message ?? "Failed to load attempts");
      })
      .finally(() => {
        setDetailsAttemptsLoading(false);
      });
  }, [detailsOpen, selectedDispatch, connectionId]);

  async function refreshOrders() {
    if (!connectionId) return;
    setIsLoadingOrders(true);
    try {
      const qs = new URLSearchParams();
      qs.set("connectionId", connectionId);
      qs.set("limit", "50");
      if (orderIdQuery.trim().length > 0) qs.set("orderIdQuery", orderIdQuery.trim());

      const data = await fetchJson<{ ok: boolean; orders: RecentOrder[] }>(
        `/api/orders/list?${qs.toString()}`
      );

      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load orders");
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function refreshHistory() {
    if (!connectionId) return;
    setIsLoadingHistory(true);
    try {
      const data = await fetchJson<{ ok: boolean; dispatches: any[] }>(
        `/api/messaging/recent?connectionId=${encodeURIComponent(connectionId)}&limit=25`
      );
      const rows: DispatchRow[] = (data.dispatches ?? []).map((d: any) => ({
        id: d.id,
        order_id: d.order_id,
        marketplace_id: d.marketplace_id,
        message_kind: d.message_kind,
        state: d.state,
        updated_at: d.updated_at,
      }));
      setHistory(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load history");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    refreshOrders();
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const filteredHistory = useMemo(() => {
    const q = historyOrderQuery.trim().toLowerCase();
    return history.filter((d) => {
      if (historyState !== "any" && d.state !== historyState) return false;
      if (q.length === 0) return true;
      return d.order_id.toLowerCase().includes(q);
    });
  }, [history, historyOrderQuery, historyState]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messaging"
        right={
          <Select value={connectionId} onValueChange={setActiveConnectionId}>
            <SelectTrigger className="h-9 w-[240px]">
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
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setMessagingPreferences({ tab: v as MessagingPreferences["tab"] })}
      >
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Orders</CardTitle>
              <Button variant="outline" size="sm" onClick={refreshOrders} disabled={isLoadingOrders}>
                {isLoadingOrders ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex flex-col gap-1">
                          <div>Order</div>
                          <Input
                            value={orderIdQuery}
                            onChange={(e) => setMessagingPreferences({ ordersOrderIdQuery: e.target.value })}
                            placeholder="Search…"
                            className="h-8 w-[220px] font-mono text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") refreshOrders();
                            }}
                          />
                        </div>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">Marketplace</TableHead>
                      <TableHead className="hidden md:table-cell">Purchased</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%] text-right">Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.orderId}>
                        <TableCell className="font-mono text-[11px]">{o.orderId}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary">{marketplaceDisplay(o.marketplaceId)}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {o.purchaseDate ? formatDate(o.purchaseDate) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{o.orderStatus ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              setActiveOrder(o);
                              setDialogOpen(true);
                            }}
                          >
                            Message
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                          {isLoadingOrders ? "Loading…" : "No orders"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Messages</CardTitle>
              <Button variant="outline" size="sm" onClick={refreshHistory} disabled={isLoadingHistory}>
                {isLoadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex flex-col gap-1">
                          <div>Order</div>
                          <Input
                            value={historyOrderQuery}
                            onChange={(e) => setMessagingPreferences({ historyOrderIdQuery: e.target.value })}
                            placeholder="Search…"
                            className="h-8 w-[220px] font-mono text-xs"
                          />
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex flex-col gap-1">
                          <div>State</div>
                          <Select
                            value={historyState}
                            onValueChange={(v) => setMessagingPreferences({ historyState: v as MessagingPreferences["historyState"] })}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">any</SelectItem>
                              <SelectItem value="queued">queued</SelectItem>
                              <SelectItem value="sending">sending</SelectItem>
                              <SelectItem value="sent">sent</SelectItem>
                              <SelectItem value="failed">failed</SelectItem>
                              <SelectItem value="skipped">skipped</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">Kind</TableHead>
                      <TableHead className="hidden md:table-cell">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((d) => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedDispatch(d);
                          setDetailsOpen(true);
                        }}
                      >
                        <TableCell className="font-mono text-[11px]">{d.order_id}</TableCell>
                        <TableCell>
                          <Badge
                            variant={d.state === "sent" ? "secondary" : d.state === "failed" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {d.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className="text-[10px]">
                            {d.message_kind ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{formatDate(d.updated_at)}</TableCell>
                      </TableRow>
                    ))}

                    {filteredHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                          {isLoadingHistory ? "Loading…" : "No messages"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Message</DialogTitle>
          </DialogHeader>
          {selectedDispatch ? (
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">{selectedDispatch.order_id}</Badge>
                <Badge variant="outline" className="text-xs">{selectedDispatch.state}</Badge>
                <Badge variant="outline" className="text-xs">{selectedDispatch.message_kind ?? "—"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">Updated {formatDateTime(selectedDispatch.updated_at)}</div>

              <div className="rounded-md border">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">HTTP</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="hidden md:table-cell">Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsAttempts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={a.status === "sent" ? "secondary" : a.status === "failed" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.httpStatus ?? "—"}</TableCell>
                        <TableCell className="font-mono text-[11px]">{a.errorCode ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{a.errorMessage ?? "—"}</TableCell>
                      </TableRow>
                    ))}

                    {(detailsAttemptsLoading || detailsAttempts.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          {detailsAttemptsLoading ? "Loading…" : "No attempts"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BuyerMessageDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setActiveOrder(null);
        }}
        connectionId={connectionId}
        order={activeOrder}
        onSent={async () => {
          await refreshHistory();
        }}
      />
    </div>
  );
}

function BuyerMessageDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connectionId: string;
  order: RecentOrder | null;
  onSent: () => void;
}) {
  const { open, onOpenChange, connectionId, order } = props;

  const [actions, setActions] = useState<ActionLink[]>([]);
  const [attributes, setAttributes] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !order) return;

    setSelectedKind(null);
    setText("");
    setIsLoading(true);

    const url = `/api/messaging/actions?connectionId=${encodeURIComponent(connectionId)}&orderId=${encodeURIComponent(
      order.orderId
    )}&marketplaceId=${encodeURIComponent(order.marketplaceId)}`;

    fetchJson<{ ok: boolean; actions: ActionLink[]; attributes?: any }>(url)
      .then((d) => {
        setActions(d.actions ?? []);
        setAttributes(d.attributes ?? null);
      })
      .catch((e: any) => toast.error(e?.message ?? "Failed to load actions"))
      .finally(() => setIsLoading(false));
  }, [open, order, connectionId]);

  const availableKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const a of actions) {
      const name = a.name;
      if (name && KIND_UI[name]) kinds.add(name);
      if (!name && a.href) {
        for (const k of Object.keys(KIND_UI)) {
          if (a.href.includes(`/messages/${k}`)) kinds.add(k);
        }
      }
    }
    return Array.from(kinds);
  }, [actions]);

  const buyerLocale = attributes?.payload?.buyerLocale ?? attributes?.buyerLocale;

  async function send() {
    if (!order || !selectedKind) return;
    const meta = KIND_UI[selectedKind];
    if (!meta) return;
    if (meta.mode === "attachments") {
      toast.error("This message type requires attachments (not yet supported in UI)");
      return;
    }
    if (!text.trim()) {
      toast.error("Add a short message");
      return;
    }

    setSending(true);
    try {
      await fetchJson(
        "/api/messaging/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId,
            orderId: order.orderId,
            marketplaceId: order.marketplaceId,
            kind: selectedKind,
            text,
            sendNow: true,
          }),
        }
      );

      toast.success("Message queued / sent");
      onOpenChange(false);
      props.onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Send message</DialogTitle>
        </DialogHeader>

        {order ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                {order.orderId}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {order.orderStatus ?? "—"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {marketplaceDisplay(order.marketplaceId)}
              </Badge>
              {buyerLocale ? (
                <Badge variant="secondary" className="text-xs">
                  {buyerLocale}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {(availableKinds.length ? availableKinds : Object.keys(KIND_UI).slice(0, 6)).map((k) => {
                const ui = KIND_UI[k];
                if (!ui) return null;
                const Icon = ui.icon;
                const selected = selectedKind === k;
                const disabled = ui.mode === "attachments" || ui.risk === "advanced";

                return (
                  <Button
                    key={k}
                    variant={selected ? "default" : "outline"}
                    className="h-auto justify-start gap-2 py-3"
                    disabled={disabled}
                    onClick={() => setSelectedKind(k)}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm">{ui.label}</span>
                      <span className="text-xs text-muted-foreground">{k}</span>
                    </div>
                  </Button>
                );
              })}
            </div>

            <div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={selectedKind ? "Keep it short & order-related" : "Select a message type first"}
                rows={6}
                disabled={!selectedKind || isLoading}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Pick an order first</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!order || !selectedKind || sending || isLoading}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
