'use client';

import { useMemo } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from './recharts-components';
import type { TooltipContentProps } from 'recharts';

type TimeSeriesPoint = {
  t: string;
  value: number;
};

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  granularity: 'DAILY' | 'WEEKLY';
}

type ChartDataPoint = {
  date: string;
  dateLabel: string;
  value: number;
};

function formatDate(isoDate: string, granularity: 'DAILY' | 'WEEKLY'): string {
  const date = new Date(isoDate);
  if (granularity === 'WEEKLY') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TimeSeriesChart({ data, granularity }: TimeSeriesChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return data.map((point) => ({
      date: point.t,
      dateLabel: formatDate(point.t, granularity),
      value: point.value,
    }));
  }, [data, granularity]);

  const yAxisBounds = useMemo(() => {
    const values = chartData.map((p) => p.value).filter((v) => Number.isFinite(v));
    if (values.length === 0) return { min: 0, max: 100 };

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const padding = (dataMax - dataMin) * 0.1;

    return {
      min: Math.floor(dataMin - padding),
      max: Math.ceil(dataMax + padding),
    };
  }, [chartData]);

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
    <div className="h-[300px] sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
          <defs>
            <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
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
                  <div className="mt-1.5">
                    <p className="text-xs" style={{ color: 'hsl(var(--chart-1))' }}>
                      Value: {point.value.toFixed(1)}
                    </p>
                  </div>
                </div>
              );
            }}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill="url(#valueGradient)"
            fillOpacity={1}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
