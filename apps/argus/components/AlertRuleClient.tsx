'use client';

import { useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save } from 'lucide-react';

type Rule = {
  id: string;
  enabled: boolean;
  thresholds: unknown;
};

type ThresholdFields = {
  titleChanged?: boolean;
  priceDeltaPct?: number;
  priceDeltaAbs?: number;
  imagesChanged?: boolean;
};

function parseThresholds(t: unknown): ThresholdFields {
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as ThresholdFields;
  return {};
}

export function AlertRuleClient(props: { targetId: string; rule: Rule | null }) {
  const [rule, setRule] = useState<Rule | null>(props.rule);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [edit, setEdit] = useState<ThresholdFields>(() => parseThresholds(props.rule?.thresholds ?? null));

  function update(field: keyof ThresholdFields, value: unknown) {
    setEdit((prev) => ({ ...prev, [field]: value }));
  }

  async function createIfMissing() {
    if (rule) return rule;
    setError(null);
    setBusy('create');
    try {
      const res = await fetch(withAppBasePath('/api/alerts/rules'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetId: props.targetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      const created = json?.rule as Rule | undefined;
      if (!created) throw new Error('Malformed response');
      setRule(created);
      setEdit(parseThresholds(created.thresholds));
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function patchRule(id: string, data: { enabled?: boolean; thresholds?: unknown }) {
    const res = await fetch(withAppBasePath(`/api/alerts/rules/${id}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const json = await res.json();
    const updated = json?.rule as Rule | undefined;
    if (!updated) throw new Error('Malformed response');
    setRule(updated);
    return updated;
  }

  async function onToggle(enabled: boolean) {
    setError(null);
    setBusy('toggle');
    try {
      const r = await createIfMissing();
      await patchRule(r.id, { enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    setError(null);
    setBusy('save');
    try {
      const r = await createIfMissing();
      await patchRule(r.id, { thresholds: edit });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={rule?.enabled ? 'success' : 'neutral'} className="text-2xs">
              {rule?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {rule ? <span className="font-mono text-2xs text-muted-foreground">{rule.id.slice(0, 8)}</span> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Single rule per listing.</p>
        </div>
        <Switch checked={Boolean(rule?.enabled)} disabled={busy !== null} onChange={(e) => onToggle(e.target.checked)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Switch
            checked={Boolean(edit.titleChanged)}
            onChange={(e) => update('titleChanged', e.target.checked)}
          />
          <Label className="text-xs">Title changed</Label>
        </div>

        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Switch
            checked={Boolean(edit.imagesChanged)}
            onChange={(e) => update('imagesChanged', e.target.checked)}
          />
          <Label className="text-xs">Images changed</Label>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Price delta %</Label>
          <Input
            type="number"
            step="0.1"
            className="h-9"
            value={edit.priceDeltaPct ?? ''}
            onChange={(e) => update('priceDeltaPct', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="e.g. 5"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Price delta $</Label>
          <Input
            type="number"
            step="0.01"
            className="h-9"
            value={edit.priceDeltaAbs ?? ''}
            onChange={(e) => update('priceDeltaAbs', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="e.g. 1.00"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onSave} disabled={busy !== null}>
          {busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save thresholds
        </Button>
      </div>
    </div>
  );
}
