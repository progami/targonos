export type SettlementAuditRowForEvidence = {
  invoiceId: string;
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  netCents: number;
};

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildSettlementAuditFilename(docNumber: string): string {
  return `plutus-settlement-audit-${docNumber}.csv`;
}

export function buildSettlementFullAuditTrailFilename(docNumber: string): string {
  return `plutus-full-audit-trail-${docNumber}.csv`;
}

export function buildSettlementMtdDailySummaryFilename(docNumber: string): string {
  return `plutus-mtd-daily-summary-${docNumber}.csv`;
}

export function buildSettlementAuditCsvBytes(rows: SettlementAuditRowForEvidence[]): Uint8Array {
  const lines: string[] = ['invoiceId,market,date,orderId,sku,quantity,description,net'];

  for (const row of rows) {
    const cols = [
      row.invoiceId,
      row.market,
      row.date,
      row.orderId,
      row.sku,
      String(row.quantity),
      row.description,
      formatCents(row.netCents),
    ];
    lines.push(cols.map((col) => escapeCsvCell(col)).join(','));
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}

function parseIsoDayToUtcMs(isoDay: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    throw new Error(`Invalid ISO day: ${isoDay}`);
  }
  const utcMs = Date.parse(`${isoDay}T00:00:00.000Z`);
  if (!Number.isFinite(utcMs)) {
    throw new Error(`Invalid ISO day: ${isoDay}`);
  }
  return utcMs;
}

function buildIsoDayRange(startIsoDay: string, endIsoDay: string): string[] {
  const startMs = parseIsoDayToUtcMs(startIsoDay);
  const endMs = parseIsoDayToUtcMs(endIsoDay);
  if (startMs > endMs) {
    throw new Error(`Invalid day range: ${startIsoDay} > ${endIsoDay}`);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days: string[] = [];
  for (let current = startMs; current <= endMs; current += dayMs) {
    days.push(new Date(current).toISOString().slice(0, 10));
  }
  return days;
}

function toCsvLine(cells: string[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(',');
}

function taxLabelForTaxCodeId(taxCodeId: string | null | undefined): string {
  if (typeof taxCodeId !== 'string' || taxCodeId.trim() === '') {
    return 'No Tax Rate Applicable';
  }
  return taxCodeId.trim();
}

export function buildSettlementFullAuditTrailCsvBytes(input: {
  invoiceId: string;
  countryCode: string;
  accountIdByMemo: ReadonlyMap<string, string>;
  taxCodeIdByMemo: ReadonlyMap<string, string | null>;
  rows: SettlementAuditRowForEvidence[];
}): Uint8Array {
  const lines: string[] = [
    toCsvLine([
      'date',
      'Order Id',
      'Sku',
      'Sku Name',
      'Quantity',
      'LMB Line Description',
      'Account Name',
      'Tax Rate',
      'Tax Name',
      'Gross',
      'Tax',
      'Net',
      'Country',
      'Invoice',
    ]),
  ];

  const sortedRows = [...input.rows].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderId.localeCompare(b.orderId);
    if (orderCmp !== 0) return orderCmp;
    const skuCmp = a.sku.localeCompare(b.sku);
    if (skuCmp !== 0) return skuCmp;
    const descriptionCmp = a.description.localeCompare(b.description);
    if (descriptionCmp !== 0) return descriptionCmp;
    return a.netCents - b.netCents;
  });

  for (const row of sortedRows) {
    const accountName = input.accountIdByMemo.get(row.description) ?? '';
    const taxName = taxLabelForTaxCodeId(input.taxCodeIdByMemo.get(row.description));
    const net = formatCents(row.netCents);

    lines.push(
      toCsvLine([
        row.date,
        row.orderId,
        row.sku,
        '',
        String(row.quantity),
        row.description,
        accountName,
        '0',
        taxName,
        net,
        '0.00',
        net,
        input.countryCode,
        input.invoiceId,
      ]),
    );
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}

export function buildSettlementMtdDailySummaryCsvBytes(input: {
  marketplaceName: string;
  currencyCode: string;
  startIsoDay: string;
  endIsoDay: string;
  accountIdByMemo: ReadonlyMap<string, string>;
  taxCodeIdByMemo: ReadonlyMap<string, string | null>;
  rows: SettlementAuditRowForEvidence[];
}): Uint8Array {
  const baseDays = buildIsoDayRange(input.startIsoDay, input.endIsoDay);
  const daySet = new Set(baseDays);
  for (const row of input.rows) {
    daySet.add(row.date);
  }
  const days = Array.from(daySet).sort();

  const totalsByDescription = new Map<string, { totalCents: number; dailyCents: Map<string, number> }>();
  for (const row of input.rows) {
    let bucket = totalsByDescription.get(row.description);
    if (!bucket) {
      bucket = { totalCents: 0, dailyCents: new Map() };
      totalsByDescription.set(row.description, bucket);
    }
    bucket.totalCents += row.netCents;
    const dayTotal = bucket.dailyCents.get(row.date);
    bucket.dailyCents.set(row.date, (dayTotal === undefined ? 0 : dayTotal) + row.netCents);
  }

  const sortedDescriptions = Array.from(totalsByDescription.entries())
    .sort((a, b) => {
      const totalCmp = b[1].totalCents - a[1].totalCents;
      if (totalCmp !== 0) return totalCmp;
      return a[0].localeCompare(b[0]);
    })
    .map(([description]) => description);

  const lines: string[] = [];
  lines.push(
    toCsvLine([
      'Marketplace',
      input.marketplaceName,
      'Currency',
      input.currencyCode,
      'Start Date',
      input.startIsoDay,
      'End Date',
      input.endIsoDay,
    ]),
  );
  lines.push('');
  lines.push(toCsvLine(['Description', 'Tax Code', 'Account Code', 'Total', ...days]));

  for (const description of sortedDescriptions) {
    const bucket = totalsByDescription.get(description);
    if (!bucket) continue;

    const accountCode = input.accountIdByMemo.get(description) ?? '';
    const taxCode = taxLabelForTaxCodeId(input.taxCodeIdByMemo.get(description));
    const daily = days.map((day) => formatCents(bucket.dailyCents.get(day) ?? 0));

    lines.push(toCsvLine([description, taxCode, accountCode, formatCents(bucket.totalCents), ...daily]));
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}
