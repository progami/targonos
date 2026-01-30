"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Megaphone, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/hermes/page-header";
import { CampaignCard } from "@/components/hermes/campaign-card";
import { EmptyState } from "@/components/hermes/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { hermesApiUrl } from "@/lib/base-path";
import { useConnectionsStore } from "@/stores/connections-store";
import type { Campaign } from "@/lib/types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { connections, fetch: fetchConnections } = useConnectionsStore();

  React.useEffect(() => {
    fetchConnections();
    async function load() {
      try {
        const res = await fetch(hermesApiUrl("/api/campaigns"));
        const json = await res.json();
        if (json?.ok) setCampaigns(json.campaigns ?? []);
      } catch (e: any) {
        toast.error("Failed to load campaigns", { description: e?.message ?? "" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchConnections]);

  const byId = new Map(connections.map((c) => [c.id, c] as const));

  const live = campaigns.filter((c) => c.status === "live");
  const paused = campaigns.filter((c) => c.status === "paused");
  const draft = campaigns.filter((c) => c.status === "draft");

  function grid(items: Campaign[]) {
    if (items.length === 0) {
      return <EmptyState icon={Megaphone} title="No campaigns" />;
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <CampaignCard key={c.id} campaign={c} connection={byId.get(c.connectionId)} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        right={
          <Button asChild size="sm">
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              New
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" className="pl-9" />
            </div>
          </div>

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">{grid(campaigns)}</TabsContent>
            <TabsContent value="live" className="mt-4">{grid(live)}</TabsContent>
            <TabsContent value="paused" className="mt-4">{grid(paused)}</TabsContent>
            <TabsContent value="draft" className="mt-4">{grid(draft)}</TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
