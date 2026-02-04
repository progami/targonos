'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
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

function clampPercent(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
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

function BenchmarkCard({
  title,
  subtitle,
  note,
  value,
  highlight,
}: {
  title: string;
  subtitle: string;
  note: { label: string; emphasis: string; emphasisClassName: string };
  value: { percent: number; label: string };
  highlight: { from: number; to: number; className: string };
}) {
  return (
    <Card className="border-slate-200/70 dark:border-white/10">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
          </div>
          <div className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
            Improve
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold">{note.label}</span>{' '}
          <span className={cn('font-semibold', note.emphasisClassName)}>{note.emphasis}</span>
        </div>

        <div className="mt-2">
          <BellCurve
            valuePercent={value.percent}
            highlightFromPercent={highlight.from}
            highlightToPercent={highlight.to}
            highlightClassName={highlight.className}
          />
        </div>

        <div className="mt-1 flex items-center justify-between text-2xs font-semibold text-slate-400 dark:text-slate-500">
          <span>{value.label}</span>
          <span>MEDIAN</span>
          <span>{Math.max(0, 100 - value.percent).toFixed(0)}%</span>
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

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Cohort Benchmarking</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Amazon North America • Order count: 1K–5K • Latest data available: Dec 2025
                  </div>
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Learn more about how benchmarking works in our help article.
                  </div>
                </div>
                <div className="text-slate-400 dark:text-slate-500">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <BenchmarkCard
              title="Sales growth"
              subtitle="vs cohort benchmark"
              note={{ label: '0%', emphasis: 'falls in the lower 50%', emphasisClassName: 'text-amber-600 dark:text-amber-400' }}
              value={{ percent: 8, label: '0%' }}
              highlight={{ from: 8, to: 35, className: 'fill-amber-500/60 dark:fill-amber-400/45' }}
            />
            <BenchmarkCard
              title="Fee ratio"
              subtitle="fees / sales"
              note={{ label: '37.7%', emphasis: 'falls in the bottom 25%', emphasisClassName: 'text-amber-600 dark:text-amber-400' }}
              value={{ percent: 92, label: '37.7%' }}
              highlight={{ from: 80, to: 100, className: 'fill-amber-500/60 dark:fill-amber-400/45' }}
            />
            <BenchmarkCard
              title="Refund ratio"
              subtitle="refunds / sales"
              note={{ label: '0%', emphasis: 'falls in the top 25%', emphasisClassName: 'text-sky-600 dark:text-sky-400' }}
              value={{ percent: 14, label: '0%' }}
              highlight={{ from: 0, to: 24, className: 'fill-sky-500/55 dark:fill-sky-400/40' }}
            />
            <BenchmarkCard
              title="Refund ratio growth trend"
              subtitle="trend score"
              note={{ label: '0%', emphasis: 'falls in the lower 50%', emphasisClassName: 'text-amber-600 dark:text-amber-400' }}
              value={{ percent: 78, label: '0%' }}
              highlight={{ from: 70, to: 100, className: 'fill-amber-500/60 dark:fill-amber-400/45' }}
            />
            <BenchmarkCard
              title="Long term vs. short term storage fee ratio"
              subtitle="storage mix"
              note={{ label: '0%', emphasis: 'falls in the top 25%', emphasisClassName: 'text-sky-600 dark:text-sky-400' }}
              value={{ percent: 32, label: '0%' }}
              highlight={{ from: 0, to: 40, className: 'fill-sky-500/55 dark:fill-sky-400/40' }}
            />
            <BenchmarkCard
              title="Long term storage fees ratio"
              subtitle="long term storage"
              note={{ label: '0%', emphasis: 'falls in the top 25%', emphasisClassName: 'text-sky-600 dark:text-sky-400' }}
              value={{ percent: 28, label: '0%' }}
              highlight={{ from: 0, to: 35, className: 'fill-sky-500/55 dark:fill-sky-400/40' }}
            />
            <div className="lg:col-span-2">
              <BenchmarkCard
                title="Total storage fees ratio"
                subtitle="storage / sales"
                note={{ label: '0%', emphasis: 'falls in the top 25%', emphasisClassName: 'text-sky-600 dark:text-sky-400' }}
                value={{ percent: 34, label: '0%' }}
                highlight={{ from: 0, to: 40, className: 'fill-sky-500/55 dark:fill-sky-400/40' }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
