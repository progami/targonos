'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from './recharts-components';
import type { TooltipContentProps } from 'recharts';
import { cn } from '@/lib/utils';

type ForecastPointRow = {
  t: string;
  actual: number | null;
  yhat: number | null;
  yhatLower: number | null;
  yhatUpper: number | null;
  isFuture: boolean | null;
};

interface ForecastChartProps {
  data: ForecastPointRow[];
  granularity: 'DAILY' | 'WEEKLY';
  intervalLevel?: number;
}

type ChartDataPoint = {
  date: string;
  dateLabel: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  confidenceRange: [number, number] | null;
  isFuture: boolean;
};

function formatDate(isoDate: string, granularity: 'DAILY' | 'WEEKLY'): string {
  const date = new Date(isoDate);
  if (granularity === 'WEEKLY') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ForecastChart({ data, granularity, intervalLevel = 0.8 }: ForecastChartProps) {
  const [showActual, setShowActual] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);

  // Transform data for chart
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return data.map((point) => ({
      date: point.t,
      dateLabel: formatDate(point.t, granularity),
      actual: point.actual,
      forecast: point.yhat,
      lower: point.yhatLower,
      upper: point.yhatUpper,
      confidenceRange:
        point.yhatLower != null && point.yhatUpper != null
          ? [point.yhatLower, point.yhatUpper]
          : null,
      isFuture: point.isFuture === true,
    }));
  }, [data, granularity]);

  // Find the index where history ends and future begins
  const historyEndIndex = useMemo(() => {
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].isFuture) {
        return i > 0 ? i - 1 : 0;
      }
    }
    return chartData.length - 1;
  }, [chartData]);

  const historyEndDate = chartData[historyEndIndex]?.dateLabel;

  // Calculate Y-axis bounds
  const yAxisBounds = useMemo(() => {
    const allValues = chartData.flatMap((p) => [
      p.actual,
      p.forecast,
      p.lower,
      p.upper,
    ]).filter((v): v is number => v != null && Number.isFinite(v));

    if (allValues.length === 0) return { min: 0, max: 100 };

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const padding = (dataMax - dataMin) * 0.1;

    return {
      min: Math.floor(dataMin - padding),
      max: Math.ceil(dataMax + padding),
    };
  }, [chartData]);

  // Calculate tick interval based on data size
  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 10) return 0;
    if (len <= 30) return 2;
    if (len <= 60) return 4;
    return Math.floor(len / 10);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No data available for chart
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="h-[300px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
            <defs>
              {/* Actual gradient (green) */}
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
              </linearGradient>
              {/* Forecast gradient (teal) */}
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
              </linearGradient>
              {/* Confidence interval gradient */}
              <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              className="dark:stroke-slate-700"
            />

            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              interval={tickInterval}
              label={{
                value: granularity === 'WEEKLY' ? 'Week' : 'Date',
                position: 'bottom',
                offset: 10,
                fontSize: 12,
                fill: 'hsl(var(--muted-foreground))',
              }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value: number) =>
                Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString()
              }
              width={50}
              domain={[yAxisBounds.min, yAxisBounds.max]}
            />

            <Tooltip
              content={({ active, payload }: TooltipContentProps<number, string>) => {
                if (!active || !payload?.[0]) return null;
                const point = payload[0].payload as ChartDataPoint;
                return (
                  <div className="rounded-lg border bg-background p-2.5 shadow-md">
                    <p className="text-xs font-medium text-foreground">
                      {new Date(point.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {point.actual != null && (
                        <p className="text-xs" style={{ color: 'hsl(var(--chart-2))' }}>
                          Actual: {point.actual.toFixed(1)}
                        </p>
                      )}
                      {point.forecast != null && (
                        <p className="text-xs" style={{ color: 'hsl(var(--chart-1))' }}>
                          Forecast: {point.forecast.toFixed(1)}
                        </p>
                      )}
                      {point.lower != null && point.upper != null && (
                        <p className="text-xs text-muted-foreground">
                          {(intervalLevel * 100).toFixed(0)}% CI: [{point.lower.toFixed(1)},{' '}
                          {point.upper.toFixed(1)}]
                        </p>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1.5 text-[10px] font-medium uppercase tracking-wide',
                        point.isFuture
                          ? 'text-brand-teal-600 dark:text-brand-cyan'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {point.isFuture ? 'Future' : 'History'}
                    </p>
                  </div>
                );
              }}
            />

            {/* Reference line at history/future boundary */}
            {historyEndDate && (
              <ReferenceLine
                x={historyEndDate}
                stroke="hsl(var(--chart-1))"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: 'Forecast',
                  position: 'top',
                  fontSize: 10,
                  fill: 'hsl(var(--chart-1))',
                }}
              />
            )}

            {/* Confidence interval (shaded area between lower and upper) */}
            {showConfidence && (
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="url(#confidenceGradient)"
                fillOpacity={1}
              />
            )}
            {showConfidence && (
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="white"
                fillOpacity={1}
                className="dark:fill-[#041324]"
              />
            )}

            {/* Actual values line */}
            {showActual && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Forecast line */}
            {showForecast && (
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend with toggles */}
      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-slate-200/60 pt-4 dark:border-slate-700/50 sm:gap-6">
        <button
          type="button"
          onClick={() => setShowActual(!showActual)}
          className={cn(
            'group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200',
            showActual ? 'bg-slate-100/80 dark:bg-slate-800/50' : 'opacity-50 hover:opacity-75',
          )}
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 rounded-full transition-transform duration-200',
                showActual ? 'scale-100' : 'scale-75',
              )}
              style={{ backgroundColor: 'hsl(var(--chart-2))' }}
            />
            {showActual && (
              <div
                className="absolute inset-0 animate-pulse rounded-full opacity-40 blur-sm"
                style={{ backgroundColor: 'hsl(var(--chart-2))' }}
              />
            )}
          </div>
          <span
            className={cn(
              'text-xs font-medium transition-colors duration-200',
              showActual
                ? 'text-slate-700 dark:text-slate-200'
                : 'text-slate-400 dark:text-slate-500',
            )}
          >
            Actual
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowForecast(!showForecast)}
          className={cn(
            'group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200',
            showForecast ? 'bg-slate-100/80 dark:bg-slate-800/50' : 'opacity-50 hover:opacity-75',
          )}
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 rounded-full transition-transform duration-200',
                showForecast ? 'scale-100' : 'scale-75',
              )}
              style={{ backgroundColor: 'hsl(var(--chart-1))' }}
            />
            {showForecast && (
              <div
                className="absolute inset-0 animate-pulse rounded-full opacity-40 blur-sm"
                style={{ backgroundColor: 'hsl(var(--chart-1))' }}
              />
            )}
          </div>
          <span
            className={cn(
              'text-xs font-medium transition-colors duration-200',
              showForecast
                ? 'text-slate-700 dark:text-slate-200'
                : 'text-slate-400 dark:text-slate-500',
            )}
          >
            Forecast
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowConfidence(!showConfidence)}
          className={cn(
            'group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-200',
            showConfidence ? 'bg-slate-100/80 dark:bg-slate-800/50' : 'opacity-50 hover:opacity-75',
          )}
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-6 rounded transition-transform duration-200',
                showConfidence ? 'scale-100' : 'scale-75',
              )}
              style={{
                background: 'linear-gradient(to bottom, hsl(var(--chart-1) / 0.3), hsl(var(--chart-1) / 0.1))',
                border: '1px solid hsl(var(--chart-1) / 0.5)',
              }}
            />
          </div>
          <span
            className={cn(
              'text-xs font-medium transition-colors duration-200',
              showConfidence
                ? 'text-slate-700 dark:text-slate-200'
                : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {(intervalLevel * 100).toFixed(0)}% CI
          </span>
        </button>
      </div>
    </div>
  );
}
