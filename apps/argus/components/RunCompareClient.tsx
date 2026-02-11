'use client';

import { useMemo, useState } from 'react';
import { stableStringify } from '@/lib/capture/stable-json';
import { Label } from '@/components/ui/label';

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Left run</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAtIso).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Right run</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAtIso).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Left normalized</p>
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
            {left ? stableStringify(left.normalizedExtracted) : ''}
          </pre>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Right normalized</p>
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
            {right ? stableStringify(right.normalizedExtracted) : ''}
          </pre>
        </div>
      </div>
    </div>
  );
}
