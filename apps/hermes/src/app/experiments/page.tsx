import Link from "next/link";
import { Plus, SplitSquareVertical } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { ExperimentStatusBadge } from "@/components/hermes/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { campaigns, experiments } from "@/lib/mock-data";

export default function ExperimentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Experiments"
        right={
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4" />
            New test
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {experiments.map((e) => {
          const c = campaigns.find((c) => c.id === e.campaignId);
          const progress = e.status === "running" ? 58 : e.status === "stopped" ? 100 : 0;

          return (
            <Card key={e.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium">{e.name}</div>
                      <ExperimentStatusBadge status={e.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {c ? (
                        <Link href={`/campaigns/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        e.campaignId
                      )}
                    </div>
                  </div>
                  <SplitSquareVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {e.allocations.map((a) => (
                    <Badge key={a.variantId} variant="secondary">
                      {a.variantId} • {a.pct}%
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sample</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Holdout</div>
                    <div className="mt-1 font-medium">5%</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Winner</div>
                    <div className="mt-1 font-medium">—</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {experiments.length === 0 ? (
        <div className="text-sm text-muted-foreground">No tests yet</div>
      ) : null}
    </div>
  );
}
