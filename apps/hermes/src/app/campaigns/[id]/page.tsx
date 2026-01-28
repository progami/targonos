import { notFound } from "next/navigation";

import { CampaignDetail } from "@/app/campaigns/[id]/campaign-detail";
import { campaigns, connections, dispatches, experiments } from "@/lib/mock-data";

type PageProps = { params: Promise<{ id: string }> };

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) return notFound();

  const connection = connections.find((c) => c.id === campaign.connectionId);
  const exp = experiments.filter((e) => e.campaignId === campaign.id);
  const disp = dispatches.filter((d) => d.campaignId === campaign.id);

  return (
    <CampaignDetail
      campaign={campaign}
      connection={connection}
      experiments={exp}
      dispatches={disp}
    />
  );
}
