import { moneyToCents } from '@/lib/amazon-finances/money';
import type {
  SpApiMoney,
  SpApiTransaction,
  SpApiTransactionRelatedIdentifier,
} from '@/lib/amazon-finances/types';
import { allocateByWeight } from '@/lib/inventory/money';
import { normalizeSku } from './settlement-validation';

const INBOUND_TRANSPORT_FEE_PHRASE = 'inbound transportation';
const INBOUND_TRANSPORT_FEE_CODE_FRAGMENT = 'inboundtransportation';
const SHIPMENT_IDENTIFIER_NAMES = ['ORDER_ID', 'SHIPMENT_ID', 'INBOUND_SHIPMENT_ID'];

export type InboundTransportationServiceFeeCharge = {
  shipmentId: string;
  cents: number;
  transactionId: string;
  description: string;
};

export type InboundShipmentItem = {
  sku: string;
  quantity: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed;
}

function toIdentifiers(value: unknown): SpApiTransactionRelatedIdentifier[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is SpApiTransactionRelatedIdentifier =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function getRelatedIdentifierValue(
  identifiers: SpApiTransactionRelatedIdentifier[],
  name: string,
): string | null {
  const upperName = name.trim().toUpperCase();
  for (const entry of identifiers) {
    const rawName = entry.relatedIdentifierName;
    if (typeof rawName !== 'string') continue;
    if (rawName.trim().toUpperCase() !== upperName) continue;

    const value = entry.relatedIdentifierValue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '') continue;
    return trimmed;
  }
  return null;
}

function resolveShipmentId(identifiers: SpApiTransactionRelatedIdentifier[]): string | null {
  for (const name of SHIPMENT_IDENTIFIER_NAMES) {
    const value = getRelatedIdentifierValue(identifiers, name);
    if (value !== null) return value;
  }
  return null;
}

function isServiceFeeTransactionType(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'servicefee';
}

export function isInboundTransportationMemoDescription(description: string): boolean {
  const normalized = description.trim().toLowerCase();
  return (
    normalized.includes(INBOUND_TRANSPORT_FEE_PHRASE) ||
    // listTransactions (finances 2024-06-19) often uses code-like descriptions such as
    // "FBAPostInboundTransportation" rather than a human-readable phrase.
    normalized.includes(INBOUND_TRANSPORT_FEE_CODE_FRAGMENT)
  );
}

function extractMoneyFromRecord(record: Record<string, unknown>): SpApiMoney | null {
  const candidateKeys = ['amount', 'totalAmount', 'transactionAmount', 'feeAmount'];
  for (const key of candidateKeys) {
    const value = record[key];
    const money = asRecord(value);
    if (money !== null) {
      return money as SpApiMoney;
    }
  }
  return null;
}

function extractInboundChargeFromEntry(input: {
  entry: Record<string, unknown>;
  transactionId: string;
  defaultDescription: string | null;
  fallbackIdentifiers: SpApiTransactionRelatedIdentifier[];
  sourceLabel: string;
}): { charge?: InboundTransportationServiceFeeCharge; issue?: string } {
  const descriptionRaw = readTrimmedString(input.entry.description);
  const description = descriptionRaw === null ? input.defaultDescription : descriptionRaw;
  if (description === null || !isInboundTransportationMemoDescription(description)) {
    return {};
  }

  const identifiers = toIdentifiers(input.entry.relatedIdentifiers);
  const identifierList = identifiers.length > 0 ? identifiers : input.fallbackIdentifiers;
  const shipmentId = resolveShipmentId(identifierList);
  if (shipmentId === null) {
    return {
      issue: `${input.sourceLabel} ${input.transactionId} missing shipment identifier for inbound transportation fee`,
    };
  }

  const money = extractMoneyFromRecord(input.entry);
  if (money === null) {
    return {
      issue: `${input.sourceLabel} ${input.transactionId} missing amount for inbound transportation fee (${shipmentId})`,
    };
  }

  let cents: number;
  try {
    cents = moneyToCents(money, `${input.sourceLabel} ${input.transactionId} inbound transportation fee`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      issue: `${input.sourceLabel} ${input.transactionId} invalid amount for inbound transportation fee (${shipmentId}): ${message}`,
    };
  }

  if (cents === 0) return {};

  return {
    charge: {
      shipmentId,
      cents,
      transactionId: input.transactionId,
      description,
    },
  };
}

function parseTransactionId(index: number, value: unknown): string {
  const id = readTrimmedString(value);
  if (id !== null) return id;
  return `tx-${index + 1}`;
}

export function extractInboundTransportationServiceFeeCharges(transactions: SpApiTransaction[]): {
  charges: InboundTransportationServiceFeeCharge[];
  issues: string[];
} {
  const charges: InboundTransportationServiceFeeCharge[] = [];
  const issues: string[] = [];

  transactions.forEach((tx, index) => {
    if (!isServiceFeeTransactionType(tx.transactionType)) return;

    const txRecord = asRecord(tx);
    if (txRecord === null) return;

    const transactionId = parseTransactionId(index, tx.transactionId);
    const txDescription = readTrimmedString(txRecord.description);
    const txIdentifiers = toIdentifiers(tx.relatedIdentifiers);

    const contextRecords = asRecordArray(txRecord.contexts);
    if (contextRecords.length > 0) {
      let contextMatchCount = 0;

      for (const contextRecord of contextRecords) {
        const contextIdentifiers = toIdentifiers(contextRecord.relatedIdentifiers);
        const fallbackIdentifiers = contextIdentifiers.length > 0 ? contextIdentifiers : txIdentifiers;
        const breakdownRecords = asRecordArray(contextRecord.breakdowns);

        if (breakdownRecords.length > 0) {
          let breakdownMatchCount = 0;
          for (const breakdownRecord of breakdownRecords) {
            const result = extractInboundChargeFromEntry({
              entry: breakdownRecord,
              transactionId,
              defaultDescription: readTrimmedString(contextRecord.description),
              fallbackIdentifiers,
              sourceLabel: 'ServiceFee breakdown',
            });
            if (result.issue) issues.push(result.issue);
            if (result.charge) {
              charges.push(result.charge);
              breakdownMatchCount += 1;
            }
          }
          if (breakdownMatchCount > 0) {
            contextMatchCount += breakdownMatchCount;
            continue;
          }
        }

        const result = extractInboundChargeFromEntry({
          entry: contextRecord,
          transactionId,
          defaultDescription: txDescription,
          fallbackIdentifiers,
          sourceLabel: 'ServiceFee context',
        });
        if (result.issue) issues.push(result.issue);
        if (result.charge) {
          charges.push(result.charge);
          contextMatchCount += 1;
        }
      }

      if (contextMatchCount > 0) {
        return;
      }
    }

    const result = extractInboundChargeFromEntry({
      entry: txRecord,
      transactionId,
      defaultDescription: txDescription,
      fallbackIdentifiers: txIdentifiers,
      sourceLabel: 'ServiceFee transaction',
    });
    if (result.issue) issues.push(result.issue);
    if (result.charge) charges.push(result.charge);
  });

  return { charges, issues };
}

export function allocateShipmentFeeChargesBySkuQuantity(input: {
  charges: InboundTransportationServiceFeeCharge[];
  shipmentItemsByShipmentId: Map<string, InboundShipmentItem[]>;
}): {
  allocationBySku: Record<string, number>;
  issues: string[];
} {
  const allocationBySku: Record<string, number> = {};
  const issues: string[] = [];

  for (const charge of input.charges) {
    const shipmentItems = input.shipmentItemsByShipmentId.get(charge.shipmentId);
    if (!shipmentItems || shipmentItems.length === 0) {
      issues.push(`Missing shipment items for ${charge.shipmentId} (transaction ${charge.transactionId})`);
      continue;
    }

    const quantityBySku = new Map<string, number>();
    for (const item of shipmentItems) {
      const sku = normalizeSku(item.sku);
      if (sku === '') continue;

      const quantity = item.quantity;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        issues.push(`Invalid shipment quantity for ${charge.shipmentId} SKU ${sku}: ${quantity}`);
        continue;
      }

      const current = quantityBySku.get(sku);
      quantityBySku.set(sku, (current === undefined ? 0 : current) + quantity);
    }

    if (quantityBySku.size === 0) {
      issues.push(`No positive SKU quantities available for shipment ${charge.shipmentId}`);
      continue;
    }

    const absCents = Math.abs(charge.cents);
    const sign = charge.cents < 0 ? -1 : 1;
    const weights = Array.from(quantityBySku.entries()).map(([sku, quantity]) => ({
      key: sku,
      weight: quantity,
    }));

    const allocated = allocateByWeight(absCents, weights);
    for (const [sku, cents] of Object.entries(allocated)) {
      const current = allocationBySku[sku];
      allocationBySku[sku] = (current === undefined ? 0 : current) + sign * cents;
    }
  }

  return { allocationBySku, issues };
}
