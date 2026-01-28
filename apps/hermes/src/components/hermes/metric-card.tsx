import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  subtext,
}: {
  title: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {subtext ? <div className="text-xs text-muted-foreground mt-1">{subtext}</div> : null}
      </CardContent>
    </Card>
  );
}
