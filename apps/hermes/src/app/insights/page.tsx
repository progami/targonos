import { InsightsClient } from "@/app/insights/insights-client";
import { listConnectionTargets } from "@/server/sp-api/connection-list";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";
import type { AmazonConnection } from "@/lib/types";

function loadConnections(): AmazonConnection[] {
  const targets = listConnectionTargets();
  return targets.map((t) => {
    let region = "NA" as AmazonConnection["region"];
    let status: AmazonConnection["status"] = "connected";
    try {
      const cfg = loadSpApiConfigForConnection(t.connectionId);
      region = cfg.region as AmazonConnection["region"];
    } catch {
      status = "disconnected";
    }
    return {
      id: t.connectionId,
      accountName: t.connectionId,
      region,
      marketplaceIds: t.marketplaceIds,
      sellerId: "",
      status,
      createdAt: new Date().toISOString(),
    };
  });
}

export default function InsightsPage() {
  const connections = loadConnections();
  return <InsightsClient connections={connections} />;
}
