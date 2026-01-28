"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  KeyRound,
  PackageCheck,
  PencilRuler,
  ShieldAlert,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/time";
import type { AmazonConnection } from "@/lib/types";

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
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

function shortMarketplace(id: string) {
  if (!id) return "";
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id;
}

export function MessagingClient(props: { connections: AmazonConnection[] }) {
  const connections = props.connections;
  const defaultConnectionId = connections[0]?.id ?? "";

  const [connectionId, setConnectionId] = useState(defaultConnectionId);
  const connection = useMemo(
    () => connections.find((c) => c.id === connectionId) ?? connections[0],
    [connections, connectionId]
  );

  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const [history, setHistory] = useState<DispatchRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [activeOrder, setActiveOrder] = useState<RecentOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function refreshOrders() {
    if (!connectionId) return;
    setIsLoadingOrders(true);
    try {
      const data = await fetchJson<{ ok: boolean; orders: RecentOrder[] }>(
        `/api/orders/recent?connectionId=${encodeURIComponent(connectionId)}&limit=30`
      );
      setOrders(data.orders ?? []);
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

  const connectionLabel = connection
    ? `${connection.accountName} · ${connection.region}`
    : connectionId;

  return (
    <div className="space-y-6">
      <PageHeader title="Messaging" subtitle="Buyer-Seller messaging (Messaging API)" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Orders</CardTitle>
              <div className="text-xs text-muted-foreground">
                Pick an order, then choose an allowed message type.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.accountName} · {c.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={refreshOrders} disabled={isLoadingOrders}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden md:table-cell">Marketplace</TableHead>
                  <TableHead className="hidden md:table-cell">Purchased</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.orderId}>
                    <TableCell className="font-mono text-xs">{o.orderId}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{shortMarketplace(o.marketplaceId)}</Badge>
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

                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {isLoadingOrders ? "Loading…" : "No orders found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent messages</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="refresh">Reload</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="mt-4">
                <div className="space-y-3">
                  {history.slice(0, 8).map((d) => (
                    <div key={d.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs">{d.order_id}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {d.message_kind ?? "—"}
                            </Badge>
                            <Badge
                              variant={d.state === "sent" ? "default" : d.state === "failed" ? "destructive" : "outline"}
                              className="text-[10px]"
                            >
                              {d.state}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground">{formatDate(d.updated_at)}</div>
                      </div>
                    </div>
                  ))}

                  {history.length === 0 && (
                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                      {isLoadingHistory ? "Loading…" : "No messages yet"}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="refresh" className="mt-4">
                <Button className="w-full" variant="outline" onClick={refreshHistory} disabled={isLoadingHistory}>
                  Reload history
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-4 text-xs text-muted-foreground">
              {connectionLabel}
            </div>
          </CardContent>
        </Card>
      </div>

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
                {shortMarketplace(order.marketplaceId)}
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
              <div className="mt-2 text-xs text-muted-foreground">
                Amazon restricts content. Hermes blocks links, contact info, and review solicitations.
              </div>
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
