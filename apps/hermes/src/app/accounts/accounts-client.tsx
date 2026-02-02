"use client";

import * as React from "react";
import { Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/hermes/page-header";
import { EmptyState } from "@/components/hermes/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hermesApiUrl } from "@/lib/base-path";
import type { AmazonConnection } from "@/lib/types";
import { useConnectionsStore } from "@/stores/connections-store";

function statusBadge(status: AmazonConnection["status"]) {
  const label =
    status === "connected" ? "Connected" : status === "needs_reauth" ? "Reauth" : "Disconnected";
  const variant = status === "connected" ? "secondary" : status === "needs_reauth" ? "outline" : "destructive";
  return <Badge variant={variant as any}>{label}</Badge>;
}

export function AccountsClient() {
  const { connections, loaded, loading, fetch: fetchConnections } = useConnectionsStore();
  const [testingId, setTestingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  async function testConnection(account: AmazonConnection) {
    const marketplaceId = account.marketplaceIds[0];
    if (!marketplaceId) {
      toast.error("No marketplace ID configured for this account");
      return;
    }

    setTestingId(account.id);
    try {
      const res = await fetch(hermesApiUrl("/api/accounts/test"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: account.id,
          marketplaceId,
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(json.message ?? "Connection healthy");
      } else {
        toast.error("Connection test failed", { description: json?.error ?? `HTTP ${res.status}` });
      }
    } catch (e: any) {
      toast.error("Connection test failed", { description: e?.message ?? "" });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" />

      {(!loaded || loading) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={PlugZap}
          title="No accounts configured"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((c) => (
            <Card key={c.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.accountName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {c.region} • {c.marketplaceIds.join(", ")}
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testingId === c.id}
                    onClick={() => testConnection(c)}
                  >
                    {testingId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
