'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { clsx } from 'clsx';
import type { PurchaseTimelineProps } from '@/lib/planning/timeline';
import { PurchaseTimelineOrder, TimelineStageKey } from '@/lib/planning/timeline';
import { Tooltip } from '@/components/ui/tooltip';

const stagePalette: Record<
  TimelineStageKey,
  { label: string; description: string; lightColor: string; darkColor: string }
> = {
  source: {
    label: 'Source',
    description: 'Sourcing & procurement',
    lightColor: '#22d3ee', // cyan-400
    darkColor: '#0891b2', // cyan-600
  },
  production: {
    label: 'Production',
    description: 'Manufacturing',
    lightColor: '#06b6d4', // cyan-500
    darkColor: '#06b6d4', // cyan-500
  },
  ocean: {
    label: 'Ocean',
    description: 'Ocean freight',
    lightColor: '#0891b2', // cyan-600
    darkColor: '#14b8a6', // teal-500
  },
  final: {
    label: 'Final',
    description: 'Final mile',
    lightColor: '#0e7490', // cyan-700
    darkColor: '#2dd4bf', // teal-400
  },
};

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

const WEEK_OPTIONS = { weekStartsOn: 1 as const };

type TimelineComputedSegment = PurchaseTimelineOrder['segments'][number] & {
  startDate: Date;
  endDate: Date;
};

type TimelineComputedOrder = {
  id: string;
  orderCode: string;
  productName: string;
  quantity: number;
  status: string;
  availableDate: Date | null;
  shipName: string | null;
  containerNumber: string | null;
  segments: TimelineComputedSegment[];
  orderStart: Date | null;
  orderEnd: Date | null;
};

type WeekColumn = {
  key: string;
  weekNumber: string;
  start: Date;
  end: Date;
};

export function PurchaseTimeline({
  orders,
  activeOrderId,
  onSelectOrder,
  header,
  months,
}: PurchaseTimelineProps) {
  const isDarkMode = useIsDarkMode();
  const getStageColor = (key: TimelineStageKey) => {
    const palette = stagePalette[key] ?? stagePalette.production;
    return isDarkMode ? palette.darkColor : palette.lightColor;
  };

  const timelineOrders = useMemo<TimelineComputedOrder[]>(() => {
    return orders
      .map((order) => {
        const segments = order.segments
          .map((segment) => {
            if (!segment.start || !segment.end) return null;
            const startDate = new Date(segment.start);
            const endDate = new Date(segment.end);
            if (
              Number.isNaN(startDate.getTime()) ||
              Number.isNaN(endDate.getTime()) ||
              startDate.getTime() > endDate.getTime()
            ) {
              return null;
            }
            return { ...segment, startDate, endDate };
          })
          .filter((segment): segment is TimelineComputedSegment => Boolean(segment))
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        const orderStart = segments[0]?.startDate ?? null;
        const orderEnd = segments[segments.length - 1]?.endDate ?? null;
        const availableDate = order.availableDate ? new Date(order.availableDate) : null;

        return {
          id: order.id,
          orderCode: order.orderCode,
          productName: order.productName,
          quantity: order.quantity,
          status: order.status,
          availableDate:
            availableDate && !Number.isNaN(availableDate.getTime()) ? availableDate : null,
          shipName: order.shipName ?? null,
          containerNumber: order.containerNumber ?? null,
          segments,
          orderStart,
          orderEnd,
        };
      })
      .sort((a, b) => {
        const aTime = a.orderStart?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = b.orderStart?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aTime === bTime) return a.orderCode.localeCompare(b.orderCode);
        return aTime - bTime;
      });
  }, [orders]);

  const timelineBounds = useMemo(() => {
    const starts = timelineOrders
      .map((order) => order.orderStart?.getTime())
      .filter((value): value is number => typeof value === 'number');
    const ends = timelineOrders
      .map((order) => order.orderEnd?.getTime())
      .filter((value): value is number => typeof value === 'number');
    if (starts.length === 0 || ends.length === 0) return null;
    const rangeStart = startOfWeek(new Date(Math.min(...starts)), WEEK_OPTIONS);
    const rangeEnd = endOfWeek(new Date(Math.max(...ends)), WEEK_OPTIONS);
    return { rangeStart, rangeEnd };
  }, [timelineOrders]);

  const monthBuckets = useMemo(() => {
    if (!months || months.length === 0) return null;

    const buckets = months
      .map((month) => {
        const start = startOfMonth(new Date(month.start));
        if (Number.isNaN(start.getTime())) return null;
        const endSource = month.end ? new Date(month.end) : start;
        const end = endOfMonth(endSource);
        return {
          start,
          end,
          label: month.label,
          duration: Math.max(1, differenceInCalendarDays(end, start) + 1),
        };
      })
      .filter((bucket): bucket is { start: Date; end: Date; label: string; duration: number } =>
        Boolean(bucket),
      );

    return buckets.length ? buckets : null;
  }, [months]);

  const weekColumns = useMemo(() => {
    if (!timelineBounds) return [];
    const weeks: WeekColumn[] = [];
    let cursor = timelineBounds.rangeStart;
    while (cursor.getTime() <= timelineBounds.rangeEnd.getTime()) {
      const start = cursor;
      const end = endOfWeek(start, WEEK_OPTIONS);
      weeks.push({
        key: start.toISOString(),
        weekNumber: String(getWeek(start, WEEK_OPTIONS)),
        start,
        end,
      });
      cursor = addWeeks(start, 1);
    }
    return weeks;
  }, [timelineBounds]);

  const timelineStart = monthBuckets?.[0]?.start ?? timelineBounds?.rangeStart ?? null;
  const timelineEnd =
    monthBuckets?.[monthBuckets.length - 1]?.end ?? timelineBounds?.rangeEnd ?? null;
  const totalDurationMs =
    timelineStart && timelineEnd
      ? Math.max(timelineEnd.getTime() - timelineStart.getTime(), 1)
      : null;

  const renderConsolidatedBar = (order: TimelineComputedOrder) => {
    if (!timelineStart || !timelineEnd || !totalDurationMs) return null;
    if (order.segments.length === 0) return null;

    // Calculate the overall bar position (from first segment start to last segment end)
    const firstSegment = order.segments[0];
    const lastSegment = order.segments[order.segments.length - 1];
    const overallStart = Math.min(
      Math.max(firstSegment.startDate.getTime(), timelineStart.getTime()),
      timelineEnd.getTime(),
    );
    const overallEnd = Math.min(
      Math.max(lastSegment.endDate.getTime(), timelineStart.getTime()),
      timelineEnd.getTime(),
    );
    if (overallEnd <= overallStart) return null;

    const leftPercent = ((overallStart - timelineStart.getTime()) / totalDurationMs) * 100;
    const widthPercent = ((overallEnd - overallStart) / totalDurationMs) * 100;
    const overallDuration = overallEnd - overallStart;
    const totalDays = differenceInCalendarDays(new Date(overallEnd), new Date(overallStart));

    // Build tooltip content with all order details
    const tooltipContent = (
      <div className="space-y-3 min-w-[200px]">
        <div className="space-y-1">
          <div className="font-semibold text-sm">{order.orderCode}</div>
          <div className="text-xs text-muted-foreground">{order.productName}</div>
          <div className="text-xs font-medium">{order.quantity.toLocaleString('en-US')} units</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide">
            {order.status.replace(/_/g, ' ')}
          </span>
          {order.availableDate && (
            <span className="text-2xs font-medium text-emerald-600 dark:text-emerald-200">
              ETA {format(order.availableDate, 'MMM d')}
            </span>
          )}
        </div>
        {(order.shipName || order.containerNumber) && (
          <div className="space-y-0.5 text-xs text-muted-foreground border-t border-border pt-2">
            {order.shipName && <div>Ship: {order.shipName}</div>}
            {order.containerNumber && <div>Container: {order.containerNumber}</div>}
          </div>
        )}
        <div className="border-t border-border pt-2 space-y-1.5">
          <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Timeline ({totalDays} days)
          </div>
          {order.segments.map((segment) => {
            const palette = stagePalette[segment.key] ?? stagePalette.production;
            const days = differenceInCalendarDays(segment.endDate, segment.startDate);
            return (
              <div key={segment.key} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getStageColor(segment.key) }}
                />
                <span className="flex-1">{palette.label}</span>
                <span className="text-muted-foreground">{days}d</span>
              </div>
            );
          })}
        </div>
      </div>
    );

    return (
      <Tooltip
        key={order.id}
        content={tooltipContent}
        position="bottom"
        className="absolute h-full"
        style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
      >
        <button
          type="button"
          onClick={() => onSelectOrder?.(order.id)}
          className={clsx(
            'relative flex h-full w-full cursor-pointer overflow-hidden rounded-lg shadow-sm transition-all duration-150',
            'hover:shadow-md hover:scale-y-110',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            activeOrderId === order.id &&
              'ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg',
          )}
          aria-label={`${order.orderCode}: ${order.productName}, ${order.quantity.toLocaleString()} units`}
        >
          {/* Render each stage as a colored segment within the bar */}
          {order.segments.map((segment) => {
            const segStart = Math.max(segment.startDate.getTime(), overallStart);
            const segEnd = Math.min(segment.endDate.getTime(), overallEnd);
            if (segEnd <= segStart) return null;

            const segLeftPercent = ((segStart - overallStart) / overallDuration) * 100;
            const segWidthPercent = ((segEnd - segStart) / overallDuration) * 100;

            return (
              <div
                key={segment.key}
                className="absolute inset-y-0 transition-opacity"
                style={{
                  left: `${segLeftPercent}%`,
                  width: `${segWidthPercent}%`,
                  backgroundColor: getStageColor(segment.key),
                }}
              />
            );
          })}
          {/* Order code label inside bar */}
          <div className="relative z-10 flex h-full w-full items-center px-3">
            <span
              className="truncate text-xs font-bold text-white"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
            >
              {order.orderCode}
            </span>
          </div>
        </button>
      </Tooltip>
    );
  };

  const renderTimelineBackground = () => {
    // Calculate week positions for dividers
    const weekDividers: { position: number; isMonthStart: boolean }[] = [];
    if (timelineStart && timelineEnd && totalDurationMs && monthBuckets) {
      let cursor = startOfWeek(timelineStart, WEEK_OPTIONS);
      while (cursor.getTime() <= timelineEnd.getTime()) {
        const position = ((cursor.getTime() - timelineStart.getTime()) / totalDurationMs) * 100;
        if (position > 0 && position < 100) {
          const isMonthStart = cursor.getDate() <= 7 && cursor.getDate() >= 1;
          weekDividers.push({ position, isMonthStart });
        }
        cursor = addWeeks(cursor, 1);
      }
    }

    return (
      <div className="h-full rounded-lg bg-muted relative overflow-hidden">
        {/* Week divider lines */}
        {weekDividers.map((divider, i) => (
          <div
            key={i}
            className={clsx(
              'absolute top-0 bottom-0 w-px',
              divider.isMonthStart ? 'bg-border' : 'bg-border/50',
            )}
            style={{ left: `${divider.position}%` }}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      {header ?? (
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">PO Timeline</h2>
          {/* Legend */}
          <div className="flex items-center gap-4">
            {(Object.keys(stagePalette) as TimelineStageKey[]).map((key) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg bg-slate-100/80 px-2.5 py-1 dark:bg-slate-800/50"
              >
                <div className="relative">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getStageColor(key) }}
                  />
                  <div
                    className="absolute inset-0 animate-pulse rounded-full opacity-40 blur-sm"
                    style={{ backgroundColor: getStageColor(key) }}
                  />
                </div>
                <span className="text-2xs font-medium text-slate-700 dark:text-slate-200">
                  {stagePalette[key].label}
                </span>
              </div>
            ))}
          </div>
        </header>
      )}

      {/* Month header row */}
      {monthBuckets && (
        <div className="relative h-6 rounded-md bg-muted/50 overflow-hidden">
          {monthBuckets.map((month) => {
            if (!timelineStart || !totalDurationMs) return null;
            const monthMid =
              month.start.getTime() + (month.end.getTime() - month.start.getTime()) / 2;
            const position = ((monthMid - timelineStart.getTime()) / totalDurationMs) * 100;
            return (
              <span
                key={`${month.label}-${month.start.toISOString()}-header`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-2xs font-medium text-muted-foreground"
                style={{ left: `${Math.min(Math.max(position, 3), 97)}%` }}
              >
                {month.label}
              </span>
            );
          })}
          {/* Month divider lines */}
          {monthBuckets.slice(1).map((month, idx) => {
            if (!timelineStart || !totalDurationMs) return null;
            const position =
              ((month.start.getTime() - timelineStart.getTime()) / totalDurationMs) * 100;
            return (
              <div
                key={`divider-${idx}`}
                className="absolute top-0 bottom-0 w-px bg-border/50"
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>
      )}

      {/* Gantt bars - stacked vertically */}
      <div className="space-y-2">
        {timelineOrders.map((order) => (
          <div key={order.id} className="relative h-10">
            {renderTimelineBackground()}
            <div className="absolute inset-0">{renderConsolidatedBar(order)}</div>
            {order.segments.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-muted-foreground/60">No dates set</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {timelineOrders.length === 0 && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          No purchase orders to display
        </div>
      )}
    </section>
  );
}
