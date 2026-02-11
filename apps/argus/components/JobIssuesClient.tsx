'use client';

import { useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';

export type JobIssueItem = {
  id: string;
  status: 'FAILED' | 'BLOCKED';
  scheduledAt: string;
  finishedAt: string | null;
  lastError: string | null;
  acknowledgedAt: string | null;
};

export function JobIssuesClient(props: { items: JobIssueItem[] }) {
  const [items, setItems] = useState(props.items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ack(id: string) {
    setError(null);
    setBusy(id);
    try {
      const res = await fetch(withAppBasePath('/api/attention/ack'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'job', id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Ack failed (${res.status})`);
      }
      setItems((prev) =>
        prev.map((j) => (j.id === id ? { ...j, acknowledgedAt: new Date().toISOString() } : j)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>;
  }

  const active = items.filter((j) => !j.acknowledgedAt);
  if (active.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No blocked or failed jobs.</p>;
  }

  return (
    <div className="space-y-2">
      {active.map((j) => (
        <div key={j.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={j.status === 'BLOCKED' ? 'danger' : 'danger'} className="text-2xs">
                {j.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(j.finishedAt ?? j.scheduledAt)}</span>
            </div>
            {j.lastError ? (
              <p className="mt-1 line-clamp-2 text-xs text-danger-700">{j.lastError}</p>
            ) : null}
          </div>
          <Button size="sm" variant="outline" onClick={() => ack(j.id)} disabled={busy === j.id}>
            Ack
          </Button>
        </div>
      ))}
    </div>
  );
}

