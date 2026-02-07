import { Badge } from "@/components/ui/badge";
import type { AmazonConnection } from "@/lib/types";
import type { CampaignStatus, DispatchStatus, ExperimentStatus } from "@/lib/types";

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  if (status === "live") return <Badge className="badge-success">Live</Badge>;
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline">Archived</Badge>;
}

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  if (status === "running") return <Badge className="badge-success">Running</Badge>;
  if (status === "stopped") return <Badge variant="secondary">Stopped</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function DispatchStatusBadge({ status }: { status: DispatchStatus | string | null }) {
  if (!status) return <Badge variant="outline">Not queued</Badge>;
  if (status === "sent") return <Badge className="badge-success">Sent</Badge>;
  if (status === "queued") return <Badge variant="secondary">Queued</Badge>;
  if (status === "sending") return <Badge variant="secondary">Sending</Badge>;
  if (status === "ineligible") return <Badge className="badge-warning">Ineligible</Badge>;
  if (status === "rate_limited") return <Badge className="badge-warning">Throttled</Badge>;
  if (status === "skipped") return <Badge variant="outline">Skipped</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function OrderStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  if (status === "Shipped") return <Badge className="badge-success">{status}</Badge>;
  if (status === "Pending" || status === "Unshipped" || status === "PartiallyShipped")
    return <Badge className="badge-warning">{status}</Badge>;
  if (status === "Canceled") return <Badge variant="outline">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function ConnectionStatusBadge({ status }: { status: AmazonConnection["status"] }) {
  if (status === "connected") return <Badge className="badge-success">connected</Badge>;
  if (status === "needs_reauth") return <Badge className="badge-warning">needs_reauth</Badge>;
  return <Badge variant="destructive">disconnected</Badge>;
}
