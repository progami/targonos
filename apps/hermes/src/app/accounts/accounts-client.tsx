"use client";

import * as React from "react";
import { Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

import type { AmazonConnection } from "@/lib/types";
import { hermesApiUrl } from "@/lib/base-path";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConnectionsStore } from "@/stores/connections-store";

function statusBadge(status: AmazonConnection["status"]) {
  if (status === "connected") return <Badge variant="secondary">connected</Badge>;
  if (status === "needs_reauth") return <Badge variant="outline">needs_reauth</Badge>;
  return <Badge variant="destructive">disconnected</Badge>;
}

export function AccountsClient() {
  const { connections, loaded, loading, hasHydrated, fetch: fetchConnections } = useConnectionsStore();
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!hasHydrated) return;
    fetchConnections();
  }, [hasHydrated, fetchConnections]);

  async function testConnection(account: AmazonConnection) {
    const marketplaceId = account.marketplaceIds[0];
    if (!marketplaceId) {
      toast.error("No marketplace ID configured");
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
        toast.success(typeof json?.message === "string" ? json.message : "OK");
      } else {
        toast.error("Test failed", { description: json?.error ?? `HTTP ${res.status}` });
      }
    } catch (e: any) {
      toast.error("Test failed", { description: e?.message ?? "" });
    } finally {
      setTestingId(null);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const rows = normalizedQuery.length > 0
    ? connections.filter((c) => {
        const name = c.accountName.toLowerCase();
        const id = c.id.toLowerCase();
        if (name.includes(normalizedQuery)) return true;
        if (id.includes(normalizedQuery)) return true;
        return false;
      })
    : connections;

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" />

      {(!loaded || loading) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Connections</CardTitle>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 w-[240px] text-xs"
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Connection</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="hidden md:table-cell">Marketplaces</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%] text-right">Test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.accountName}</TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-[11px] text-muted-foreground">{c.id}</TableCell>
                    <TableCell>{c.region}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-[11px] text-muted-foreground">
                      {c.marketplaceIds.join(", ")}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingId === c.id}
                        onClick={() => testConnection(c)}
                      >
                        {testingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No accounts
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

