import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { CampaignCard } from "@/components/hermes/campaign-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { campaigns, connections } from "@/lib/mock-data";

export default function CampaignsPage() {
  const byId = new Map(connections.map((c) => [c.id, c] as const));

  const live = campaigns.filter((c) => c.status === "live");
  const paused = campaigns.filter((c) => c.status === "paused");
  const draft = campaigns.filter((c) => c.status === "draft");

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

        <TabsContent value="all" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} connection={byId.get(c.connectionId)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((c) => (
              <CampaignCard key={c.id} campaign={c} connection={byId.get(c.connectionId)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="paused" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paused.map((c) => (
              <CampaignCard key={c.id} campaign={c} connection={byId.get(c.connectionId)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="draft" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {draft.map((c) => (
              <CampaignCard key={c.id} campaign={c} connection={byId.get(c.connectionId)} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
