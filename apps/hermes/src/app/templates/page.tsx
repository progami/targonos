import { Lock } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TEMPLATES = [
  {
    id: "tpl_01",
    name: "Amazon Request a Review",
    channel: "amazon_solicitations",
    editable: false,
    description:
      "Amazon-controlled template. Hermes controls timing/eligibility/experiments, not message copy.",
  },
];

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="transition-shadow hover:shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.channel.replaceAll("_", " ")}</div>
                </div>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">Amazon standard</Badge>
                <Badge variant="outline">Timing controls</Badge>
                <Badge variant="outline">Holdouts</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
