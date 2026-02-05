'use client';

import { useMemo, useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';

type Rule = {
  id: string;
  enabled: boolean;
  thresholds: unknown;
};

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

export function AlertRulesClient(props: { targetId: string; initialRules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(props.initialRules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const editors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const rule of rules) {
      map[rule.id] = stringifyJson(rule.thresholds);
    }
    return map;
  }, [rules]);

  const [thresholdEditors, setThresholdEditors] = useState<Record<string, string>>(editors);

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

  async function onSaveThresholds(rule: Rule) {
    setError(null);
    setBusy(rule.id);
    try {
      const text = thresholdEditors[rule.id] ?? '{}';
      const parsed = JSON.parse(text) as unknown;
      await patchRule(rule.id, { thresholds: parsed });
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
      setThresholdEditors((prev) => ({ ...prev, [rule.id]: stringifyJson(rule.thresholds) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">Alert rules</div>
        <button
          type="button"
          onClick={onAddRule}
          disabled={busy === 'add'}
          className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
        >
          Add rule
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-800">Rule {rule.id.slice(0, 8)}…</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  disabled={busy === rule.id}
                  onChange={(e) => onToggle(rule, e.target.checked)}
                />
                <span>Enabled</span>
              </label>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-slate-700">Thresholds (JSON)</div>
              <textarea
                className="mt-1 h-32 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                value={thresholdEditors[rule.id] ?? '{}'}
                onChange={(e) => setThresholdEditors((prev) => ({ ...prev, [rule.id]: e.target.value }))}
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => onSaveThresholds(rule)}
                  disabled={busy === rule.id}
                  className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Save thresholds
                </button>
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 ? <div className="text-sm text-slate-500">No rules yet.</div> : null}
      </div>
    </div>
  );
}

