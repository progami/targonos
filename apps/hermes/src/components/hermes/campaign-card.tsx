import Link from "next/link";
import { ArrowUpRight, CalendarClock, ShieldCheck } from "lucide-react";

import type { Campaign, AmazonConnection } from "@/lib/types";
import { CampaignStatusBadge } from "@/components/hermes/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function windowLabel(c: Campaign) {
  const w = c.schedule.timeWindow;
  if (!w) return "Any time";
  return `${w.startHourLocal}:00–${w.endHourLocal}:00`;
}

export function CampaignCard({
  campaign,
  connection,
  className,
}: {
  campaign: Campaign;
  connection?: AmazonConnection;
  className?: string;
}) {
  return (
    <Link href={`/campaigns/${campaign.id}`} className={cn("block", className)}>
      <Card className="transition-shadow hover:shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate font-medium">{campaign.name}</div>
                <CampaignStatusBadge status={campaign.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{connection?.accountName ?? campaign.connectionId}</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  D+{campaign.schedule.delayDays} • {windowLabel(campaign)}
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Holdout {campaign.controlHoldoutPct}%
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">Request a review</Badge>
                {campaign.schedule.sendTimeOptimization === "best_hour" ? (
                  <Badge variant="outline">Best hour</Badge>
                ) : null}
                {campaign.schedule.randomDelayMinutes ? (
                  <Badge variant="outline">Spread</Badge>
                ) : null}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
