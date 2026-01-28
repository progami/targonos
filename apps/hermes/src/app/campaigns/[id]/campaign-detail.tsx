"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import type { Campaign, DispatchAttempt, Experiment, AmazonConnection } from "@/lib/types";
import { CampaignStatusBadge, DispatchStatusBadge, ExperimentStatusBadge } from "@/components/hermes/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/time";

export function CampaignDetail({
  campaign,
  connection,
  experiments,
  dispatches,
}: {
  campaign: Campaign;
  connection?: AmazonConnection;
  experiments: Experiment[];
  dispatches: DispatchAttempt[];
}) {
  const [delayDays, setDelayDays] = React.useState(String(campaign.schedule.delayDays));
  const [windowEnabled, setWindowEnabled] = React.useState(Boolean(campaign.schedule.timeWindow));
  const [startHour, setStartHour] = React.useState(String(campaign.schedule.timeWindow?.startHourLocal ?? 9));
  const [endHour, setEndHour] = React.useState(String(campaign.schedule.timeWindow?.endHourLocal ?? 18));
  const [timeZone, setTimeZone] = React.useState(campaign.schedule.timeWindow?.timeZone ?? "America/Los_Angeles");
  const [sto, setSto] = React.useState(campaign.schedule.sendTimeOptimization);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{connection?.accountName ?? campaign.connectionId}</div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => toast.message("Not wired")}
          >
            Sync now
          </Button>
          <Button
            onClick={() => toast.success("Saved (mock)")}
          >
            Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Campaign summary</CardTitle>
                <CardDescription>What this campaign does and how it measures lift.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Account</div>
                    <div className="font-medium">{connection?.accountName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Region: {connection?.region ?? "—"}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground">Holdout group</div>
                    <div className="font-medium">{campaign.controlHoldoutPct}%</div>
                    <div className="text-xs text-muted-foreground">
                      Control group is excluded to estimate incremental lift.
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-4 bg-muted/30">
                  <div className="font-medium">Flow (starting point)</div>
                  <ol className="mt-2 space-y-2">
                    <li className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground mt-0.5">1</span>
                      <div>
                        <div className="font-medium">Trigger</div>
                        <div className="text-muted-foreground">Order delivered (eligible marketplace + channel).</div>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground mt-0.5">2</span>
                      <div>
                        <div className="font-medium">Wait</div>
                        <div className="text-muted-foreground">
                          Delay {campaign.schedule.delayDays} days, then respect allowed send window.
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground mt-0.5">3</span>
                      <div>
                        <div className="font-medium">Send</div>
                        <div className="text-muted-foreground">Amazon “Request a Review” solicitation.</div>
                      </div>
                    </li>
                  </ol>
                </div>

                <div className="text-muted-foreground">
                  Created {formatDate(campaign.createdAt)} • Updated {formatDate(campaign.updatedAt)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Safety rails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="font-medium">Eligibility check</div>
                  <div className="text-muted-foreground">
                    Always validate Amazon’s allowed window before enqueueing.
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Throttling aware</div>
                  <div className="text-muted-foreground">
                    Backoff + retry with jitter when Amazon rate-limits.
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Audit log</div>
                  <div className="text-muted-foreground">
                    Every send attempt is logged with reason codes.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Timing controls</CardTitle>
              <CardDescription>
                Your main levers for Amazon solicitations are <span className="font-medium">timing</span> and <span className="font-medium">eligibility</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="delay">Delay after delivery (days)</Label>
                  <Input
                    id="delay"
                    inputMode="numeric"
                    value={delayDays}
                    onChange={(e) => setDelayDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use experiments to compare delay values (e.g., 7 vs 10). Keep it single-variable.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Send time optimization</Label>
                  <Select value={sto} onValueChange={(v) => setSto(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off (fixed window)</SelectItem>
                      <SelectItem value="best_hour">Best hour (learned)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    “Best hour” is a future lever; it requires engagement history. Keep off until implemented.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <div className="font-medium">Restrict to a time window</div>
                  <div className="text-sm text-muted-foreground">
                    Optional. Use if you want to avoid nights/weekends (per seller preference).
                  </div>
                </div>
                <Switch checked={windowEnabled} onCheckedChange={(v) => setWindowEnabled(v)} />
              </div>

              {windowEnabled ? (
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Start hour</Label>
                    <Input value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                    <p className="text-xs text-muted-foreground">0–23 (local time)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>End hour</Label>
                    <Input value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                    <p className="text-xs text-muted-foreground">0–23 (local time)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Time zone</Label>
                    <Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
                    <p className="text-xs text-muted-foreground">IANA zone (e.g., America/Los_Angeles)</p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-medium">Implementation note</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Store schedule config in DB.</li>
                  <li>When an order becomes eligible, compute the next allowed send time.</li>
                  <li>Enqueue a job for that timestamp; revalidate eligibility at run time.</li>
                  <li>Apply global caps + quiet hours before hitting the API.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experiments">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Active experiments</CardTitle>
                <CardDescription>Measure impact without changing message content.</CardDescription>
              </CardHeader>
              <CardContent>
                {experiments.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No experiments yet.</div>
                ) : (
                  <div className="space-y-3">
                    {experiments.map((e) => (
                      <div key={e.id} className="flex items-start justify-between rounded-md border p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{e.name}</div>
                            <ExperimentStatusBadge status={e.status} />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Primary metric: {e.primaryMetric.replaceAll("_", " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Started: {e.startedAt ? formatDateTime(e.startedAt) : "—"}
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/experiments">
                            View <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Experiment hygiene</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="rounded-md border p-3">
                  <div className="font-medium">Single variable</div>
                  <div className="text-muted-foreground">Change one thing at a time (delay, window, STO).</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Holdouts</div>
                  <div className="text-muted-foreground">Keep a control group to estimate incremental lift.</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Stop rule</div>
                  <div className="text-muted-foreground">Predefine when to pick a winner (volume / time).</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Dispatch log</CardTitle>
              <CardDescription>All attempts for this campaign (mock data).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-muted-foreground">{formatDateTime(d.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.orderId}</TableCell>
                      <TableCell>
                        <DispatchStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
