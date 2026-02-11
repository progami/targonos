'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import type { AttentionResponse } from '@/lib/attention/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

type AckKind = 'job' | 'run' | 'alert';

function summarizeSignalChange(summary: unknown): string {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return 'Change detected';
  const s = summary as any;
  const parts: string[] = [];
  if (s.titleChanged) parts.push('Title');
  if (s.priceBefore !== undefined && s.priceAfter !== undefined) parts.push('Price');
  if (s.imagesChanged) parts.push('Images');
  return parts.length > 0 ? parts.join(' + ') : 'Change detected';
}

function Row(props: {
  severity: 'danger' | 'warning' | 'info';
  title: string;
  meta: string;
  time: string;
  primaryHref: string;
  primaryLabel: string;
  ack?: { kind: AckKind; id: string };
  onAck?: (kind: AckKind, id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-md px-3 py-2.5 transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        props.dimmed ? 'opacity-40' : 'hover:bg-muted/40',
      ].join(' ')}
    >
      <Badge variant={props.severity} className="text-2xs shrink-0">
        {props.severity === 'danger' ? 'Danger' : props.severity === 'warning' ? 'Warning' : 'Info'}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{props.title}</p>
          <span className="shrink-0 text-2xs text-muted-foreground">{formatRelativeTime(props.time)}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{props.meta}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={props.primaryHref}>{props.primaryLabel}</Link>
        </Button>
        {props.ack && props.onAck ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => props.onAck!(props.ack!.kind, props.ack!.id)}
            className="transition-colors duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          >
            Ack
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function AttentionClient() {
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<Set<string>>(() => new Set());

  async function load() {
    setError(null);
    const res = await fetch(withAppBasePath('/api/attention'), { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const json = (await res.json()) as AttentionResponse;
    setData(json);
  }

  useEffect(() => {
    let cancelled = false;
    load().catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ack(kind: AckKind, id: string) {
    const key = `${kind}:${id}`;
    setAcking((prev) => new Set(prev).add(key));

    try {
      const res = await fetch(withAppBasePath('/api/attention/ack'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Ack failed (${res.status})`);
      }

      // Optimistic UI removal after the 200ms motion standard.
      window.setTimeout(() => {
        setData((prev) => {
          if (!prev) return prev;
          if (kind === 'job') {
            return {
              ...prev,
              blockedJobs: prev.blockedJobs.filter((j) => j.id !== id),
              failedJobs: prev.failedJobs.filter((j) => j.id !== id),
            };
          }
          if (kind === 'run') {
            return { ...prev, signalChanges: prev.signalChanges.filter((r) => r.id !== id) };
          }
          return { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) };
        });
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAcking((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const counts = useMemo(() => {
    if (!data) return null;
    const monitoringIssues = data.blockedJobs.length + data.failedJobs.length;
    const alerts = data.alerts.length;
    const changes = data.signalChanges.length;
    const assets = data.assetsNoActiveSet.length + data.assetsComplianceErrors.length;
    return { monitoringIssues, alerts, changes, assets };
  }, [data]);

  if (error) {
    return <div className="text-sm text-danger-600">{error}</div>;
  }
  if (!data || !counts) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading attention queue...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Monitoring issues</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.monitoringIssues}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Alerts</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.alerts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Meaningful changes</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.changes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Assets needing work</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.assets}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Monitoring Issues</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.blockedJobs.length === 0 && data.failedJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No blocked or failed jobs.</p>
          ) : (
            <div className="space-y-1">
              {data.blockedJobs.map((j) => {
                const key = `job:${j.id}`;
                return (
                  <Row
                    key={j.id}
                    severity="danger"
                    title={`${j.target.label}`}
                    meta={`Blocked job · ${j.target.marketplace} · ${j.target.owner}`}
                    time={j.scheduledAt}
                    primaryHref={`/monitoring/${j.target.id}`}
                    primaryLabel="Open Monitoring"
                    ack={{ kind: 'job', id: j.id }}
                    onAck={ack}
                    dimmed={acking.has(key)}
                  />
                );
              })}
              {data.failedJobs.map((j) => {
                const key = `job:${j.id}`;
                return (
                  <Row
                    key={j.id}
                    severity="danger"
                    title={`${j.target.label}`}
                    meta={`Failed job · ${j.target.marketplace} · ${j.target.owner}${j.lastError ? ` · ${j.lastError}` : ''}`}
                    time={j.finishedAt ?? j.scheduledAt}
                    primaryHref={`/monitoring/${j.target.id}`}
                    primaryLabel="Open Monitoring"
                    ack={{ kind: 'job', id: j.id }}
                    onAck={ack}
                    dimmed={acking.has(key)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Alerts</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No unacknowledged alerts.</p>
          ) : (
            <div className="space-y-1">
              {data.alerts.map((a) => {
                const key = `alert:${a.id}`;
                return (
                  <Row
                    key={a.id}
                    severity="warning"
                    title={a.subject}
                    meta={`${a.target.label} · ${a.target.marketplace} · ${a.target.owner}`}
                    time={a.sentAt}
                    primaryHref={`/monitoring/${a.target.id}`}
                    primaryLabel="Open Monitoring"
                    ack={{ kind: 'alert', id: a.id }}
                    onAck={ack}
                    dimmed={acking.has(key)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Meaningful Changes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.signalChanges.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No unacknowledged signal changes.</p>
          ) : (
            <div className="space-y-1">
              {data.signalChanges.map((r) => {
                const key = `run:${r.id}`;
                return (
                  <Row
                    key={r.id}
                    severity="info"
                    title={r.target.label}
                    meta={`${summarizeSignalChange(r.changeSummary)} · ${r.target.marketplace} · ${r.target.owner}`}
                    time={r.startedAt}
                    primaryHref={`/monitoring/${r.target.id}`}
                    primaryLabel="Open Monitoring"
                    ack={{ kind: 'run', id: r.id }}
                    onAck={ack}
                    dimmed={acking.has(key)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Assets Needing Work</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.assetsNoActiveSet.length === 0 && data.assetsComplianceErrors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No assets requiring attention.</p>
          ) : (
            <div className="space-y-1">
              {data.assetsNoActiveSet.map((i) => (
                <Row
                  key={`no-active:${i.target.id}`}
                  severity="danger"
                  title={i.target.label}
                  meta={`No active image set · ${i.target.marketplace}`}
                  time={i.updatedAt}
                  primaryHref={`/images/${i.target.id}`}
                  primaryLabel="Open Images"
                />
              ))}
              {data.assetsComplianceErrors.map((i) => (
                <Row
                  key={`compliance:${i.target.id}`}
                  severity="danger"
                  title={i.target.label}
                  meta={`Compliance errors · ${i.target.marketplace} · ${i.setErrors.length} set error(s) · ${i.slotErrorsCount} slot error(s)`}
                  time={i.updatedAt}
                  primaryHref={`/images/${i.target.id}`}
                  primaryLabel="Open Images"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
