import type { ReactNode } from 'react';
import type { PurchaseOrderDerived } from '@/lib/calculations';

export type TimelineStageKey = 'production' | 'source' | 'ocean' | 'final';

export interface PurchaseTimelineSegment {
  key: TimelineStageKey;
  label: string;
  start: string | null;
  end: string | null;
}

export interface PurchaseTimelineOrder {
  id: string;
  orderCode: string;
  productName: string;
  quantity: number;
  status: string;
  shipName?: string | null;
  containerNumber?: string | null;
  availableDate: string | null;
  segments: PurchaseTimelineSegment[];
}

export interface TimelineMonth {
  start: string;
  end: string;
  label: string;
}

export type PurchaseTimelineProps = {
  orders: PurchaseTimelineOrder[];
  activeOrderId?: string | null;
  onSelectOrder?: (orderId: string) => void;
  header?: ReactNode;
  months?: TimelineMonth[];
};

export function buildTimelineSegmentsFromDerived(
  order: PurchaseOrderDerived,
): PurchaseTimelineSegment[] {
  const segments: PurchaseTimelineSegment[] = [];

  const pushSegment = (
    key: TimelineStageKey,
    label: string,
    start: Date | null,
    end: Date | null,
  ) => {
    if (!start || !end) return;
    const startTime = start.getTime();
    const endTime = end.getTime();
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) return;
    segments.push({
      key,
      label,
      start: serializeDate(start),
      end: serializeDate(end),
    });
  };

  const productionStart = order.productionStart ?? order.createdAt ?? null;
  const productionEnd = order.productionComplete ?? productionStart;

  const sourceStart = productionEnd ?? productionStart;
  const sourceEnd = order.sourceDeparture ?? sourceStart;

  const oceanStart = sourceEnd ?? sourceStart;
  const oceanEnd = order.portEta ?? oceanStart;

  const finalStart = order.inboundEta ?? oceanEnd ?? oceanStart;
  const finalEnd = order.availableDate ?? finalStart;

  pushSegment('production', 'Production', productionStart, productionEnd);
  pushSegment('source', 'Source', sourceStart, sourceEnd);
  pushSegment('ocean', 'Ocean', oceanStart, oceanEnd);
  pushSegment('final', 'Final', finalStart, finalEnd);

  return segments;
}

export function createTimelineOrderFromDerived(params: {
  derived: PurchaseOrderDerived;
  productName: string;
}): PurchaseTimelineOrder {
  const { derived, productName } = params;
  return {
    id: derived.id,
    orderCode: derived.orderCode,
    productName,
    quantity: derived.quantity,
    status: derived.status,
    shipName: derived.shipName ?? null,
    containerNumber: derived.containerNumber ?? null,
    availableDate: serializeDate(derived.availableDate),
    segments: buildTimelineSegmentsFromDerived(derived),
  };
}

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
