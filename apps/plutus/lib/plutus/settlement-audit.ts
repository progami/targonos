export type SettlementAuditRow = {
  invoiceId: string;
  market: string;
  date: string; // YYYY-MM-DD
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  net: number;
};

