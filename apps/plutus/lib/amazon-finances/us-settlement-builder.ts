import { normalizeSku } from '@/lib/plutus/settlement-validation';

import { moneyToCents } from './money';
import { isoDayToYearMonth, isoTimestampToZonedIsoDay, lastDayOfMonth, parseIsoDayParts } from './time';
import type {
  SpApiAdjustmentEvent,
  SpApiChargeComponent,
  SpApiFeeComponent,
  SpApiFinancialEventGroup,
  SpApiFinancialEvents,
  SpApiPromotion,
  SpApiTaxWithheldComponent,
} from './types';

export type UsSettlementSegmentDraft = {
  seq: number;
  yearMonth: string;
  startIsoDay: string;
  endIsoDay: string;
  txnDate: string;
  docNumber: string;
  memoTotalsCents: Map<string, number>;
  auditRows: UsSettlementAuditRowDraft[];
};

export type UsSettlementAuditRowDraft = {
  invoiceId: string;
  market: 'us';
  date: string; // YYYY-MM-DD (local)
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  netCents: number;
};

export type UsSettlementDraft = {
  settlementId: string;
  eventGroupId: string;
  timeZone: string;
  originalTotalCents: number;
  segments: UsSettlementSegmentDraft[];
};

const US_TIME_ZONE = 'America/Los_Angeles';

const MONTH_ABBR: Record<number, string> = {
  1: 'JAN',
  2: 'FEB',
  3: 'MAR',
  4: 'APR',
  5: 'MAY',
  6: 'JUN',
  7: 'JUL',
  8: 'AUG',
  9: 'SEP',
  10: 'OCT',
  11: 'NOV',
  12: 'DEC',
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function buildUsLmbDocNumber(input: { startIsoDay: string; endIsoDay: string; seq: number }): string {
  const start = parseIsoDayParts(input.startIsoDay, 'segment start');
  const end = parseIsoDayParts(input.endIsoDay, 'segment end');

  const month = MONTH_ABBR[end.month];
  if (!month) {
    throw new Error(`Invalid month for doc number: ${end.month}`);
  }

  const startToken = pad2(start.day);
  const endToken = `${pad2(end.day)}${month}`;
  const yearToken = String(end.year).slice(-2);

  return `PLUTUS#LMB-US-${startToken}-${endToken}-${yearToken}-${input.seq}`;
}

function addCents(map: Map<string, number>, key: string, cents: number): void {
  if (cents === 0) return;
  const current = map.get(key);
  map.set(key, (current === undefined ? 0 : current) + cents);
}

function sumMap(map: Map<string, number>): number {
  let total = 0;
  for (const cents of map.values()) total += cents;
  return total;
}

function requirePostedDate(value: string | undefined, context: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing PostedDate for ${context}`);
  }
  return value;
}

function brandNameForSku(skuRaw: string, skuToBrandName: Map<string, string>): string {
  const normalized = normalizeSku(skuRaw);
  const brandName = skuToBrandName.get(normalized);
  if (!brandName) {
    throw new Error(`SKU not mapped to brand: ${normalized}`);
  }
  return brandName;
}

function brandLabelForName(brandName: string, brandLabelByBrandName?: Map<string, string>): string {
  if (!brandLabelByBrandName) return brandName;
  const label = brandLabelByBrandName.get(brandName);
  return label ? label : brandName;
}

function chargeTypeMemoForShipment(input: { chargeType: string; brandLabel: string }): string | null {
  if (input.chargeType === 'Principal') return `Amazon Sales - Principal - ${input.brandLabel}`;
  if (input.chargeType === 'ShippingCharge') return `Amazon Sales - Shipping - ${input.brandLabel}`;
  if (input.chargeType === 'Tax') return 'Amazon Sales Tax - Sales Tax (Principal)';
  if (input.chargeType === 'ShippingTax') return 'Amazon Sales Tax - Sales Tax (Shipping)';
  if (input.chargeType === 'GiftWrap') return null;
  if (input.chargeType === 'GiftWrapTax') return null;
  return null;
}

function promotionMemoForShipment(brandLabel: string): string {
  return `Amazon Sales - Shipping Promotion - ${brandLabel}`;
}

function feeTypeMemoForShipment(feeType: string): string | null {
  if (feeType === 'Commission') return 'Amazon Seller Fees - Commission';
  if (feeType === 'FBAPerUnitFulfillmentFee') return 'Amazon FBA Fees - FBA Per Unit Fulfilment Fee';
  if (feeType === 'ShippingChargeback') return 'Amazon FBA Fees - Shipping Chargeback';
  if (feeType === 'DigitalServicesFee') return null;
  if (feeType === 'SalesTaxCollectionFee') return null;
  if (feeType === 'FixedClosingFee') return null;
  if (feeType === 'VariableClosingFee') return null;
  if (feeType === 'GiftwrapChargeback') return null;
  if (feeType === 'FBAPerOrderFulfillmentFee') return null;
  if (feeType === 'FBAWeightBasedFee') return null;
  return null;
}

function withheldChargeMemo(chargeType: string, context: 'shipment' | 'refund'): string | null {
  if (chargeType === 'MarketplaceFacilitatorTax-Principal') {
    return context === 'shipment'
      ? 'Amazon Sales Tax - Marketplace Facilitator Tax - (Principal)'
      : 'Amazon Sales Tax - Refunded Marketplace Facilitator Tax - (Principal)';
  }
  if (chargeType === 'MarketplaceFacilitatorTax-Shipping') {
    return context === 'shipment'
      ? 'Amazon Sales Tax - Marketplace Facilitator Tax - (Shipping)'
      : 'Amazon Sales Tax - Refunded Marketplace Facilitator Tax - (Shipping)';
  }
  return null;
}

function chargeTypeMemoForRefund(input: { chargeType: string; brandLabel: string }): string | null {
  if (input.chargeType === 'Principal') return `Amazon Refunds - Refunded Principal - ${input.brandLabel}`;
  if (input.chargeType === 'ShippingCharge') return `Amazon Refunds - Refunded Shipping - ${input.brandLabel}`;
  if (input.chargeType === 'Tax') return 'Amazon Sales Tax - Refund - Item Price - Tax';
  if (input.chargeType === 'ShippingTax') return null;
  if (input.chargeType === 'GiftWrap') return null;
  if (input.chargeType === 'GiftWrapTax') return null;
  return null;
}

function promotionMemoForRefund(brandLabel: string): string {
  return `Amazon Refunds - Refunded Shipping Promotion - ${brandLabel}`;
}

function feeTypeMemoForRefund(feeType: string): string | null {
  if (feeType === 'Commission') return 'Amazon Seller Fees - Refunded Commission';
  if (feeType === 'RefundCommission') return 'Amazon Seller Fees - Refund Commission';
  if (feeType === 'ShippingChargeback') return 'Amazon FBA Fees - Shipping Chargeback';
  if (feeType === 'DigitalServicesFee') return null;
  if (feeType === 'SalesTaxCollectionFee') return null;
  if (feeType === 'FixedClosingFee') return null;
  if (feeType === 'VariableClosingFee') return null;
  if (feeType === 'GiftwrapChargeback') return null;
  return null;
}

function serviceFeeMemo(feeType: string): string | null {
  if (feeType === 'Subscription') return 'Amazon Seller Fees - Subscription Fee';
  if (feeType === 'FBAInboundTransportationFee') return 'Amazon FBA Fees - FBA Inbound Transportation Fee';
  if (feeType === 'AmazonUpstreamProcessingFee') return 'Amazon FBA Fees - AWD Processing Fee';
  if (feeType === 'AmazonUpstreamStorageTransportationFee') return 'Amazon FBA Fees - AWD Transportation Fee';
  if (feeType === 'FBAPerUnitFulfillmentFee') return 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment';
  if (feeType === 'FBAStorageFee') return 'Amazon Storage Fees - Storage Fee';
  if (feeType === 'STARStorageFee') return 'Amazon Storage Fees - AWD Storage Fee';
  if (feeType === 'FBAWeightBasedFee') return null;
  return null;
}

function adjustmentMemo(event: SpApiAdjustmentEvent): string | null {
  const type = event.AdjustmentType;
  if (type === 'ReserveCredit') return 'Amazon Reserved Balances - Previous Reserve Amount Balance';
  if (type === 'ReserveDebit') return 'Amazon Reserved Balances - Current Reserve Amount';
  if (type === 'WAREHOUSE_DAMAGE') return 'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Warehouse Damage';
  if (type === 'MISSING_FROM_INBOUND') return 'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Missing From Inbound';
  return null;
}

function microDisbursementMemo(transactionType: string): string | null {
  if (transactionType === 'Micro Deposit') return 'Amazon Seller Fees - Micro Deposit';
  return null;
}

function toChargeComponents(list: unknown): SpApiChargeComponent[] {
  return Array.isArray(list) ? (list as SpApiChargeComponent[]) : [];
}

function toFeeComponents(list: unknown): SpApiFeeComponent[] {
  return Array.isArray(list) ? (list as SpApiFeeComponent[]) : [];
}

function toPromotions(list: unknown): SpApiPromotion[] {
  return Array.isArray(list) ? (list as SpApiPromotion[]) : [];
}

function toWithheldComponents(list: unknown): SpApiTaxWithheldComponent[] {
  return Array.isArray(list) ? (list as SpApiTaxWithheldComponent[]) : [];
}

function resolveSegmentIndexByYearMonth(
  segments: UsSettlementSegmentDraft[],
  yearMonth: string,
  options?: { allowAfterEndToLast?: boolean },
): number {
  const idx = segments.findIndex((s) => s.yearMonth === yearMonth);
  if (idx !== -1) return idx;

  const last = segments[segments.length - 1];
  if (options?.allowAfterEndToLast && last && yearMonth > last.yearMonth) {
    return segments.length - 1;
  }

  throw new Error(`No segment for ${yearMonth}`);
}

function requireEventGroupField(value: string | undefined, field: string, settlementId: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${field} for settlement ${settlementId}`);
  }
  return value;
}

export function buildUsSettlementDraftFromSpApiFinances(input: {
  settlementId: string;
  eventGroupId: string;
  eventGroup: SpApiFinancialEventGroup;
  events: SpApiFinancialEvents;
  skuToBrandName: Map<string, string>;
  brandLabelByBrandName?: Map<string, string>;
  timeZone?: string;
}): UsSettlementDraft {
  const timeZone = input.timeZone === undefined ? US_TIME_ZONE : input.timeZone;

  const groupStartTs = requireEventGroupField(input.eventGroup.FinancialEventGroupStart, 'FinancialEventGroupStart', input.settlementId);
  const groupEndTs = requireEventGroupField(input.eventGroup.FinancialEventGroupEnd, 'FinancialEventGroupEnd', input.settlementId);

  const startIsoDay = isoTimestampToZonedIsoDay(groupStartTs, timeZone, 'group start');
  let endIsoDay = isoTimestampToZonedIsoDay(groupEndTs, timeZone, 'group end');

  const startParts = parseIsoDayParts(startIsoDay, 'group start day');

  const originalTotalMoney = input.eventGroup.OriginalTotal;
  if (!originalTotalMoney) {
    throw new Error(`Missing OriginalTotal for settlement ${input.settlementId}`);
  }
  const originalTotalCents = moneyToCents(originalTotalMoney, 'event group OriginalTotal');

  const unclampedEndParts = parseIsoDayParts(endIsoDay, 'group end day');
  const shouldClampNegativeCrossMonth =
    originalTotalCents < 0 && (startParts.year !== unclampedEndParts.year || startParts.month !== unclampedEndParts.month);

  let endParts = unclampedEndParts;
  if (shouldClampNegativeCrossMonth) {
    const last = lastDayOfMonth(startParts.year, startParts.month);
    endIsoDay = `${startParts.year}-${pad2(startParts.month)}-${pad2(last)}`;
    endParts = parseIsoDayParts(endIsoDay, 'group end day');
  }

  const segments: UsSettlementSegmentDraft[] = [];
  let year = startParts.year;
  let month = startParts.month;
  let seq = 1;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const yearMonth = `${year}-${pad2(month)}`;
    const segStartDay = year === startParts.year && month === startParts.month ? startParts.day : 1;
    const segEndDay = year === endParts.year && month === endParts.month ? endParts.day : lastDayOfMonth(year, month);
    const segStartIsoDay = `${year}-${pad2(month)}-${pad2(segStartDay)}`;
    const segEndIsoDay = `${year}-${pad2(month)}-${pad2(segEndDay)}`;
    const docNumber = buildUsLmbDocNumber({ startIsoDay: segStartIsoDay, endIsoDay: segEndIsoDay, seq });

    segments.push({
      seq,
      yearMonth,
      startIsoDay: segStartIsoDay,
      endIsoDay: segEndIsoDay,
      txnDate: segEndIsoDay,
      docNumber,
      memoTotalsCents: new Map(),
      auditRows: [],
    });

    seq += 1;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  const lastSegmentIdx = segments.length - 1;
  const lastSegment = segments[lastSegmentIdx];
  if (!lastSegment) {
    throw new Error('No settlement segments built');
  }

  const segmentLookupOptions = { allowAfterEndToLast: shouldClampNegativeCrossMonth };

  // Shipments
  for (const shipment of input.events.ShipmentEventList ?? []) {
    const postedDate = requirePostedDate(shipment.PostedDate, 'ShipmentEvent');
    const localIsoDay = isoTimestampToZonedIsoDay(postedDate, timeZone, 'ShipmentEvent.PostedDate');
    const yearMonth = isoDayToYearMonth(localIsoDay, 'ShipmentEvent day');
    const segmentIdx = resolveSegmentIndexByYearMonth(segments, yearMonth, segmentLookupOptions);
    const segment = segments[segmentIdx]!;

    const orderId = typeof shipment.AmazonOrderId === 'string' ? shipment.AmazonOrderId : '';
    const items = shipment.ShipmentItemList ?? [];

    for (const item of items) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU : '';
      const qty = typeof item.QuantityShipped === 'number' && Number.isInteger(item.QuantityShipped) ? item.QuantityShipped : 0;
      const brandName = skuRaw === '' ? '' : brandNameForSku(skuRaw, input.skuToBrandName);
      const brandLabel = brandName === '' ? '' : brandLabelForName(brandName, input.brandLabelByBrandName);

      for (const charge of toChargeComponents(item.ItemChargeList)) {
        const chargeType = typeof charge.ChargeType === 'string' ? charge.ChargeType : '';
        const chargeAmount = charge.ChargeAmount;
        if (!chargeAmount) continue;
        const cents = moneyToCents(chargeAmount, `Shipment charge ${chargeType}`);
        if (cents === 0) continue;

        const memo = chargeTypeMemoForShipment({ chargeType, brandLabel });
        if (!memo) {
          throw new Error(`Unhandled shipment charge type: ${chargeType}`);
        }

        addCents(segment.memoTotalsCents, memo, cents);

        if (chargeType === 'Principal') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'us',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: qty,
            description: memo,
            netCents: cents,
          });
        }
      }

      let promoCents = 0;
      for (const promo of toPromotions(item.PromotionList)) {
        const amount = promo.PromotionAmount;
        if (!amount) continue;
        promoCents += moneyToCents(amount, 'Shipment promotion');
      }
      if (promoCents !== 0) {
        const memo = promotionMemoForShipment(brandLabel);
        addCents(segment.memoTotalsCents, memo, promoCents);
      }

      for (const fee of toFeeComponents(item.ItemFeeList)) {
        const feeType = typeof fee.FeeType === 'string' ? fee.FeeType : '';
        const feeAmount = fee.FeeAmount;
        if (!feeAmount) continue;
        const cents = moneyToCents(feeAmount, `Shipment fee ${feeType}`);
        if (cents === 0) continue;

        const memo = feeTypeMemoForShipment(feeType);
        if (!memo) {
          throw new Error(`Unhandled shipment fee type: ${feeType}`);
        }
        addCents(segment.memoTotalsCents, memo, cents);

        if (skuRaw !== '') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'us',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: 0,
            description: memo,
            netCents: cents,
          });
        }
      }

      for (const withheld of toWithheldComponents(item.ItemTaxWithheldList)) {
        for (const w of toChargeComponents(withheld.TaxesWithheld)) {
          const chargeType = typeof w.ChargeType === 'string' ? w.ChargeType : '';
          const chargeAmount = w.ChargeAmount;
          if (!chargeAmount) continue;
          const cents = moneyToCents(chargeAmount, `Withheld tax ${chargeType}`);
          if (cents === 0) continue;

          const memo = withheldChargeMemo(chargeType, 'shipment');
          if (!memo) {
            throw new Error(`Unhandled withheld tax charge type: ${chargeType}`);
          }
          addCents(segment.memoTotalsCents, memo, cents);
        }
      }
    }
  }

  // Refunds
  for (const refund of input.events.RefundEventList ?? []) {
    const postedDate = requirePostedDate(refund.PostedDate, 'RefundEvent');
    const localIsoDay = isoTimestampToZonedIsoDay(postedDate, timeZone, 'RefundEvent.PostedDate');
    const yearMonth = isoDayToYearMonth(localIsoDay, 'RefundEvent day');
    const segmentIdx = resolveSegmentIndexByYearMonth(segments, yearMonth, segmentLookupOptions);
    const segment = segments[segmentIdx]!;

    const orderId = typeof refund.AmazonOrderId === 'string' ? refund.AmazonOrderId : '';
    const items = refund.ShipmentItemAdjustmentList ?? [];

    for (const item of items) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU : '';
      const qtyRaw = typeof item.QuantityShipped === 'number' && Number.isInteger(item.QuantityShipped) ? item.QuantityShipped : 0;
      const qty = qtyRaw === 0 ? 0 : -qtyRaw;
      const brandName = skuRaw === '' ? '' : brandNameForSku(skuRaw, input.skuToBrandName);
      const brandLabel = brandName === '' ? '' : brandLabelForName(brandName, input.brandLabelByBrandName);

      for (const charge of toChargeComponents(item.ItemChargeAdjustmentList)) {
        const chargeType = typeof charge.ChargeType === 'string' ? charge.ChargeType : '';
        const chargeAmount = charge.ChargeAmount;
        if (!chargeAmount) continue;
        const cents = moneyToCents(chargeAmount, `Refund charge ${chargeType}`);
        if (cents === 0) continue;

        const memo = chargeTypeMemoForRefund({ chargeType, brandLabel });
        if (!memo) {
          throw new Error(`Unhandled refund charge type: ${chargeType}`);
        }

        addCents(segment.memoTotalsCents, memo, cents);

        if (chargeType === 'Principal') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'us',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: qty,
            description: memo,
            netCents: cents,
          });
        }
      }

      let promoCents = 0;
      for (const promo of toPromotions(item.PromotionAdjustmentList)) {
        const amount = promo.PromotionAmount;
        if (!amount) continue;
        promoCents += moneyToCents(amount, 'Refund promotion');
      }
      if (promoCents !== 0) {
        const memo = promotionMemoForRefund(brandLabel);
        addCents(segment.memoTotalsCents, memo, promoCents);
      }

      for (const fee of toFeeComponents(item.ItemFeeAdjustmentList)) {
        const feeType = typeof fee.FeeType === 'string' ? fee.FeeType : '';
        const feeAmount = fee.FeeAmount;
        if (!feeAmount) continue;
        const cents = moneyToCents(feeAmount, `Refund fee ${feeType}`);
        if (cents === 0) continue;

        const memo = feeTypeMemoForRefund(feeType);
        if (!memo) {
          throw new Error(`Unhandled refund fee type: ${feeType}`);
        }
        addCents(segment.memoTotalsCents, memo, cents);

        if (skuRaw !== '') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'us',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: 0,
            description: memo,
            netCents: cents,
          });
        }
      }

      for (const withheld of toWithheldComponents(item.ItemTaxWithheldList)) {
        for (const w of toChargeComponents(withheld.TaxesWithheld)) {
          const chargeType = typeof w.ChargeType === 'string' ? w.ChargeType : '';
          const chargeAmount = w.ChargeAmount;
          if (!chargeAmount) continue;
          const cents = moneyToCents(chargeAmount, `Refund withheld tax ${chargeType}`);
          if (cents === 0) continue;

          const memo = withheldChargeMemo(chargeType, 'refund');
          if (!memo) {
            throw new Error(`Unhandled refund withheld tax charge type: ${chargeType}`);
          }
          addCents(segment.memoTotalsCents, memo, cents);
        }
      }
    }
  }

  // Product ads payments
  for (const ad of input.events.ProductAdsPaymentEventList ?? []) {
    const postedDateRaw = (ad as { postedDate?: string }).postedDate;
    if (typeof postedDateRaw !== 'string' || postedDateRaw.trim() === '') {
      throw new Error('Missing postedDate for ProductAdsPaymentEvent');
    }

    const localIsoDay = isoTimestampToZonedIsoDay(postedDateRaw, timeZone, 'ProductAdsPaymentEvent.postedDate');
    const yearMonth = isoDayToYearMonth(localIsoDay, 'Product ads day');
    const segmentIdx = resolveSegmentIndexByYearMonth(segments, yearMonth, segmentLookupOptions);
    const segment = segments[segmentIdx]!;

    const value = (ad as { transactionValue?: unknown }).transactionValue as { CurrencyCode?: string; CurrencyAmount?: number } | undefined;
    if (!value) continue;
    const cents = moneyToCents(value as any, 'ProductAdsPaymentEvent.transactionValue');
    if (cents === 0) continue;

    const memo = 'Amazon Advertising Costs - Cost of Advertising';
    addCents(segment.memoTotalsCents, memo, cents);
    segment.auditRows.push({
      invoiceId: segment.docNumber,
      market: 'us',
      date: localIsoDay,
      orderId: '',
      sku: '',
      quantity: 0,
      description: memo,
      netCents: cents,
    });
  }

  // Adjustments (reserves + reimbursements)
  for (const adj of input.events.AdjustmentEventList ?? []) {
    const postedDate = requirePostedDate(adj.PostedDate, 'AdjustmentEvent');
    const localIsoDay = isoTimestampToZonedIsoDay(postedDate, timeZone, 'AdjustmentEvent.PostedDate');
    const yearMonth = isoDayToYearMonth(localIsoDay, 'Adjustment day');
    const segmentIdx = resolveSegmentIndexByYearMonth(segments, yearMonth, segmentLookupOptions);
    const segment = segments[segmentIdx]!;

    const amount = adj.AdjustmentAmount;
    if (!amount) continue;
    const cents = moneyToCents(amount, `Adjustment ${String(adj.AdjustmentType)}`);
    if (cents === 0) continue;

    const memo = adjustmentMemo(adj);
    if (!memo) {
      throw new Error(`Unhandled adjustment type: ${String(adj.AdjustmentType)}`);
    }

    addCents(segment.memoTotalsCents, memo, cents);
    segment.auditRows.push({
      invoiceId: segment.docNumber,
      market: 'us',
      date: localIsoDay,
      orderId: '',
      sku: '',
      quantity: 0,
      description: memo,
      netCents: cents,
    });
  }

  // Service fees (no PostedDate; assign to last segment)
  for (const event of input.events.ServiceFeeEventList ?? []) {
    const fees = event.FeeList ?? [];
    for (const fee of fees) {
      const feeType = typeof fee.FeeType === 'string' ? fee.FeeType : '';
      const feeAmount = fee.FeeAmount;
      if (!feeAmount) continue;
      const cents = moneyToCents(feeAmount, `Service fee ${feeType}`);
      if (cents === 0) continue;

      const memo = serviceFeeMemo(feeType);
      if (!memo) {
        throw new Error(`Unhandled service fee type: ${feeType}`);
      }
      addCents(lastSegment.memoTotalsCents, memo, cents);
      lastSegment.auditRows.push({
        invoiceId: lastSegment.docNumber,
        market: 'us',
        date: lastSegment.endIsoDay,
        orderId: '',
        sku: '',
        quantity: 0,
        description: memo,
        netCents: cents,
      });
    }
  }

  // Adhoc disbursements (micro deposit)
  for (const event of input.events.AdhocDisbursementEventList ?? []) {
    const postedDate = requirePostedDate(event.PostedDate, 'AdhocDisbursementEvent');
    const localIsoDay = isoTimestampToZonedIsoDay(postedDate, timeZone, 'AdhocDisbursementEvent.PostedDate');
    const yearMonth = isoDayToYearMonth(localIsoDay, 'Adhoc disbursement day');
    const segmentIdx = resolveSegmentIndexByYearMonth(segments, yearMonth, segmentLookupOptions);
    const segment = segments[segmentIdx]!;

    const txType = typeof event.TransactionType === 'string' ? event.TransactionType : '';
    const amount = event.TransactionAmount;
    if (!amount) continue;
    const cents = moneyToCents(amount, `Adhoc disbursement ${txType}`);
    if (cents === 0) continue;

    const memo = microDisbursementMemo(txType);
    if (!memo) {
      throw new Error(`Unhandled adhoc disbursement type: ${txType}`);
    }
    addCents(segment.memoTotalsCents, memo, cents);
    segment.auditRows.push({
      invoiceId: segment.docNumber,
      market: 'us',
      date: localIsoDay,
      orderId: '',
      sku: '',
      quantity: 0,
      description: memo,
      netCents: cents,
    });
  }

  // Debt recovery (successful charge + repayment of negative balance)
  const debtRecoveryEvents = input.events.DebtRecoveryEventList as Array<Record<string, unknown>> | undefined;
  for (const event of Array.isArray(debtRecoveryEvents) ? debtRecoveryEvents : []) {
    const recoveryAmount = (event.RecoveryAmount as { CurrencyCode?: string; CurrencyAmount?: number } | undefined) ?? undefined;
    if (recoveryAmount) {
      const cents = moneyToCents(recoveryAmount as any, 'DebtRecovery.RecoveryAmount');
      if (cents !== 0) {
        addCents(lastSegment.memoTotalsCents, 'Amazon Reserved Balances - Successful charge', cents);
        lastSegment.auditRows.push({
          invoiceId: lastSegment.docNumber,
          market: 'us',
          date: lastSegment.endIsoDay,
          orderId: '',
          sku: '',
          quantity: 0,
          description: 'Amazon Reserved Balances - Successful charge',
          netCents: cents,
        });
      }
    }

    const items = (event.DebtRecoveryItemList as Array<Record<string, unknown>> | undefined) ?? undefined;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const groupEnd = typeof item.GroupEndDate === 'string' ? item.GroupEndDate : null;
      if (!groupEnd) continue;
      if (groupEnd > groupStartTs) continue;

      const originalAmount = item.OriginalAmount as { CurrencyCode?: string; CurrencyAmount?: number } | undefined;
      if (!originalAmount) continue;
      const cents = moneyToCents(originalAmount as any, 'DebtRecovery.OriginalAmount');
      if (cents === 0) continue;

      addCents(lastSegment.memoTotalsCents, 'Amazon Reserved Balances - Repayment of negative Amazon balance', cents);
      lastSegment.auditRows.push({
        invoiceId: lastSegment.docNumber,
        market: 'us',
        date: lastSegment.endIsoDay,
        orderId: '',
        sku: '',
        quantity: 0,
        description: 'Amazon Reserved Balances - Repayment of negative Amazon balance',
        netCents: cents,
      });
    }
  }

  // Validate totals: sum of memo totals across segments should equal OriginalTotal.
  let totalEventCents = 0;
  for (const segment of segments) {
    totalEventCents += sumMap(segment.memoTotalsCents);
  }

  if (totalEventCents !== originalTotalCents) {
    throw new Error(`Settlement totals mismatch for ${input.settlementId}: events=${totalEventCents} vs OriginalTotal=${originalTotalCents}`);
  }

  // Split-month rollovers to make each segment JE balance, matching LMB behavior.
  if (segments.length > 1) {
    let priorTotal = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const segmentTotal = sumMap(segment.memoTotalsCents);

      if (i < segments.length - 1) {
        addCents(segment.memoTotalsCents, 'Split month settlement - balance of this invoice rolled forward', -segmentTotal);
        priorTotal += segmentTotal;
        continue;
      }

      addCents(segment.memoTotalsCents, 'Split month settlement - balance of previous invoice(s) rolled forward', priorTotal);
    }
  }

  return {
    settlementId: input.settlementId,
    eventGroupId: input.eventGroupId,
    timeZone,
    originalTotalCents,
    segments,
  };
}

export type QboJournalLineDraft = {
  accountId: string;
  postingType: 'Debit' | 'Credit';
  amount: number;
  description: string;
};

export type QboJournalEntryDraft = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: QboJournalLineDraft[];
};

function postingForNonBank(cents: number): { postingType: 'Debit' | 'Credit'; amount: number } {
  const abs = Math.abs(cents);
  const amount = abs / 100;
  return cents > 0 ? { postingType: 'Credit', amount } : { postingType: 'Debit', amount };
}

export function buildQboJournalEntriesFromUsSettlementDraft(input: {
  draft: UsSettlementDraft;
  privateNote: string;
  bankAccountId: string;
  paymentAccountId: string;
  accountIdByMemo: Map<string, string>;
}): QboJournalEntryDraft[] {
  const entries: QboJournalEntryDraft[] = [];

  for (let i = 0; i < input.draft.segments.length; i++) {
    const segment = input.draft.segments[i]!;
    const lines: QboJournalLineDraft[] = [];

    for (const [memo, cents] of segment.memoTotalsCents.entries()) {
      if (cents === 0) continue;
      const accountId = input.accountIdByMemo.get(memo);
      if (!accountId) {
        throw new Error(`Missing account mapping for memo: ${memo}`);
      }

      const posting = postingForNonBank(cents);
      lines.push({
        accountId,
        postingType: posting.postingType,
        amount: posting.amount,
        description: memo,
      });
    }

    const isLast = i === input.draft.segments.length - 1;
    if (isLast && input.draft.originalTotalCents !== 0) {
      const cents = input.draft.originalTotalCents;
      const abs = Math.abs(cents);
      const amount = abs / 100;

      if (cents > 0) {
        lines.push({
          accountId: input.bankAccountId,
          postingType: 'Debit',
          amount,
          description: 'Transfer to Bank',
        });
      } else {
        lines.push({
          accountId: input.paymentAccountId,
          postingType: 'Credit',
          amount,
          description: 'Payment to Amazon',
        });
      }
    }

    entries.push({
      txnDate: segment.txnDate,
      docNumber: segment.docNumber,
      privateNote: input.privateNote,
      lines,
    });
  }

  return entries;
}
