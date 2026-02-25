type SettlementAuditRowForEvidence = {
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
