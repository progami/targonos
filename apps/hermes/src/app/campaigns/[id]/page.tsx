"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { CampaignDetail } from "@/app/campaigns/[id]/campaign-detail";
import { EmptyState } from "@/components/hermes/empty-state";
import { hermesApiUrl } from "@/lib/base-path";
import { useConnectionsStore } from "@/stores/connections-store";
import type { AmazonConnection, Campaign, Experiment, DispatchAttempt } from "@/lib/types";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [experiments, setExperiments] = React.useState<Experiment[]>([]);
  const [dispatches, setDispatches] = React.useState<DispatchAttempt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const { connections, fetch: fetchConnections } = useConnectionsStore();

  React.useEffect(() => {
    fetchConnections();
    async function load() {
      try {
        const res = await fetch(hermesApiUrl(`/api/campaigns/${params.id}`));
        const json = await res.json();
        if (!json?.ok) {
          setNotFound(true);
          return;
        }
        setCampaign(json.campaign);

        // Fetch related experiments
        const expRes = await fetch(hermesApiUrl("/api/experiments"));
        const expJson = await expRes.json();
        if (expJson?.ok) {
          setExperiments(
            (expJson.experiments ?? []).filter(
              (e: Experiment) => e.campaignId === params.id
            )
          );
        }
      } catch (e: any) {
        toast.error("Failed to load campaign", { description: e?.message ?? "" });
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id, fetchConnections]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !campaign) {
    return <EmptyState icon={Megaphone} title="Campaign not found" />;
  }

  const connection = connections.find((c: AmazonConnection) => c.id === campaign.connectionId);

  return (
    <CampaignDetail
      campaign={campaign}
      connection={connection}
      experiments={experiments}
      dispatches={dispatches}
    />
  );
}
