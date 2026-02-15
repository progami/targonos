import type { TenantCode } from '@targon/amazon-sp-api';

export type { TenantCode };

export type SpApiMoney = {
  CurrencyCode?: string;
  CurrencyAmount?: number;
  Amount?: string;
};

export type SpApiTransactionRelatedIdentifier = {
  relatedIdentifierName?: string;
  relatedIdentifierValue?: string;
};

export type SpApiTransaction = {
  transactionType?: string;
  transactionId?: string;
  postedDate?: string;
  marketplaceDetails?: {
    marketplaceId?: string;
  };
  relatedIdentifiers?: SpApiTransactionRelatedIdentifier[];
};

export type SpApiListTransactionsResponse = {
  transactions?: SpApiTransaction[];
  nextToken?: string;
};

export type SpApiFinancialEventGroup = {
  FinancialEventGroupId?: string;
  ProcessingStatus?: string;
  FundTransferStatus?: string;
  OriginalTotal?: SpApiMoney;
  BeginningBalance?: SpApiMoney;
  FinancialEventGroupStart?: string;
  FinancialEventGroupEnd?: string;
};

export type SpApiListFinancialEventGroupsResponse = {
  FinancialEventGroupList?: SpApiFinancialEventGroup[];
  NextToken?: string;
};

export type SpApiChargeComponent = {
  ChargeType?: string;
  ChargeAmount?: SpApiMoney;
};

export type SpApiFeeComponent = {
  FeeType?: string;
  FeeAmount?: SpApiMoney;
};

export type SpApiPromotion = {
  PromotionType?: string;
  PromotionAmount?: SpApiMoney;
};

export type SpApiTaxWithheldComponent = {
  TaxCollectionModel?: string;
  TaxesWithheld?: SpApiChargeComponent[];
  ChargeComponent?: SpApiChargeComponent;
  ChargeComponentList?: SpApiChargeComponent[];
};

export type SpApiShipmentItem = {
  SellerSKU?: string;
  QuantityShipped?: number;
  OrderItemId?: string;
  ItemChargeList?: SpApiChargeComponent[];
  ItemFeeList?: SpApiFeeComponent[];
  PromotionList?: SpApiPromotion[];
  ItemTaxWithheldList?: SpApiTaxWithheldComponent[];
};

export type SpApiShipmentEvent = {
  PostedDate?: string;
  AmazonOrderId?: string;
  ShipmentItemList?: SpApiShipmentItem[];
};

export type SpApiRefundEvent = {
  PostedDate?: string;
  AmazonOrderId?: string;
  ShipmentItemAdjustmentList?: Array<{
    SellerSKU?: string;
    QuantityShipped?: number;
    OrderAdjustmentItemId?: string;
    ItemChargeAdjustmentList?: SpApiChargeComponent[];
    ItemFeeAdjustmentList?: SpApiFeeComponent[];
    PromotionAdjustmentList?: SpApiPromotion[];
    ItemTaxWithheldList?: SpApiTaxWithheldComponent[];
  }>;
};

export type SpApiAdjustmentEvent = {
  PostedDate?: string;
  AdjustmentType?: string;
  AdjustmentAmount?: SpApiMoney;
  // Not currently used, but present in some event types.
  AdjustmentItemList?: unknown[];
};

export type SpApiServiceFeeEvent = {
  FeeList?: SpApiFeeComponent[];
};

export type SpApiProductAdsPaymentEvent = {
  postedDate?: string;
  transactionType?: string;
  invoiceId?: string;
  baseValue?: SpApiMoney;
  taxValue?: SpApiMoney;
  transactionValue?: SpApiMoney;
};

export type SpApiFinancialEvents = {
  ShipmentEventList?: SpApiShipmentEvent[];
  RefundEventList?: SpApiRefundEvent[];
  AdjustmentEventList?: SpApiAdjustmentEvent[];
  ServiceFeeEventList?: SpApiServiceFeeEvent[];
  ProductAdsPaymentEventList?: SpApiProductAdsPaymentEvent[];
  AdhocDisbursementEventList?: Array<{
    TransactionType?: string;
    PostedDate?: string;
    TransactionAmount?: SpApiMoney;
  }>;
  DebtRecoveryEventList?: unknown[];
  ChargebackEventList?: unknown[];
};

export type SpApiListFinancialEventsByGroupIdResponse = {
  FinancialEvents?: SpApiFinancialEvents;
  NextToken?: string;
};
