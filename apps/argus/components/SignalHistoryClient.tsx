'use client';

import { useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';

export type SignalHistoryItem = {
  id: string;
  startedAt: string;
  changeSummary: unknown;
  acknowledgedAt: string | null;
};

function summarize(summary: unknown): string {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return 'Change detected';
  const s = summary as any;
  const parts: string[] = [];
  if (s.titleChanged) parts.push('Title');
  if (s.priceBefore !== undefined && s.priceAfter !== undefined) parts.push('Price');
  if (s.imagesChanged) parts.push('Images');
  return parts.length > 0 ? parts.join(' + ') : 'Change detected';
}

export function SignalHistoryClient(props: { items: SignalHistoryItem[] }) {
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
        body: JSON.stringify({ kind: 'run', id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Ack failed (${res.status})`);
      }

      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, acknowledgedAt: new Date().toISOString() } : r)),
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

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No signal changes yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={r.acknowledgedAt ? 'neutral' : 'info'} className="text-2xs">
                {summarize(r.changeSummary)}
              </Badge>
              {r.acknowledgedAt ? (
                <Badge variant="outline" className="text-2xs">
                  Acked
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(r.startedAt)}</p>
          </div>
          {!r.acknowledgedAt ? (
            <Button size="sm" variant="outline" onClick={() => ack(r.id)} disabled={busy === r.id}>
              Ack
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

