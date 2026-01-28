"use client";

import * as React from "react";
import { ExternalLink, Plus, PlugZap } from "lucide-react";
import { toast } from "sonner";

import type { AmazonConnection } from "@/lib/types";
import { PageHeader } from "@/components/hermes/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function statusBadge(status: AmazonConnection["status"]) {
  const label =
    status === "connected" ? "Connected" : status === "needs_reauth" ? "Reauth" : "Disconnected";
  const variant = status === "connected" ? "secondary" : status === "needs_reauth" ? "outline" : "destructive";
  return <Badge variant={variant as any}>{label}</Badge>;
}

export function AccountsClient({ connections }: { connections: AmazonConnection[] }) {
  const [open, setOpen] = React.useState(false);

  function connect() {
    setOpen(false);
    toast.message("Not wired", { description: "Redirect to Amazon consent + store refresh token." });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Amazon account</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input placeholder="e.g. US Seller" />
                </div>
                <div className="space-y-2">
                  <Label>Seller ID</Label>
                  <Input placeholder="A1…" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={connect}>Continue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((c) => (
          <Card key={c.id} className="transition-shadow hover:shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.accountName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.region} • {c.marketplaceIds.join(", ")}
                  </div>
                </div>
                {statusBadge(c.status)}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-between"
                  onClick={() => toast.message("Not wired")}
                >
                  Reauth <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-between"
                  onClick={() => toast.message("Not wired")}
                >
                  Test <PlugZap className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
