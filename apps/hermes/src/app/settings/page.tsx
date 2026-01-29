"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck, Timer } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const [quietHoursEnabled, setQuietHoursEnabled] = React.useState(true);
  const [qhStart, setQhStart] = React.useState("21");
  const [qhEnd, setQhEnd] = React.useState("7");
  const [qhTz, setQhTz] = React.useState("America/Los_Angeles");

  const [dailyCapEnabled, setDailyCapEnabled] = React.useState(true);
  const [dailyCap, setDailyCap] = React.useState("2000");

  const [defaultHoldout, setDefaultHoldout] = React.useState("5");
  const [dedupeEnabled, setDedupeEnabled] = React.useState(true);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        right={
          <Button size="sm" onClick={() => toast.success("Saved (mock)")}>
            Save
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4" /> Quiet hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="m-0">Enabled</Label>
              <Switch checked={quietHoursEnabled} onCheckedChange={setQuietHoursEnabled} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Start (hour)</Label>
                <Input type="number" min={0} max={23} value={qhStart} onChange={(e) => setQhStart(e.target.value)} disabled={!quietHoursEnabled} />
                <div className="text-xs text-muted-foreground">0–23, e.g. 21 = 9 PM</div>
              </div>
              <div className="space-y-2">
                <Label>End (hour)</Label>
                <Input type="number" min={0} max={23} value={qhEnd} onChange={(e) => setQhEnd(e.target.value)} disabled={!quietHoursEnabled} />
                <div className="text-xs text-muted-foreground">0–23, e.g. 7 = 7 AM</div>
              </div>
              <div className="space-y-2">
                <Label>TZ</Label>
                <Select value={qhTz} onValueChange={setQhTz} disabled={!quietHoursEnabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Guardrails
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="m-0">Dedupe (1 / order)</Label>
              <Switch checked={dedupeEnabled} onCheckedChange={setDedupeEnabled} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Daily cap</Label>
                <Input
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  disabled={!dailyCapEnabled}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="m-0">Cap enabled</Label>
                <Switch checked={dailyCapEnabled} onCheckedChange={setDailyCapEnabled} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default holdout</Label>
              <Select value={defaultHoldout} onValueChange={setDefaultHoldout}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["0", "5", "10", "20"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
