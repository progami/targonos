import * as React from "react";
import { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-card">
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium">{title}</div>
        {actionLabel && onAction ? (
          <Button onClick={onAction} size="sm">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
