'use client';

import { useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Save } from 'lucide-react';

type Rule = {
  id: string;
  enabled: boolean;
  thresholds: unknown;
};

type ThresholdFields = {
  titleChanged?: boolean;
  priceDeltaPct?: number;
  priceDeltaAbs?: number;
  ratingDelta?: number;
  enterExitTop10?: boolean;
  enterExitTop100?: boolean;
  positionDelta?: number;
};

function parseThresholds(t: unknown): ThresholdFields {
  if (t && typeof t === 'object') return t as ThresholdFields;
  return {};
}

export function AlertRulesClient(props: { targetId: string; targetType: string; rules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(props.rules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, ThresholdFields>>(() => {
    const map: Record<string, ThresholdFields> = {};
    for (const rule of props.rules) {
      map[rule.id] = parseThresholds(rule.thresholds);
    }
    return map;
  });

  function updateEdit(ruleId: string, field: string, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], [field]: value },
    }));
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
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: updated.enabled, thresholds: updated.thresholds } : r)));
  }

  async function onToggle(rule: Rule, enabled: boolean) {
    setError(null);
    setBusy(rule.id);
    try {
      await patchRule(rule.id, { enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSave(rule: Rule) {
    setError(null);
    setBusy(rule.id);
    try {
      await patchRule(rule.id, { thresholds: edits[rule.id] ?? {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onAddRule() {
    setError(null);
    setBusy('add');
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
      const rule = json?.rule as Rule | undefined;
      if (!rule) throw new Error('Malformed response');
      setRules((prev) => [...prev, rule]);
      setEdits((prev) => ({ ...prev, [rule.id]: parseThresholds(rule.thresholds) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const isAsin = props.targetType === 'ASIN';
  const isSearch = props.targetType === 'SEARCH';
  const isBestsellers = props.targetType === 'BROWSE_BESTSELLERS';

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alert rules configured.</p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const fields = edits[rule.id] ?? {};
            return (
              <div key={rule.id} className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.enabled ? 'success' : 'neutral'} className="text-2xs">
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <span className="font-mono text-2xs text-muted-foreground">{rule.id.slice(0, 8)}</span>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    disabled={busy === rule.id}
                    onChange={(e) => onToggle(rule, e.target.checked)}
                  />
                </div>

                {/* Threshold fields based on target type */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {isAsin && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={fields.titleChanged ?? false}
                          onChange={(e) => updateEdit(rule.id, 'titleChanged', e.target.checked)}
                        />
                        <Label className="text-xs">Alert on title change</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price delta %</Label>
                        <Input
                          type="number"
                          step="0.1"
                          className="h-8 text-xs"
                          value={fields.priceDeltaPct ?? ''}
                          onChange={(e) => updateEdit(rule.id, 'priceDeltaPct', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 5"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price delta $</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-xs"
                          value={fields.priceDeltaAbs ?? ''}
                          onChange={(e) => updateEdit(rule.id, 'priceDeltaAbs', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 1.00"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rating delta</Label>
                        <Input
                          type="number"
                          step="0.1"
                          className="h-8 text-xs"
                          value={fields.ratingDelta ?? ''}
                          onChange={(e) => updateEdit(rule.id, 'ratingDelta', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 0.2"
                        />
                      </div>
                    </>
                  )}
                  {isSearch && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={fields.enterExitTop10 ?? false}
                          onChange={(e) => updateEdit(rule.id, 'enterExitTop10', e.target.checked)}
                        />
                        <Label className="text-xs">Alert on enter/exit top 10</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Position delta</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={fields.positionDelta ?? ''}
                          onChange={(e) => updateEdit(rule.id, 'positionDelta', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 5"
                        />
                      </div>
                    </>
                  )}
                  {isBestsellers && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={fields.enterExitTop100 ?? false}
                          onChange={(e) => updateEdit(rule.id, 'enterExitTop100', e.target.checked)}
                        />
                        <Label className="text-xs">Alert on enter/exit top 100</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Position delta</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={fields.positionDelta ?? ''}
                          onChange={(e) => updateEdit(rule.id, 'positionDelta', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 10"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => onSave(rule)} disabled={busy === rule.id}>
                    {busy === rule.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onAddRule} disabled={busy === 'add'}>
        {busy === 'add' ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1.5 h-3.5 w-3.5" />
        )}
        Add Rule
      </Button>
    </div>
  );
}
