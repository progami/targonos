'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Radar } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export type MonitoringListItem = {
  id: string;
  label: string;
  asin: string;
  marketplace: 'US' | 'UK';
  owner: 'OURS' | 'COMPETITOR';
  source: 'TALOS' | 'MANUAL';
  enabled: boolean;
  cadenceMinutes: number;
  lastRunAt: string | null;
  lastChangeAt: string | null;
  alertRuleId: string | null;
  alertsEnabled: boolean;
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function upperTrim(input: string): string {
  return input.trim().toUpperCase();
}

export function MonitoringListClient(props: { items: MonitoringListItem[] }) {
  const [query, setQuery] = useState('');
  const q = normalize(query);

  const [owner, setOwner] = useState<'ALL' | 'OURS' | 'COMPETITOR'>('ALL');
  const [marketplace, setMarketplace] = useState<'ALL' | 'US' | 'UK'>('ALL');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [source, setSource] = useState<'ALL' | 'TALOS' | 'MANUAL'>('ALL');

  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return props.items.filter((item) => {
      if (owner !== 'ALL' && item.owner !== owner) return false;
      if (marketplace !== 'ALL' && item.marketplace !== marketplace) return false;
      if (status !== 'ALL') {
        if (status === 'ACTIVE' && !item.enabled) return false;
        if (status === 'PAUSED' && item.enabled) return false;
      }
      if (source !== 'ALL' && item.source !== source) return false;

      if (!q) return true;
      const hay = normalize(`${item.label} ${item.asin} ${item.marketplace} ${item.owner}`);
      return hay.includes(q);
    });
  }, [props.items, owner, marketplace, status, source, q]);

  async function setAlertsEnabled(item: MonitoringListItem, enabled: boolean) {
    setError(null);
    setBusyRule(item.id);
    try {
      if (item.alertRuleId) {
        const res = await fetch(withAppBasePath(`/api/alerts/rules/${item.alertRuleId}`), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
      } else {
        const res = await fetch(withAppBasePath('/api/alerts/rules'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetId: item.id, enabled }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
      }

      // Keep it simple: refresh state from server.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyRule(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold">Listings</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} shown</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search label, ASIN, marketplace..."
                  className="h-9"
                />
              </div>

              <AddCompetitorDialog />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-2xs text-muted-foreground">Owner</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={owner}
                onChange={(e) => setOwner(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="OURS">Ours</option>
                <option value="COMPETITOR">Competitor</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-muted-foreground">Marketplace</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="US">US</option>
                <option value="UK">UK</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-muted-foreground">Status</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-muted-foreground">Source</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="TALOS">Talos</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No matches.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Listing</th>
                    <th className="px-4 py-3 font-medium">ASIN</th>
                    <th className="px-4 py-3 font-medium">Marketplace</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Check</th>
                    <th className="px-4 py-3 font-medium">Last Signal Change</th>
                    <th className="px-4 py-3 font-medium text-right">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/monitoring/${t.id}`} className="font-medium text-foreground hover:text-primary">
                          {t.label}
                        </Link>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant={t.source === 'TALOS' ? 'info' : 'neutral'} className="text-2xs">
                            {t.source}
                          </Badge>
                          <span className="text-2xs text-muted-foreground tabular-nums">{t.cadenceMinutes}m</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{t.asin}</code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.marketplace === 'US' ? 'info' : 'neutral'} className="text-2xs">
                          {t.marketplace}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.owner === 'OURS' ? 'success' : 'warning'} className="text-2xs">
                          {t.owner}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.enabled ? 'success' : 'neutral'} className="text-2xs">
                          {t.enabled ? 'Active' : 'Paused'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.lastRunAt ? formatRelativeTime(t.lastRunAt) : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.lastChangeAt ? formatRelativeTime(t.lastChangeAt) : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Switch
                          checked={t.alertsEnabled}
                          disabled={busyRule === t.id}
                          onChange={(e) => setAlertsEnabled(t, e.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddCompetitorDialog() {
  const [open, setOpen] = useState(false);

  const [marketplace, setMarketplace] = useState<'US' | 'UK'>('US');
  const [asin, setAsin] = useState('');
  const [label, setLabel] = useState('');
  const [cadenceMinutes, setCadenceMinutes] = useState('360');
  const [enabled, setEnabled] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      marketplace,
      asin: upperTrim(asin),
      label: label.trim(),
      cadenceMinutes: Number.parseInt(cadenceMinutes, 10),
      enabled,
    };

    setBusy(true);
    try {
      const res = await fetch(withAppBasePath('/api/listings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      const id = json?.listing?.id as string | undefined;
      if (!id) throw new Error('Malformed response');
      setOpen(false);
      window.location.href = withAppBasePath(`/monitoring/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add competitor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Add competitor listing
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Marketplace</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as any)}
            >
              <option value="US">US</option>
              <option value="UK">UK</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">ASIN</Label>
            <Input
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="B0ABCDEF12"
              className="h-9 font-mono"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Competitor name"
              className="h-9"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cadence (minutes)</Label>
              <Input
                value={cadenceMinutes}
                onChange={(e) => setCadenceMinutes(e.target.value)}
                inputMode="numeric"
                className="h-9"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Enabled</p>
                <p className="text-2xs text-muted-foreground">Start monitoring immediately</p>
              </div>
              <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

