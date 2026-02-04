'use client';

import { useMemo, useState } from 'react';
import { stableStringify } from '@/lib/capture/stable-json';

type RunOption = {
  id: string;
  startedAtIso: string;
  normalizedExtracted: unknown;
};

export function RunCompareClient(props: { runs: RunOption[] }) {
  const runs = props.runs;
  const [leftId, setLeftId] = useState(runs[0]?.id ?? '');
  const [rightId, setRightId] = useState(runs[1]?.id ?? runs[0]?.id ?? '');

  const left = useMemo(() => runs.find((r) => r.id === leftId) ?? null, [runs, leftId]);
  const right = useMemo(() => runs.find((r) => r.id === rightId) ?? null, [runs, rightId]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <div className="text-sm font-medium">Left run</div>
          <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={leftId} onChange={(e) => setLeftId(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAtIso).toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Right run</div>
          <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={rightId} onChange={(e) => setRightId(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAtIso).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-slate-700">Left normalized</div>
          <pre className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">
            {left ? stableStringify(left.normalizedExtracted) : ''}
          </pre>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-700">Right normalized</div>
          <pre className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs">
            {right ? stableStringify(right.normalizedExtracted) : ''}
          </pre>
        </div>
      </div>
    </div>
  );
}
