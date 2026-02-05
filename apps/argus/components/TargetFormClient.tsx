'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Marketplace, WatchTargetOwner, WatchTargetType } from '@targon/prisma-argus';

import { withAppBasePath } from '@/lib/base-path';
import { WatchTargetInputSchema, type WatchTargetInput } from '@/lib/targets/target-input';

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
      router.push(`/targets/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-sm font-medium">Type</div>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as WatchTargetInput['type'])}
          >
            <option value="ASIN">ASIN</option>
            <option value="SEARCH">SEARCH</option>
            <option value="BROWSE_BESTSELLERS">Bestsellers</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Marketplace</div>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value as WatchTargetInput['marketplace'])}
          >
            <option value="US">US</option>
            <option value="UK">UK</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Owner</div>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={owner}
            onChange={(e) => setOwner(e.target.value as WatchTargetInput['owner'])}
          >
            <option value="OURS">OURS</option>
            <option value="COMPETITOR">COMPETITOR</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Label</div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. My SKU — Product name"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">ASIN</div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder="Required for ASIN targets"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Keyword</div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Required for SEARCH targets"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <div className="text-sm font-medium">Bestsellers URL</div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Required for Bestsellers targets"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <div className="text-sm font-medium">Tracked ASINs (comma or newline separated)</div>
          <textarea
            className="h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={trackedAsinsText}
            onChange={(e) => setTrackedAsinsText(e.target.value)}
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Cadence (minutes)</div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={cadenceMinutes}
            onChange={(e) => setCadenceMinutes(e.target.value)}
            inputMode="numeric"
          />
        </label>

        <label className="flex items-center gap-2 pt-7">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm">Enabled</span>
        </label>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : props.mode === 'create' ? 'Create target' : 'Save'}
      </button>
    </form>
  );
}
