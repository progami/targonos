"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectionsStore } from "@/stores/connections-store";
import { useHermesUiPreferencesStore } from "@/stores/ui-preferences-store";

export default function SettingsPage() {
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
  const pageSize = useHermesUiPreferencesStore((s) => s.orders.pageSize);
  const setOrdersPreferences = useHermesUiPreferencesStore((s) => s.setOrdersPreferences);
  const setInsightsPreferences = useHermesUiPreferencesStore((s) => s.setInsightsPreferences);

  const connectionId = activeConnectionId ?? "";

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
      <PageHeader title="Settings" />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Account</div>
            <Select value={connectionId} onValueChange={setActiveConnectionId}>
              <SelectTrigger className="h-9" disabled={connectionsLoading}>
                <SelectValue placeholder={connectionsLoading ? "Loading…" : "Select"} />
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

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Insights range</div>
            <Tabs
              value={String(rangeDays)}
              onValueChange={(v) => setInsightsPreferences({ rangeDays: Number(v) as 7 | 30 | 90 })}
            >
              <TabsList className="h-9">
                <TabsTrigger value="7">7d</TabsTrigger>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Orders rows / page</div>
            <Select value={String(pageSize)} onValueChange={(v) => setOrdersPreferences({ pageSize: Number(v) })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
