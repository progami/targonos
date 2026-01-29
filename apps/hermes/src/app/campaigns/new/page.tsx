"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  FlaskConical,
  Info,
  Mail,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/hermes/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { hermesApiUrl } from "@/lib/base-path";
import { useConnectionsStore } from "@/stores/connections-store";

function HourSelect({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (v: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onValueChange(Number(v))}>
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 24 }).map((_, h) => (
          <SelectItem key={h} value={String(h)}>
            {String(h).padStart(2, "0")}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PresetTile({
  title,
  meta,
  onClick,
  active,
}: {
  title: string;
  meta: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-3 text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active ? "bg-accent text-accent-foreground" : "bg-card",
      ].join(" ")}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </button>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { connections, fetch: fetchConnections } = useConnectionsStore();

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const [tab, setTab] = React.useState<"basics" | "timing" | "experiment" | "review">("basics");

  // Basics
  const [name, setName] = React.useState("Review Request");
  const [connectionId, setConnectionId] = React.useState("");
  const [startLive, setStartLive] = React.useState(true);

  // Set default connection once loaded
  React.useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connections, connectionId]);

  // Timing
  const [delayDays, setDelayDays] = React.useState(10);
  const [windowEnabled, setWindowEnabled] = React.useState(true);
  const [startHour, setStartHour] = React.useState(9);
  const [endHour, setEndHour] = React.useState(18);

  // Advanced (progressive disclosure)
  const [spreadEnabled, setSpreadEnabled] = React.useState(true);
  const [spreadMaxMinutes, setSpreadMaxMinutes] = React.useState(90);
  const [sto, setSto] = React.useState(false);

  // Experiment
  const [abEnabled, setAbEnabled] = React.useState(false);
  const [holdout, setHoldout] = React.useState(5);
  const [abVariable, setAbVariable] = React.useState<"delay" | "window" | "spread">("delay");
  const [delayB, setDelayB] = React.useState(14);

  const [creating, setCreating] = React.useState(false);

  const connection = connections.find((c) => c.id === connectionId);

  const scheduleSummary = `${windowEnabled ? `${startHour}:00–${endHour}:00` : "Any time"} • D+${delayDays}`;

  function clampDelay(v: number) {
    return Math.max(5, Math.min(30, v));
  }

  async function create() {
    setCreating(true);
    try {
      const schedule: Record<string, unknown> = {
        delayDays,
        sendTimeOptimization: sto ? "best_hour" : "off",
      };
      if (windowEnabled) {
        schedule.timeWindow = {
          startHourLocal: startHour,
          endHourLocal: endHour,
          timeZone: "America/Los_Angeles",
        };
      }
      if (spreadEnabled) {
        schedule.randomDelayMinutes = { minMinutes: 0, maxMinutes: spreadMaxMinutes };
      }

      const res = await fetch(hermesApiUrl("/api/campaigns"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          connectionId,
          status: startLive ? "live" : "draft",
          schedule,
          controlHoldoutPct: holdout,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        toast.error("Failed to create campaign", { description: json?.error ?? "" });
        return;
      }
      toast.success("Campaign created");
      router.push("/campaigns");
    } catch (e: any) {
      toast.error("Failed to create campaign", { description: e?.message ?? "" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New campaign"
        right={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button size="sm" onClick={create} disabled={creating}>
              Create
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="experiment">Test</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="basics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Campaign name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Review Request • Default" />
              </div>

              <div className="space-y-2">
                <Label>Amazon account</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.accountName} ({c.region})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <div className="text-sm font-medium">Request a review</div>
                </div>
                <div className="text-xs text-muted-foreground">Amazon standard message</div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Label className="m-0">Start live</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground">
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">
                          Live campaigns schedule sends automatically. Draft stays idle.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch checked={startLive} onCheckedChange={setStartLive} />
              </div>

              <div className="flex justify-end gap-2 md:col-span-2">
                <Button variant="outline" onClick={() => setTab("timing")}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timing" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Send timing</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <SlidersHorizontal className="h-4 w-4" />
                      Advanced
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Advanced timing</DialogTitle>
                      <DialogDescription>Optional knobs for smoothing volume and testing.</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="h-4 w-4" />
                          <div className="text-sm font-medium">Spread sends</div>
                        </div>
                        <Switch checked={spreadEnabled} onCheckedChange={setSpreadEnabled} />
                      </div>

                      <div className="grid gap-2">
                        <Label>Max spread (minutes)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={720}
                          value={spreadMaxMinutes}
                          onChange={(e) => setSpreadMaxMinutes(Number(e.target.value))}
                          disabled={!spreadEnabled}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="h-4 w-4" />
                          <div className="text-sm font-medium">Best hour (future)</div>
                        </div>
                        <Switch checked={sto} onCheckedChange={setSto} />
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <PresetTile
                    title="Balanced"
                    meta="D+10 • 9–18"
                    active={delayDays === 10 && windowEnabled}
                    onClick={() => {
                      setDelayDays(10);
                      setWindowEnabled(true);
                      setStartHour(9);
                      setEndHour(18);
                    }}
                  />
                  <PresetTile
                    title="Early"
                    meta="D+5 • 9–18"
                    active={delayDays === 5 && windowEnabled}
                    onClick={() => {
                      setDelayDays(5);
                      setWindowEnabled(true);
                      setStartHour(9);
                      setEndHour(18);
                    }}
                  />
                  <PresetTile
                    title="Late"
                    meta="D+20 • Any time"
                    active={delayDays === 20 && !windowEnabled}
                    onClick={() => {
                      setDelayDays(20);
                      setWindowEnabled(false);
                    }}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Delay (days after delivery)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setDelayDays((d) => clampDelay(d - 1))}
                      >
                        –
                      </Button>
                      <Input
                        type="number"
                        min={5}
                        max={30}
                        value={delayDays}
                        onChange={(e) => setDelayDays(clampDelay(Number(e.target.value)))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setDelayDays((d) => clampDelay(d + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      <Label className="m-0">Send window</Label>
                    </div>
                    <Switch checked={windowEnabled} onCheckedChange={setWindowEnabled} />
                  </div>
                </div>

                {windowEnabled ? (
                  <div className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Local time</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <HourSelect value={startHour} onValueChange={setStartHour} />
                      <span className="text-muted-foreground">to</span>
                      <HourSelect value={endHour} onValueChange={setEndHour} />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Preview</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-md border px-2 py-1">Delivered</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="rounded-md border px-2 py-1">Earliest D+5</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="rounded-md border px-2 py-1 font-medium">Scheduled D+{delayDays}</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="rounded-md border px-2 py-1">Latest D+30</span>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setTab("basics")}>
                    Back
                  </Button>
                  <Button variant="outline" onClick={() => setTab("experiment")}>
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="truncate">{connection?.accountName ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Schedule</span>
                  <span>{scheduleSummary}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Holdout</span>
                  <span>{holdout}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Spread</span>
                  <span>{spreadEnabled ? `0–${spreadMaxMinutes}m` : "Off"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="experiment" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Testing</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="m-0 text-sm">A/B</Label>
                <Switch checked={abEnabled} onCheckedChange={setAbEnabled} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Holdout</Label>
                  <Select value={String(holdout)} onValueChange={(v) => setHoldout(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 10, 20].map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {v}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {abEnabled ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Variable</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground">
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">
                              Test one variable at a time for clean results.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select value={abVariable} onValueChange={(v) => setAbVariable(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delay">Delay days</SelectItem>
                        <SelectItem value="window">Send window</SelectItem>
                        <SelectItem value="spread">Spread</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {abEnabled && abVariable === "delay" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Variant A</div>
                    <div className="mt-2 text-sm font-medium">D+{delayDays}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Variant B</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={30}
                        value={delayB}
                        onChange={(e) => setDelayB(clampDelay(Number(e.target.value)))}
                      />
                      <div className="text-sm font-medium">days</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {abEnabled && abVariable !== "delay" ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  Variant editor (scaffold)
                </div>
              ) : null}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setTab("timing")}>
                  Back
                </Button>
                <Button variant="outline" onClick={() => setTab("review")}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Campaign</div>
                  <div className="mt-1 text-sm font-medium">{name || "Untitled"}</div>
                </div>
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Account</div>
                  <div className="mt-1 text-sm font-medium">{connection?.accountName ?? "—"}</div>
                </div>
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Timing</div>
                  <div className="mt-1 text-sm font-medium">{scheduleSummary}</div>
                </div>
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Mode</div>
                  <div className="mt-1 text-sm font-medium">{startLive ? "Live" : "Draft"}</div>
                </div>
              </div>

              <div className="rounded-md border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4" /> Guardrails
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-md border px-2 py-1 text-xs">1 / order</span>
                  <span className="rounded-md border px-2 py-1 text-xs">5–30 days</span>
                  <span className="rounded-md border px-2 py-1 text-xs">Rate-limited</span>
                  <span className="rounded-md border px-2 py-1 text-xs">Audit logged</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setTab("experiment")}>
                  Back
                </Button>
                <Button onClick={create} disabled={creating}>Create</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
