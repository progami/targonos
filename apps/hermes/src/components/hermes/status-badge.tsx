import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, DispatchStatus, ExperimentStatus } from "@/lib/types";

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  if (status === "live") return <Badge>Live</Badge>;
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline">Archived</Badge>;
}

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  if (status === "running") return <Badge>Running</Badge>;
  if (status === "stopped") return <Badge variant="secondary">Stopped</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function DispatchStatusBadge({ status }: { status: DispatchStatus }) {
  if (status === "sent") return <Badge>Sent</Badge>;
  if (status === "queued") return <Badge variant="secondary">Queued</Badge>;
  if (status === "ineligible") return <Badge variant="outline">Ineligible</Badge>;
  if (status === "rate_limited") return <Badge variant="secondary">Throttled</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
