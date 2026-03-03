import { lastDayOfMonth, parseIsoDayParts } from './time';

export const SPLIT_MONTH_ROLLOVER_PREV_MEMO = 'Split month settlement - balance of previous invoice(s) rolled forward';
export const SPLIT_MONTH_ROLLOVER_THIS_MEMO = 'Split month settlement - balance of this invoice rolled forward';

export type MonthlySettlementSegmentDraft<TAuditRow> = {
  seq: number;
  yearMonth: string;
  startIsoDay: string;
  endIsoDay: string;
  txnDate: string;
  docNumber: string;
  memoTotalsCents: Map<string, number>;
  auditRows: TAuditRow[];
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function buildMonthlySettlementSegments<TAuditRow>(input: {
  startIsoDay: string;
  endIsoDay: string;
  buildDocNumber: (params: { startIsoDay: string; endIsoDay: string; seq: number }) => string;
}): MonthlySettlementSegmentDraft<TAuditRow>[] {
  const start = parseIsoDayParts(input.startIsoDay, 'settlement start');
  const end = parseIsoDayParts(input.endIsoDay, 'settlement end');

  const segments: MonthlySettlementSegmentDraft<TAuditRow>[] = [];

  let year = start.year;
  let month = start.month;
  let seq = 1;

  for (let guard = 0; guard < 1200; guard++) {
    const isFirst = seq === 1;
    const isLast = year === end.year && month === end.month;

    const startIsoDay = isFirst ? input.startIsoDay : `${year}-${pad2(month)}-01`;
    const endIsoDay = isLast
      ? input.endIsoDay
      : `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;

    const yearMonth = `${year}-${pad2(month)}`;

    segments.push({
      seq,
      yearMonth,
      startIsoDay,
      endIsoDay,
      txnDate: endIsoDay,
      docNumber: input.buildDocNumber({ startIsoDay, endIsoDay, seq }),
      memoTotalsCents: new Map(),
      auditRows: [],
    });

    if (isLast) break;

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    seq += 1;
  }

  if (segments.length === 0) {
    throw new Error(`Failed to build settlement segments for ${input.startIsoDay} → ${input.endIsoDay}`);
  }

  return segments;
}

export function applySplitMonthRollovers(input: {
  segments: Array<{ memoTotalsCents: Map<string, number> }>;
  addCents: (map: Map<string, number>, key: string, cents: number) => void;
  sumMap: (map: Map<string, number>) => number;
}): void {
  if (input.segments.length <= 1) return;

  // Sequentially carry the running balance forward so multi-month settlements (3+ months)
  // produce balanced intermediate JEs (LMB-style).
  let carriedCents = 0;

  for (let i = 0; i < input.segments.length; i++) {
    const segment = input.segments[i]!;
    const segmentTotal = input.sumMap(segment.memoTotalsCents);
    const isLast = i === input.segments.length - 1;

    if (carriedCents !== 0) {
      input.addCents(segment.memoTotalsCents, SPLIT_MONTH_ROLLOVER_PREV_MEMO, carriedCents);
    }

    if (isLast) continue;

    const nextCarried = carriedCents + segmentTotal;
    if (nextCarried !== 0) {
      input.addCents(segment.memoTotalsCents, SPLIT_MONTH_ROLLOVER_THIS_MEMO, -nextCarried);
    }
    carriedCents = nextCarried;
  }
}

