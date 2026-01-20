'use client';

import { useEffect, useMemo } from 'react';
import { Check, Download } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SHEET_TOOLBAR_GROUP } from '@/components/sheet-toolbar';
import { usePersistentState } from '@/hooks/usePersistentState';

export type TrendGranularity = 'weekly' | 'monthly' | 'quarterly';
export type TrendSeries = Record<
  TrendGranularity,
  { labels: string[]; values: number[]; impactFlags?: boolean[] }
>;
export type TrendFormat = 'currency' | 'number' | 'percent';
export type TrendAccent = 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';

export interface FinancialMetricDefinition {
  key: string;
  title: string;
  description: string;
  helper?: string;
  series: TrendSeries;
  format: TrendFormat;
  accent: TrendAccent;
}

interface FinancialTrendsSectionProps {
  title: string;
  description: string;
  metrics: FinancialMetricDefinition[];
  defaultMetricKey?: string;
  storageKey?: string;
}

const accentColors: Record<TrendAccent, { stroke: string; fill: string }> = {
  sky: { stroke: 'hsl(var(--chart-1))', fill: 'hsl(var(--chart-1))' },
  emerald: { stroke: 'hsl(var(--chart-2))', fill: 'hsl(var(--chart-2))' },
  violet: { stroke: 'hsl(var(--chart-3))', fill: 'hsl(var(--chart-3))' },
  amber: { stroke: 'hsl(var(--chart-4))', fill: 'hsl(var(--chart-4))' },
  rose: { stroke: 'hsl(var(--chart-5))', fill: 'hsl(var(--chart-5))' },
};

const granularityOptions: Array<{ value: TrendGranularity; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

function negativeThresholdForFormat(format: TrendFormat): number {
  switch (format) {
    case 'currency':
    case 'number':
      return -0.5;
    case 'percent':
      return -0.0005;
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported format: ${String(exhaustive)}`);
    }
  }
}

export function FinancialTrendsSection({
  title,
  description,
  metrics,
  storageKey,
}: FinancialTrendsSectionProps) {
  const storagePrefix = storageKey ?? `xplan:financial-trends:${title}`;
  const [granularity, setGranularity, granularityHydrated] = usePersistentState<TrendGranularity>(
    `${storagePrefix}:granularity`,
    'weekly',
  );
  const [disabledMetrics, setDisabledMetrics, disabledHydrated] = usePersistentState<string[]>(
    `${storagePrefix}:disabled`,
    [],
  );
  const hydrated = granularityHydrated && disabledHydrated;

  const enabledMetrics = useMemo(() => {
    return metrics.filter((m) => !disabledMetrics.includes(m.key));
  }, [metrics, disabledMetrics]);

  const toggleMetric = (key: string) => {
    setDisabledMetrics((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (enabledMetrics.length <= 1) return prev;
      return [...prev, key];
    });
  };

  const granularityAvailability = useMemo(() => {
    return metrics.reduce(
      (availability, metric) => {
        if (metric.series.weekly.values.some((value) => Number.isFinite(value))) {
          availability.weekly = true;
        }
        if (metric.series.monthly.values.some((value) => Number.isFinite(value))) {
          availability.monthly = true;
        }
        if (metric.series.quarterly.values.some((value) => Number.isFinite(value))) {
          availability.quarterly = true;
        }
        return availability;
      },
      { weekly: false, monthly: false, quarterly: false },
    );
  }, [metrics]);

  useEffect(() => {
    if (!hydrated) return;
    if (!granularityAvailability[granularity]) {
      const fallback: TrendGranularity | null = granularityAvailability.weekly
        ? 'weekly'
        : granularityAvailability.monthly
          ? 'monthly'
          : granularityAvailability.quarterly
            ? 'quarterly'
            : null;
      if (fallback && granularity !== fallback) {
        setGranularity(fallback);
      }
    }
  }, [granularity, granularityAvailability, hydrated, setGranularity]);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const labels = enabledMetrics[0]?.series[granularity].labels ?? [];
    return labels.map((label, index) => {
      const dataPoint: Record<string, string | number> = { label: getShortLabel(label) };
      enabledMetrics.forEach((metric) => {
        dataPoint[metric.key] = metric.series[granularity].values[index] ?? 0;
      });
      return dataPoint;
    });
  }, [enabledMetrics, granularity]);

  // Calculate Y-axis bounds and zero offset for split gradients
  const yAxisBounds = useMemo(() => {
    const allValues = enabledMetrics.flatMap((metric) =>
      metric.series[granularity].values.filter(Number.isFinite),
    );
    if (allValues.length === 0) return { min: 0, max: 0, zeroOffset: 0.5, hasNegative: false };

    const hasNegative = enabledMetrics.some((metric) => {
      const threshold = negativeThresholdForFormat(metric.format);
      return metric.series[granularity].values.some(
        (value) => Number.isFinite(value) && value < threshold,
      );
    });

    let min = Math.min(...allValues);
    const max = Math.max(...allValues);
    if (!hasNegative && min < 0) {
      min = 0;
    }
    const range = max - min;
    // zeroOffset is where 0 falls as a percentage from top (max) to bottom (min)
    const zeroOffset = range > 0 ? max / range : 0.5;
    return { min, max, zeroOffset: Math.max(0, Math.min(1, zeroOffset)), hasNegative };
  }, [enabledMetrics, granularity]);

  const formatValue = (value: number, format: TrendFormat) => {
    if (!Number.isFinite(value)) return '—';
    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatAxisValue = (value: number) => {
    const format = enabledMetrics[0]?.format ?? 'currency';
    if (format === 'currency') {
      if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    }
    if (format === 'percent') return `${(value * 100).toFixed(0)}%`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toFixed(0);
  };

  if (!metrics.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={SHEET_TOOLBAR_GROUP}>
          <span className="text-xs font-medium text-muted-foreground">Cadence</span>
          {granularityOptions.map((option) => {
            const isActive = option.value === granularity;
            const isAvailable = granularityAvailability[option.value];
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => isAvailable && setGranularity(option.value)}
                disabled={!isAvailable}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isAvailable
                      ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      : 'cursor-not-allowed text-muted-foreground/50'
                }`}
              >
                {isActive && <Check className="h-3 w-3" />}
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => exportChart(title, granularity)}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      {/* Chart Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          {/* Chart */}
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                <defs>
                  {enabledMetrics.map((metric) => {
                    const hasNegative = yAxisBounds.hasNegative;
                    const threshold = negativeThresholdForFormat(metric.format);
                    const metricHasNegative = metric.series[granularity].values.some(
                      (value) => Number.isFinite(value) && value < threshold,
                    );
                    const zeroPoint = yAxisBounds.zeroOffset;
                    return (
                      <linearGradient
                        key={metric.key}
                        id={`gradient-${metric.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        {hasNegative && metricHasNegative ? (
                          <>
                            <stop
                              offset="0%"
                              stopColor={accentColors[metric.accent].fill}
                              stopOpacity={0.3}
                            />
                            <stop
                              offset={`${zeroPoint * 100}%`}
                              stopColor={accentColors[metric.accent].fill}
                              stopOpacity={0.05}
                            />
                            <stop
                              offset={`${zeroPoint * 100}%`}
                              stopColor="#dc2626"
                              stopOpacity={0.2}
                            />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.7} />
                          </>
                        ) : (
                          <>
                            <stop
                              offset="5%"
                              stopColor={accentColors[metric.accent].fill}
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor={accentColors[metric.accent].fill}
                              stopOpacity={0}
                            />
                          </>
                        )}
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  className="dark:stroke-slate-700"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  interval={granularity === 'weekly' ? 3 : 0}
                  label={{
                    value:
                      granularity === 'weekly'
                        ? 'Week'
                        : granularity === 'monthly'
                          ? 'Month'
                          : 'Quarter',
                    position: 'bottom',
                    offset: 10,
                    fontSize: 12,
                    fill: 'hsl(var(--muted-foreground))',
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatAxisValue}
                  width={60}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload) return null;
                    const prefix =
                      granularity === 'weekly'
                        ? 'Week'
                        : granularity === 'monthly'
                          ? 'Month'
                          : 'Quarter';
                    const displayLabel = label === '0' ? 'Opening' : `${prefix} ${label}`;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-md">
                        <p className="mb-1 text-xs font-medium">{displayLabel}</p>
                        {payload.map((entry) => (
                          <p key={entry.dataKey} className="text-xs" style={{ color: entry.color }}>
                            {metrics.find((m) => m.key === entry.dataKey)?.title}:{' '}
                            {formatValue(
                              entry.value as number,
                              metrics.find((m) => m.key === entry.dataKey)?.format ?? 'currency',
                            )}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {yAxisBounds.hasNegative && (
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                )}
                {enabledMetrics.map((metric) => (
                  <Area
                    key={metric.key}
                    type="monotone"
                    dataKey={metric.key}
                    stroke={accentColors[metric.accent].stroke}
                    fill={`url(#gradient-${metric.key})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 border-t border-slate-200/60 pt-4 dark:border-slate-700/50">
            {metrics.map((metric) => {
              const isEnabled = enabledMetrics.some((m) => m.key === metric.key);
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => toggleMetric(metric.key)}
                  className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200 ${
                    isEnabled
                      ? 'bg-slate-100/80 dark:bg-slate-800/50'
                      : 'opacity-50 hover:opacity-75'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`h-3 w-3 rounded-full transition-transform duration-200 ${
                        isEnabled ? 'scale-100' : 'scale-75'
                      }`}
                      style={{ backgroundColor: accentColors[metric.accent].stroke }}
                    />
                    {isEnabled && (
                      <div
                        className="absolute inset-0 animate-pulse rounded-full opacity-40 blur-sm"
                        style={{ backgroundColor: accentColors[metric.accent].stroke }}
                      />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium transition-colors duration-200 ${
                      isEnabled
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {metric.title}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getShortLabel(label: string) {
  const parts = label.split(' · ');
  const shortLabel = parts[0] || label;
  // Strip "W" prefix from week labels (e.g., "W1" -> "1")
  if (/^W\d+$/.test(shortLabel)) {
    return shortLabel.slice(1);
  }
  // Strip "Opening" prefix for cash flow
  if (shortLabel.startsWith('Opening ')) {
    return '0';
  }
  return shortLabel;
}

function exportChart(title: string, granularity: string) {
  const chartElement = document.querySelector('.recharts-wrapper svg') as SVGElement;
  if (!chartElement) return;
  const data = new XMLSerializer().serializeToString(chartElement);
  const blob = new Blob([data], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${granularity}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
