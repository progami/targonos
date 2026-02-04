'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  homeCurrency?: string;
};

type AnalyticsMonth = {
  month: string;
  settlements: number;
  salesCents: number;
  refundsCents: number;
  sellerFeesCents: number;
  fbaFeesCents: number;
  storageFeesCents: number;
};

type AnalyticsResponse = {
  channel: { id: string; label: string; region: string; docNumberContains: string };
  range: { startMonth: string; endMonth: string; startDate: string; endDate: string };
  months: AnalyticsMonth[];
  settlementsInPeriod: number;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAnalytics(input: { month: string; channel: string }): Promise<AnalyticsResponse> {
  const params = new URLSearchParams();
  params.set('month', input.month);
  params.set('channel', input.channel);

  const res = await fetch(`${basePath}/api/plutus/analytics?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v2M16 3v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 7h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z"
      />
    </svg>
  );
}

function formatMoneyFromCents(cents: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(cents) / 100);

  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatSignedPercent(value: number, digits: number = 1): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function ratioPercent(numeratorCents: number, denominatorCents: number): number | null {
  if (denominatorCents <= 0) return null;
  return (numeratorCents / denominatorCents) * 100;
}

function growthPercent(currentCents: number, previousCents: number): number | null {
  if (previousCents <= 0) return null;
  return ((currentCents - previousCents) / previousCents) * 100;
}

function clampPercent(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function buildBellCurvePath({ width, height, points = 64 }: { width: number; height: number; points?: number }): string {
  const sigma = 0.22;
  const mu = 0.5;

  const coords: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= points; i += 1) {
    const t = i / points;
    const exponent = -((t - mu) ** 2) / (2 * sigma * sigma);
    const y = Math.exp(exponent);
    coords.push({ x: t * width, y: y * height });
  }

  const maxY = Math.max(...coords.map((c) => c.y));
  const scale = maxY === 0 ? 1 : (height * 0.85) / maxY;
  const scaled = coords.map((c) => ({ x: c.x, y: height - c.y * scale }));

  let d = `M ${scaled[0]?.x ?? 0} ${scaled[0]?.y ?? height}`;
  for (let i = 1; i < scaled.length; i += 1) {
    const c = scaled[i];
    if (!c) continue;
    d += ` L ${c.x} ${c.y}`;
  }
  return d;
}

function BellCurve({
  valuePercent,
  highlightFromPercent,
  highlightToPercent,
  highlightClassName,
}: {
  valuePercent: number;
  highlightFromPercent: number;
  highlightToPercent: number;
  highlightClassName: string;
}) {
  const width = 360;
  const height = 160;
  const d = useMemo(() => buildBellCurvePath({ width, height }), []);

  const value = clampPercent(valuePercent);
  const from = clampPercent(Math.min(highlightFromPercent, highlightToPercent));
  const to = clampPercent(Math.max(highlightFromPercent, highlightToPercent));

  const baselineY = height;
  const xFrom = (from / 100) * width;
  const xTo = (to / 100) * width;

  const areaPoints: Array<{ x: number; y: number }> = [];
  const samples = 48;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = xFrom + (xTo - xFrom) * t;
    const pct = x / width;
    const sigma = 0.22;
    const mu = 0.5;
    const exponent = -((pct - mu) ** 2) / (2 * sigma * sigma);
    const rawY = Math.exp(exponent) * height;
    areaPoints.push({ x, y: height - rawY * 0.85 });
  }

  const areaD = [
    `M ${xFrom} ${baselineY}`,
    `L ${areaPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`,
    `L ${xTo} ${baselineY}`,
    'Z',
  ].join(' ');

  const xMedian = width / 2;
  const xValue = (value / 100) * width;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[160px]">
      <path d={d} className="fill-transparent stroke-slate-300 dark:stroke-white/15" strokeWidth="2" />
      <path d={areaD} className={cn('opacity-90', highlightClassName)} />

      <line x1={xMedian} y1={18} x2={xMedian} y2={height} className="stroke-slate-300 dark:stroke-white/15" strokeWidth="2" />

      <line
        x1={xValue}
        y1={8}
        x2={xValue}
        y2={height}
        className="stroke-slate-400 dark:stroke-white/25"
        strokeWidth="2"
        strokeDasharray="3 6"
      />
    </svg>
  );
}

function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  let leq = 0;
  for (const v of sorted) {
    if (v <= value) leq += 1;
  }
  return (leq / sorted.length) * 100;
}

function quartileBand(pct: number): { from: number; to: number; label: string; className: string } {
  if (pct < 25) return { from: 0, to: 25, label: '0–25th percentile', className: 'fill-amber-500/55 dark:fill-amber-400/35' };
  if (pct < 50) return { from: 25, to: 50, label: '25–50th percentile', className: 'fill-sky-500/50 dark:fill-sky-400/30' };
  if (pct < 75) return { from: 50, to: 75, label: '50–75th percentile', className: 'fill-teal-500/45 dark:fill-teal-400/30' };
  return { from: 75, to: 100, label: '75–100th percentile', className: 'fill-emerald-500/45 dark:fill-emerald-400/30' };
}

function MetricCard({
  title,
  value,
  detail,
  percentile,
}: {
  title: string;
  value: string;
  detail: string;
  percentile: number | null;
}) {
  const band = percentile === null ? quartileBand(50) : quartileBand(percentile);
  const position = percentile === null ? 50 : percentile;

  return (
    <Card className="border-slate-200/70 dark:border-white/10">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
          </div>
          <div className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
            12m
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {percentile === null ? '—' : `${Math.round(percentile)}th percentile`}
          </div>
        </div>

        <div className="mt-3">
          <BellCurve
            valuePercent={position}
            highlightFromPercent={band.from}
            highlightToPercent={band.to}
            highlightClassName={band.className}
          />
        </div>

        <div className="mt-1 flex items-center justify-between text-2xs font-semibold text-slate-400 dark:text-slate-500">
          <span>0</span>
          <span>MEDIAN</span>
          <span>100</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [channel, setChannel] = useState('targon-us');

  const analyticsQuery = useQuery({
    queryKey: ['plutus-analytics', month, channel],
    queryFn: () => fetchAnalytics({ month, channel }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 15 * 1000,
  });

  const data = analyticsQuery.data;
  const currency = connection?.homeCurrency ? connection.homeCurrency : 'USD';

  const monthIndex = useMemo(() => {
    if (!data) return new Map<string, AnalyticsMonth>();
    const map = new Map<string, AnalyticsMonth>();
    for (const row of data.months) {
      map.set(row.month, row);
    }
    return map;
  }, [data]);

  const current = data ? monthIndex.get(data.range.endMonth) : undefined;
  const previous = data ? monthIndex.get(data.months.at(-2)?.month ?? '') : undefined;

  const salesGrowth = current && previous ? growthPercent(current.salesCents, previous.salesCents) : null;
  const feeRatio =
    current ? ratioPercent(current.sellerFeesCents + current.fbaFeesCents, current.salesCents) : null;
  const refundRatio = current ? ratioPercent(current.refundsCents, current.salesCents) : null;
  const storageRatio = current ? ratioPercent(current.storageFeesCents, current.salesCents) : null;

  const growthSeries = useMemo(() => {
    if (!data) return [];
    const values: number[] = [];
    for (let i = 1; i < data.months.length; i += 1) {
      const prev = data.months[i - 1];
      const next = data.months[i];
      if (!prev || !next) continue;
      const value = growthPercent(next.salesCents, prev.salesCents);
      if (value === null) continue;
      values.push(value);
    }
    return values;
  }, [data]);

  const feeRatioSeries = useMemo(() => {
    if (!data) return [];
    const values: number[] = [];
    for (const row of data.months) {
      const value = ratioPercent(row.sellerFeesCents + row.fbaFeesCents, row.salesCents);
      if (value === null) continue;
      values.push(value);
    }
    return values;
  }, [data]);

  const refundRatioSeries = useMemo(() => {
    if (!data) return [];
    const values: number[] = [];
    for (const row of data.months) {
      const value = ratioPercent(row.refundsCents, row.salesCents);
      if (value === null) continue;
      values.push(value);
    }
    return values;
  }, [data]);

  const storageRatioSeries = useMemo(() => {
    if (!data) return [];
    const values: number[] = [];
    for (const row of data.months) {
      const value = ratioPercent(row.storageFeesCents, row.salesCents);
      if (value === null) continue;
      values.push(value);
    }
    return values;
  }, [data]);

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Analytics" />;
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Industry Benchmarking" variant="accent" />

        <div className="mt-6 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Date</div>
              <div className="mt-1">
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[220px]" />
              </div>
            </div>

            <div className="sm:justify-self-end">
              <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sales channels</div>
              <div className="mt-1">
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select channel…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="targon-us">Targon US</SelectItem>
                    <SelectItem value="targon-uk">Targon UK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {analyticsQuery.error && (
            <Card className="border-slate-200/70 dark:border-white/10">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">Analytics unavailable</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {analyticsQuery.error instanceof Error ? analyticsQuery.error.message : String(analyticsQuery.error)}
                    </div>
                  </div>
                  <Button asChild variant="outline">
                    <Link href="/setup">Setup Wizard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Cohort Benchmarking</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {data ? `${data.channel.label} • Settlements: ${data.settlementsInPeriod}` : 'Loading…'}
                  </div>
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {data ? `Period: ${data.range.startDate} → ${data.range.endDate}` : ' '}
                  </div>
                </div>
                <div className="text-slate-400 dark:text-slate-500">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <MetricCard
              title="Sales growth"
              value={salesGrowth === null ? '—' : formatSignedPercent(salesGrowth)}
              detail={
                current
                  ? `Sales: ${formatMoneyFromCents(current.salesCents, currency)}`
                  : ' '
              }
              percentile={salesGrowth === null ? null : percentileRank(growthSeries, salesGrowth)}
            />
            <MetricCard
              title="Fee ratio"
              value={feeRatio === null ? '—' : `${feeRatio.toFixed(2)}%`}
              detail={
                current
                  ? `Fees: ${formatMoneyFromCents(current.sellerFeesCents + current.fbaFeesCents, currency)}`
                  : ' '
              }
              percentile={feeRatio === null ? null : percentileRank(feeRatioSeries, feeRatio)}
            />
            <MetricCard
              title="Refund ratio"
              value={refundRatio === null ? '—' : `${refundRatio.toFixed(2)}%`}
              detail={current ? `Refunds: ${formatMoneyFromCents(current.refundsCents, currency)}` : ' '}
              percentile={refundRatio === null ? null : percentileRank(refundRatioSeries, refundRatio)}
            />
            <MetricCard
              title="Total storage fees ratio"
              value={storageRatio === null ? '—' : `${storageRatio.toFixed(2)}%`}
              detail={current ? `Storage: ${formatMoneyFromCents(current.storageFeesCents, currency)}` : ' '}
              percentile={storageRatio === null ? null : percentileRank(storageRatioSeries, storageRatio)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
