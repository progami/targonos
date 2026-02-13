import type { QboBill } from '@/lib/qbo/api';

export type BillMappingPullSyncCandidate = {
  id: string;
  qboBillId: string;
  poNumber: string;
  billDate: string;
  vendorName: string;
  totalAmount: number;
  syncedAt: Date | null;
};

export type BillMappingPullSyncUpdate = {
  id: string;
  qboBillId: string;
  poNumber: string;
  billDate: string;
  vendorName: string;
  totalAmount: number;
};

const poCustomFieldNamePattern = /\b(?:po|p\/o|purchase\s*order)\b/i;
const poMemoPatterns = [
  /^P(?:\s*\/\s*)?O\s*(?:#|:|-)\s*(.+)$/i,
  /^P(?:\s*\/\s*)?O\s+(.+)$/i,
];

export function extractPoNumberFromBill(bill: Pick<QboBill, 'PrivateNote' | 'CustomField'>): string {
  const customFieldPo = extractPoNumberFromCustomFields(bill.CustomField);
  if (customFieldPo !== '') return customFieldPo;
  return extractPoNumberFromPrivateNote(bill.PrivateNote);
}

function extractPoNumberFromCustomFields(customFields: QboBill['CustomField']): string {
  if (!customFields || customFields.length === 0) return '';

  for (const field of customFields) {
    if (!field) continue;

    const stringValueRaw = field.StringValue;
    if (typeof stringValueRaw !== 'string') continue;

    const stringValue = stringValueRaw.trim();
    if (stringValue === '') continue;

    const nameRaw = field.Name;
    if (typeof nameRaw !== 'string') continue;

    const name = nameRaw.trim();
    if (name === '') continue;
    if (!poCustomFieldNamePattern.test(name)) continue;

    return stringValue;
  }

  return '';
}

function extractPoNumberFromPrivateNote(privateNote: string | undefined): string {
  if (privateNote === undefined) return '';

  const lines = privateNote
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  for (const line of lines) {
    for (const pattern of poMemoPatterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const po = match[1];
      if (!po) continue;
      const trimmed = po.trim();
      if (trimmed === '') continue;
      return trimmed;
    }
  }

  return '';
}

export function buildBillMappingPullSyncUpdates(
  mappings: BillMappingPullSyncCandidate[],
  billsById: Map<string, QboBill>,
): BillMappingPullSyncUpdate[] {
  const updates: BillMappingPullSyncUpdate[] = [];

  for (const mapping of mappings) {
    if (mapping.syncedAt === null) continue;

    const bill = billsById.get(mapping.qboBillId);
    if (!bill) continue;

    const poNumber = extractPoNumberFromBill(bill);
    const billDate = bill.TxnDate;
    const vendorName = bill.VendorRef ? bill.VendorRef.name : '';
    const totalAmount = bill.TotalAmt;

    const poChanged = mapping.poNumber.trim() !== poNumber;
    const billDateChanged = mapping.billDate !== billDate;
    const vendorChanged = mapping.vendorName !== vendorName;
    const totalAmountChanged = Math.abs(mapping.totalAmount - totalAmount) > 0.000001;

    if (!poChanged && !billDateChanged && !vendorChanged && !totalAmountChanged) continue;

    updates.push({
      id: mapping.id,
      qboBillId: mapping.qboBillId,
      poNumber,
      billDate,
      vendorName,
      totalAmount,
    });
  }

  return updates;
}
