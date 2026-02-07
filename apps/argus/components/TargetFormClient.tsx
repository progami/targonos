'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Marketplace, WatchTargetOwner, WatchTargetType } from '@targon/prisma-argus';

import { withAppBasePath } from '@/lib/base-path';
import { WatchTargetInputSchema, type WatchTargetInput } from '@/lib/targets/target-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Package, Search, Trophy } from 'lucide-react';

function toTrackedAsinsText(asins: string[]) {
  return asins.join('\n');
}

function parseTrackedAsins(text: string): string[] {
  return text
    .split(/[\n,]+/g)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export type TargetFormInitial = {
  id: string;
  type: WatchTargetType;
  marketplace: Marketplace;
  owner: WatchTargetOwner;
  label: string;
  asin: string | null;
  keyword: string | null;
  sourceUrl: string | null;
  trackedAsins: string[];
  cadenceMinutes: number;
  enabled: boolean;
};

const TYPE_OPTIONS: { value: WatchTargetType; label: string; icon: typeof Package; description: string }[] = [
  { value: 'ASIN', label: 'Product (ASIN)', icon: Package, description: 'Track a single product listing' },
  { value: 'SEARCH', label: 'Search Keyword', icon: Search, description: 'Track search ranking positions' },
  { value: 'BROWSE_BESTSELLERS', label: 'Bestsellers', icon: Trophy, description: 'Track bestseller category rankings' },
];

function typeToRoute(type: WatchTargetType): string {
  switch (type) {
    case 'ASIN': return '/products';
    case 'SEARCH': return '/rankings';
    case 'BROWSE_BESTSELLERS': return '/bestsellers';
  }
}

export function TargetFormClient(props: { mode: 'create' | 'edit'; initial?: TargetFormInitial }) {
  const router = useRouter();
  const initial = props.initial;

  const [type, setType] = useState<WatchTargetInput['type']>(initial?.type ?? 'ASIN');
  const [marketplace, setMarketplace] = useState<WatchTargetInput['marketplace']>(initial?.marketplace ?? 'US');
  const [owner, setOwner] = useState<WatchTargetInput['owner']>(initial?.owner ?? 'OURS');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [asin, setAsin] = useState(initial?.asin ?? '');
  const [keyword, setKeyword] = useState(initial?.keyword ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? '');
  const [trackedAsinsText, setTrackedAsinsText] = useState(toTrackedAsinsText(initial?.trackedAsins ?? []));
  const [cadenceMinutes, setCadenceMinutes] = useState(String(initial?.cadenceMinutes ?? 360));
  const [enabled, setEnabled] = useState(Boolean(initial?.enabled ?? true));

  const trackedAsins = useMemo(() => parseTrackedAsins(trackedAsinsText), [trackedAsinsText]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      type,
      marketplace,
      owner,
      label,
      asin: asin.trim() ? asin.trim() : undefined,
      keyword: keyword.trim() ? keyword.trim() : undefined,
      sourceUrl: sourceUrl.trim() ? sourceUrl.trim() : undefined,
      trackedAsins,
      cadenceMinutes: Number.parseInt(cadenceMinutes, 10),
      enabled,
    };

    let parsed: WatchTargetInput;
    try {
      parsed = WatchTargetInputSchema.parse(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setSaving(true);
    try {
      const endpoint =
        props.mode === 'create'
          ? withAppBasePath('/api/targets')
          : withAppBasePath(`/api/targets/${initial?.id ?? ''}`);

      const method = props.mode === 'create' ? 'POST' : 'PATCH';
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }

      const json = await response.json();
      const id = json?.target?.id as string | undefined;
      if (!id) {
        throw new Error('Malformed response');
      }
      router.push(`${typeToRoute(type)}/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Target Type Selection */}
      {props.mode === 'create' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Target Type</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <p className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {props.mode === 'edit' && (
        <div className="flex items-center gap-2">
          <Badge variant="info" className="text-2xs">{type}</Badge>
          <span className="text-xs text-muted-foreground">Target type cannot be changed</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. My SKU — Product name"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Marketplace</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value as WatchTargetInput['marketplace'])}
              >
                <option value="US">US</option>
                <option value="UK">UK</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Owner</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={owner}
                onChange={(e) => setOwner(e.target.value as WatchTargetInput['owner'])}
              >
                <option value="OURS">Ours</option>
                <option value="COMPETITOR">Competitor</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cadence (minutes)</Label>
              <Input
                value={cadenceMinutes}
                onChange={(e) => setCadenceMinutes(e.target.value)}
                inputMode="numeric"
                className="h-9 text-sm"
                placeholder="360"
              />
            </div>
          </div>

          {type === 'ASIN' && (
            <div className="space-y-1.5">
              <Label className="text-xs">ASIN</Label>
              <Input
                value={asin}
                onChange={(e) => setAsin(e.target.value)}
                placeholder="e.g. B0ABCDEF12"
                className="h-9 font-mono text-sm"
              />
            </div>
          )}

          {type === 'SEARCH' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Keyword</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. organic dog food"
                className="h-9 text-sm"
              />
            </div>
          )}

          {type === 'BROWSE_BESTSELLERS' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Bestsellers URL</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.amazon.com/Best-Sellers/..."
                className="h-9 text-sm"
              />
            </div>
          )}

          {(type === 'SEARCH' || type === 'BROWSE_BESTSELLERS') && (
            <div className="space-y-1.5">
              <Label className="text-xs">Tracked ASINs (comma or newline separated)</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={trackedAsinsText}
                onChange={(e) => setTrackedAsinsText(e.target.value)}
                placeholder="B0ABCDEF12&#10;B0GHIJKL34"
              />
              {trackedAsins.length > 0 && (
                <p className="text-2xs text-muted-foreground">{trackedAsins.length} ASINs tracked</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <Label className="text-xs">
              {enabled ? 'Monitoring enabled' : 'Monitoring paused'}
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving</>
          ) : (
            <><Save className="mr-1.5 h-4 w-4" />{props.mode === 'create' ? 'Create Target' : 'Save Changes'}</>
          )}
        </Button>
      </div>
    </form>
  );
}
