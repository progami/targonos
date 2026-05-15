import { createHash } from 'crypto';

import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';

export function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid monetary amount: ${amount}`);
  }
  return Math.round(amount * 100);
}

export function computeProcessingHash(rows: SettlementAuditRow[]): string {
  const normalized = rows.map((row) => ({
    invoice: row.invoiceId.trim(),
    market: row.market.trim(),
    date: row.date.trim(),
    orderId: row.orderId.trim(),
    sku: normalizeSku(row.sku),
    quantity: row.quantity,
    description: row.description.trim(),
    net: row.net,
  }));

  normalized.sort((a, b) => {
    if (a.invoice !== b.invoice) return a.invoice.localeCompare(b.invoice);
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    if (a.quantity !== b.quantity) return a.quantity - b.quantity;
    return a.net - b.net;
  });

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
