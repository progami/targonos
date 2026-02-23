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

export type UkSettlementSegmentDraft = {
  seq: number;
  yearMonth: string;
  startIsoDay: string;
  endIsoDay: string;
  txnDate: string;
  docNumber: string;
  memoTotalsCents: Map<string, number>;
  auditRows: UkSettlementAuditRowDraft[];
};

export type UkSettlementAuditRowDraft = {
  invoiceId: string;
  market: 'uk';
  date: string; // YYYY-MM-DD (local)
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  netCents: number;
};

export type UkSettlementDraft = {
  settlementId: string;
  eventGroupId: string;
  timeZone: string;
  originalTotalCents: number;
  segments: UkSettlementSegmentDraft[];
};

const UK_TIME_ZONE = 'Europe/London';

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

function buildUkSettlementDocNumber(input: { startIsoDay: string; endIsoDay: string; seq: number }): string {
  const start = parseIsoDayParts(input.startIsoDay, 'segment start');
  const end = parseIsoDayParts(input.endIsoDay, 'segment end');

  const month = MONTH_ABBR[end.month];
  if (!month) {
    throw new Error(`Invalid month for doc number: ${end.month}`);
  }

  const startToken = pad2(start.day);
  const endToken = `${pad2(end.day)}${month}`;
  const yearToken = String(end.year).slice(-2);

  return `UK-${startToken}-${endToken}-${yearToken}-${input.seq}`;
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

type OrderScope = 'Domestic Orders' | 'International Orders';

function orderScopeFromMarketplaceName(marketplaceName: unknown): OrderScope {
  if (typeof marketplaceName !== 'string' || marketplaceName.trim() === '') {
    return 'Domestic Orders';
  }
  const normalized = marketplaceName.trim().toLowerCase();
  if (normalized === 'amazon.co.uk') return 'Domestic Orders';
  return 'International Orders';
}

function salesMemo(input: {
  kind: 'Principal' | 'Shipping' | 'Shipping Promotion' | 'Promotional Discounts';
  brandLabel: string;
  marketplaceVatResponsible: boolean;
}): string {
  const suffix = input.marketplaceVatResponsible ? ' (Marketplace VAT Responsible)' : '';
  return `Amazon Sales - ${input.kind}${suffix} - ${input.brandLabel}`;
}

function refundMemo(input: {
  kind: 'Refunded Principal' | 'Refunded Shipping' | 'Refunded Shipping Promotion' | 'Refunded Promotional Discounts';
  brandLabel: string;
  marketplaceVatResponsible: boolean;
}): string {
  const suffix = input.marketplaceVatResponsible ? ' (Marketplace VAT Responsible)' : '';
  return `Amazon Refunds - ${input.kind}${suffix} - ${input.brandLabel}`;
}

function feeTypeMemoForShipment(input: { feeType: string; scope: OrderScope }): string | null {
  if (input.feeType === 'Commission') return 'Amazon Seller Fees - Commission';
  if (input.feeType === 'DigitalServicesFee' || input.feeType === 'DigitalServicesFeeFBA')
    return 'Amazon Seller Fees - Digital Services Fee';
  if (input.feeType === 'FBAPerUnitFulfillmentFee') return `Amazon FBA Fees - FBA Per Unit Fulfilment Fee - ${input.scope}`;
  if (input.feeType === 'ShippingChargeback') return `Amazon FBA Fees - Shipping Chargeback - ${input.scope}`;
  if (input.feeType === 'SalesTaxCollectionFee') return null;
  if (input.feeType === 'FixedClosingFee') return null;
  if (input.feeType === 'VariableClosingFee') return null;
  if (input.feeType === 'GiftwrapChargeback') return null;
  if (input.feeType === 'FBAPerOrderFulfillmentFee') return null;
  if (input.feeType === 'FBAWeightBasedFee') return null;
  return null;
}

function feeTypeMemoForRefund(input: { feeType: string; scope: OrderScope }): string | null {
  if (input.feeType === 'Commission') return 'Amazon Seller Fees - Refunded Commission';
  if (input.feeType === 'RefundCommission') return 'Amazon Seller Fees - Refund Commission';
  if (input.feeType === 'DigitalServicesFee' || input.feeType === 'DigitalServicesFeeFBA')
    return 'Amazon Seller Fees - Refunded Digital Services Fee';
  if (input.feeType === 'ShippingChargeback') return `Amazon FBA Fees - Refunded Shipping Chargeback - ${input.scope}`;
  if (input.feeType === 'SalesTaxCollectionFee') return null;
  if (input.feeType === 'FixedClosingFee') return null;
  if (input.feeType === 'VariableClosingFee') return null;
  if (input.feeType === 'GiftwrapChargeback') return null;
  return null;
}

function serviceFeeMemo(feeType: string): string | null {
  if (feeType === 'Subscription') return 'Amazon Seller Fees - Subscription Fee';
  if (feeType === 'FBAInboundTransportationFee') return 'Amazon FBA Fees - FBA Inbound Transportation Fee - Domestic Orders';
  if (feeType === 'FBAInboundTransportationProgramFee')
    return 'Amazon FBA Fees - FBA Inbound Transportation Program Fee - Domestic Orders';
  if (feeType === 'AmazonUpstreamProcessingFee') return 'Amazon FBA Fees - AWD Processing Fee';
  if (feeType === 'AmazonUpstreamStorageTransportationFee') return 'Amazon FBA Fees - AWD Transportation Fee';
  if (feeType === 'FBAPerUnitFulfillmentFee') return 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment - Domestic Orders';
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
  if (type === 'REVERSAL_REIMBURSEMENT')
    return 'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Reversal Reimbursement';
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

type MarketplaceVatWithheldSummary = {
  marketplaceVatResponsible: boolean;
  withheldVatPrincipalCents: number;
  withheldVatShippingCents: number;
};

function computeMarketplaceVatWithheldSummary(input: {
  withheldComponents: SpApiTaxWithheldComponent[];
  context: string;
}): MarketplaceVatWithheldSummary {
  let marketplaceVatResponsible = false;
  let withheldVatPrincipalCents = 0;
  let withheldVatShippingCents = 0;

  for (const withheld of input.withheldComponents) {
    const model = (withheld as { TaxCollectionModel?: unknown }).TaxCollectionModel;
    if (model === 'MarketplaceFacilitator') {
      marketplaceVatResponsible = true;
    }

    for (const w of toChargeComponents(withheld.TaxesWithheld)) {
      const chargeType = typeof w.ChargeType === 'string' ? w.ChargeType : '';
      const chargeAmount = w.ChargeAmount;
      if (!chargeAmount) continue;
      const cents = moneyToCents(chargeAmount, `${input.context} withheld tax ${chargeType}`);
      if (cents === 0) continue;

      if (chargeType === 'MarketplaceFacilitatorVAT-Principal' || chargeType === 'MarketplaceFacilitatorTax-Principal') {
        withheldVatPrincipalCents += cents;
        continue;
      }
      if (chargeType === 'MarketplaceFacilitatorVAT-Shipping' || chargeType === 'MarketplaceFacilitatorTax-Shipping') {
        withheldVatShippingCents += cents;
        continue;
      }

      throw new Error(`Unhandled withheld tax charge type: ${chargeType}`);
    }
  }

  return {
    marketplaceVatResponsible: marketplaceVatResponsible || withheldVatPrincipalCents !== 0 || withheldVatShippingCents !== 0,
    withheldVatPrincipalCents,
    withheldVatShippingCents,
  };
}

function removeOneMatchingCents(values: number[], target: number): boolean {
  const idx = values.findIndex((v) => v === target);
  if (idx === -1) return false;
  values.splice(idx, 1);
  return true;
}

function splitPromotionCentsByShipping(input: {
  promoTotalCents: number;
  shippingCents: number;
}): { shippingPromoCents: number; discountPromoCents: number } {
  const promoTotalCents = input.promoTotalCents;
  if (promoTotalCents === 0) return { shippingPromoCents: 0, discountPromoCents: 0 };

  const promoAbs = Math.abs(promoTotalCents);
  const shippingAbs = Math.abs(input.shippingCents);
  const shippingPromoAbs = Math.min(promoAbs, shippingAbs);
  const sign = promoTotalCents < 0 ? -1 : 1;
  const shippingPromoCents = sign * shippingPromoAbs;
  return { shippingPromoCents, discountPromoCents: promoTotalCents - shippingPromoCents };
}

function resolveSegmentIndexByYearMonth(
  segments: UkSettlementSegmentDraft[],
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

export function buildUkSettlementDraftFromSpApiFinances(input: {
  settlementId: string;
  eventGroupId: string;
  eventGroup: SpApiFinancialEventGroup;
  events: SpApiFinancialEvents;
  skuToBrandName: Map<string, string>;
  brandLabelByBrandName?: Map<string, string>;
  timeZone?: string;
}): UkSettlementDraft {
  const timeZone = input.timeZone === undefined ? UK_TIME_ZONE : input.timeZone;

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

  const segments: UkSettlementSegmentDraft[] = [];
  let year = startParts.year;
  let month = startParts.month;
  let seq = 1;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const yearMonth = `${year}-${pad2(month)}`;
    const segStartDay = year === startParts.year && month === startParts.month ? startParts.day : 1;
    const segEndDay = year === endParts.year && month === endParts.month ? endParts.day : lastDayOfMonth(year, month);
    const segStartIsoDay = `${year}-${pad2(month)}-${pad2(segStartDay)}`;
    const segEndIsoDay = `${year}-${pad2(month)}-${pad2(segEndDay)}`;
    const docNumber = buildUkSettlementDocNumber({ startIsoDay: segStartIsoDay, endIsoDay: segEndIsoDay, seq });

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
    const scope = orderScopeFromMarketplaceName((shipment as { MarketplaceName?: unknown }).MarketplaceName);

    for (const item of items) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU : '';
      const qty = typeof item.QuantityShipped === 'number' && Number.isInteger(item.QuantityShipped) ? item.QuantityShipped : 0;
      const brandName = skuRaw === '' ? '' : brandNameForSku(skuRaw, input.skuToBrandName);
      const brandLabel = brandName === '' ? '' : brandLabelForName(brandName, input.brandLabelByBrandName);

      let principalCents = 0;
      let taxCents = 0;
      let shippingCents = 0;
      let shippingTaxCents = 0;

      for (const charge of toChargeComponents(item.ItemChargeList)) {
        const chargeType = typeof charge.ChargeType === 'string' ? charge.ChargeType : '';
        const chargeAmount = charge.ChargeAmount;
        if (!chargeAmount) continue;
        const cents = moneyToCents(chargeAmount, `Shipment charge ${chargeType}`);
        if (cents === 0) continue;

        if (chargeType === 'Principal') {
          principalCents += cents;
          continue;
        }
        if (chargeType === 'Tax') {
          taxCents += cents;
          continue;
        }
        if (chargeType === 'ShippingCharge') {
          shippingCents += cents;
          continue;
        }
        if (chargeType === 'ShippingTax') {
          shippingTaxCents += cents;
          continue;
        }

        throw new Error(`Unhandled shipment charge type: ${chargeType}`);
      }

      const withheldSummary = computeMarketplaceVatWithheldSummary({
        withheldComponents: toWithheldComponents(item.ItemTaxWithheldList),
        context: 'Shipment',
      });
      const marketplaceVatResponsible = withheldSummary.marketplaceVatResponsible;

      const promoCentsList = toPromotions(item.PromotionList)
        .map((promo) => {
          const amount = promo.PromotionAmount;
          return amount ? moneyToCents(amount, 'Shipment promotion') : 0;
        })
        .filter((cents) => cents !== 0);

      const promoWorkingCentsList = promoCentsList.slice();
      let taxPromoCents = 0;
      let shippingTaxPromoCents = 0;

      if (marketplaceVatResponsible) {
        if (taxCents !== 0 && removeOneMatchingCents(promoWorkingCentsList, -taxCents)) {
          taxPromoCents = -taxCents;
        }
        if (shippingTaxCents !== 0 && removeOneMatchingCents(promoWorkingCentsList, -shippingTaxCents)) {
          shippingTaxPromoCents = -shippingTaxCents;
        }

        const principalVatDelta = taxCents + taxPromoCents + withheldSummary.withheldVatPrincipalCents;
        if (principalVatDelta !== 0) {
          throw new Error(
            `Marketplace VAT mismatch (Principal): tax=${taxCents} promo=${taxPromoCents} withheld=${withheldSummary.withheldVatPrincipalCents} orderId=${orderId} sku=${skuRaw}`,
          );
        }

        const shippingVatDelta = shippingTaxCents + shippingTaxPromoCents + withheldSummary.withheldVatShippingCents;
        if (shippingVatDelta !== 0) {
          throw new Error(
            `Marketplace VAT mismatch (Shipping): tax=${shippingTaxCents} promo=${shippingTaxPromoCents} withheld=${withheldSummary.withheldVatShippingCents} orderId=${orderId} sku=${skuRaw}`,
          );
        }
      } else if (withheldSummary.withheldVatPrincipalCents !== 0 || withheldSummary.withheldVatShippingCents !== 0) {
        throw new Error(
          `Unexpected withheld VAT for non-marketplace-VAT order: principal=${withheldSummary.withheldVatPrincipalCents} shipping=${withheldSummary.withheldVatShippingCents} orderId=${orderId} sku=${skuRaw}`,
        );
      }

      const principalNetCents = marketplaceVatResponsible ? principalCents : principalCents + taxCents;
      const shippingNetCents = marketplaceVatResponsible ? shippingCents : shippingCents + shippingTaxCents;

      if (brandLabel === '' && (principalNetCents !== 0 || shippingNetCents !== 0)) {
        throw new Error(`Missing SKU/brand for shipment item with non-zero charges (orderId=${orderId})`);
      }

      if (principalNetCents !== 0) {
        const memo = salesMemo({ kind: 'Principal', brandLabel, marketplaceVatResponsible });
        addCents(segment.memoTotalsCents, memo, principalNetCents);
        segment.auditRows.push({
          invoiceId: segment.docNumber,
          market: 'uk',
          date: localIsoDay,
          orderId,
          sku: skuRaw,
          quantity: qty,
          description: memo,
          netCents: principalNetCents,
        });
      }

      if (shippingNetCents !== 0) {
        const memo = salesMemo({ kind: 'Shipping', brandLabel, marketplaceVatResponsible });
        addCents(segment.memoTotalsCents, memo, shippingNetCents);
      }

      if (promoWorkingCentsList.length > 0) {
        const promoTotalCents = promoWorkingCentsList.reduce((sum, c) => sum + c, 0);
        if (promoTotalCents !== 0) {
          const split = splitPromotionCentsByShipping({ promoTotalCents, shippingCents: shippingNetCents });

          if (split.shippingPromoCents !== 0) {
            addCents(
              segment.memoTotalsCents,
              salesMemo({ kind: 'Shipping Promotion', brandLabel, marketplaceVatResponsible }),
              split.shippingPromoCents,
            );
          }

          if (split.discountPromoCents !== 0) {
            addCents(
              segment.memoTotalsCents,
              salesMemo({ kind: 'Promotional Discounts', brandLabel, marketplaceVatResponsible }),
              split.discountPromoCents,
            );
          }
        }
      }

      for (const fee of toFeeComponents(item.ItemFeeList)) {
        const feeType = typeof fee.FeeType === 'string' ? fee.FeeType : '';
        const feeAmount = fee.FeeAmount;
        if (!feeAmount) continue;
        const cents = moneyToCents(feeAmount, `Shipment fee ${feeType}`);
        if (cents === 0) continue;

        const memo = feeTypeMemoForShipment({ feeType, scope });
        if (!memo) {
          throw new Error(`Unhandled shipment fee type: ${feeType}`);
        }
        addCents(segment.memoTotalsCents, memo, cents);

        if (skuRaw !== '') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'uk',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: 0,
            description: memo,
            netCents: cents,
          });
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
    const scope = orderScopeFromMarketplaceName((refund as { MarketplaceName?: unknown }).MarketplaceName);

    for (const item of items) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU : '';
      const qtyRaw = typeof item.QuantityShipped === 'number' && Number.isInteger(item.QuantityShipped) ? item.QuantityShipped : 0;
      const qty = qtyRaw === 0 ? 0 : -qtyRaw;
      const brandName = skuRaw === '' ? '' : brandNameForSku(skuRaw, input.skuToBrandName);
      const brandLabel = brandName === '' ? '' : brandLabelForName(brandName, input.brandLabelByBrandName);

      let principalCents = 0;
      let taxCents = 0;
      let shippingCents = 0;
      let shippingTaxCents = 0;

      for (const charge of toChargeComponents(item.ItemChargeAdjustmentList)) {
        const chargeType = typeof charge.ChargeType === 'string' ? charge.ChargeType : '';
        const chargeAmount = charge.ChargeAmount;
        if (!chargeAmount) continue;
        const cents = moneyToCents(chargeAmount, `Refund charge ${chargeType}`);
        if (cents === 0) continue;

        if (chargeType === 'Principal') {
          principalCents += cents;
          continue;
        }
        if (chargeType === 'Tax') {
          taxCents += cents;
          continue;
        }
        if (chargeType === 'ShippingCharge') {
          shippingCents += cents;
          continue;
        }
        if (chargeType === 'ShippingTax') {
          shippingTaxCents += cents;
          continue;
        }

        throw new Error(`Unhandled refund charge type: ${chargeType}`);
      }

      const withheldSummary = computeMarketplaceVatWithheldSummary({
        withheldComponents: toWithheldComponents(item.ItemTaxWithheldList),
        context: 'Refund',
      });
      const marketplaceVatResponsible = withheldSummary.marketplaceVatResponsible;

      const promoCentsList = toPromotions(item.PromotionAdjustmentList)
        .map((promo) => {
          const amount = promo.PromotionAmount;
          return amount ? moneyToCents(amount, 'Refund promotion') : 0;
        })
        .filter((cents) => cents !== 0);

      const promoWorkingCentsList = promoCentsList.slice();
      let taxPromoCents = 0;
      let shippingTaxPromoCents = 0;

      if (marketplaceVatResponsible) {
        if (taxCents !== 0 && removeOneMatchingCents(promoWorkingCentsList, -taxCents)) {
          taxPromoCents = -taxCents;
        }
        if (shippingTaxCents !== 0 && removeOneMatchingCents(promoWorkingCentsList, -shippingTaxCents)) {
          shippingTaxPromoCents = -shippingTaxCents;
        }

        const principalVatDelta = taxCents + taxPromoCents + withheldSummary.withheldVatPrincipalCents;
        if (principalVatDelta !== 0) {
          throw new Error(
            `Marketplace VAT mismatch (Principal): tax=${taxCents} promo=${taxPromoCents} withheld=${withheldSummary.withheldVatPrincipalCents} orderId=${orderId} sku=${skuRaw}`,
          );
        }

        const shippingVatDelta = shippingTaxCents + shippingTaxPromoCents + withheldSummary.withheldVatShippingCents;
        if (shippingVatDelta !== 0) {
          throw new Error(
            `Marketplace VAT mismatch (Shipping): tax=${shippingTaxCents} promo=${shippingTaxPromoCents} withheld=${withheldSummary.withheldVatShippingCents} orderId=${orderId} sku=${skuRaw}`,
          );
        }
      } else if (withheldSummary.withheldVatPrincipalCents !== 0 || withheldSummary.withheldVatShippingCents !== 0) {
        throw new Error(
          `Unexpected withheld VAT for non-marketplace-VAT refund: principal=${withheldSummary.withheldVatPrincipalCents} shipping=${withheldSummary.withheldVatShippingCents} orderId=${orderId} sku=${skuRaw}`,
        );
      }

      const principalNetCents = marketplaceVatResponsible ? principalCents : principalCents + taxCents;
      const shippingNetCents = marketplaceVatResponsible ? shippingCents : shippingCents + shippingTaxCents;

      if (brandLabel === '' && (principalNetCents !== 0 || shippingNetCents !== 0)) {
        throw new Error(`Missing SKU/brand for refund item with non-zero charges (orderId=${orderId})`);
      }

      if (principalNetCents !== 0) {
        const memo = refundMemo({ kind: 'Refunded Principal', brandLabel, marketplaceVatResponsible });
        addCents(segment.memoTotalsCents, memo, principalNetCents);
        segment.auditRows.push({
          invoiceId: segment.docNumber,
          market: 'uk',
          date: localIsoDay,
          orderId,
          sku: skuRaw,
          quantity: qty,
          description: memo,
          netCents: principalNetCents,
        });
      }

      if (shippingNetCents !== 0) {
        const memo = refundMemo({ kind: 'Refunded Shipping', brandLabel, marketplaceVatResponsible });
        addCents(segment.memoTotalsCents, memo, shippingNetCents);
      }

      if (promoWorkingCentsList.length > 0) {
        const promoTotalCents = promoWorkingCentsList.reduce((sum, c) => sum + c, 0);
        if (promoTotalCents !== 0) {
          const split = splitPromotionCentsByShipping({ promoTotalCents, shippingCents: shippingNetCents });

          if (split.shippingPromoCents !== 0) {
            addCents(
              segment.memoTotalsCents,
              refundMemo({ kind: 'Refunded Shipping Promotion', brandLabel, marketplaceVatResponsible }),
              split.shippingPromoCents,
            );
          }

          if (split.discountPromoCents !== 0) {
            addCents(
              segment.memoTotalsCents,
              refundMemo({ kind: 'Refunded Promotional Discounts', brandLabel, marketplaceVatResponsible }),
              split.discountPromoCents,
            );
          }
        }
      }

      for (const fee of toFeeComponents(item.ItemFeeAdjustmentList)) {
        const feeType = typeof fee.FeeType === 'string' ? fee.FeeType : '';
        const feeAmount = fee.FeeAmount;
        if (!feeAmount) continue;
        const cents = moneyToCents(feeAmount, `Refund fee ${feeType}`);
        if (cents === 0) continue;

        const memo = feeTypeMemoForRefund({ feeType, scope });
        if (!memo) {
          throw new Error(`Unhandled refund fee type: ${feeType}`);
        }
        addCents(segment.memoTotalsCents, memo, cents);

        if (skuRaw !== '') {
          segment.auditRows.push({
            invoiceId: segment.docNumber,
            market: 'uk',
            date: localIsoDay,
            orderId,
            sku: skuRaw,
            quantity: 0,
            description: memo,
            netCents: cents,
          });
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
      market: 'uk',
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
      market: 'uk',
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
        market: 'uk',
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
      market: 'uk',
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
          market: 'uk',
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
        market: 'uk',
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

  // Split-month rollovers to make each segment JE balance, matching legacy behavior.
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

export function buildQboJournalEntriesFromUkSettlementDraft(input: {
  draft: UkSettlementDraft;
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
