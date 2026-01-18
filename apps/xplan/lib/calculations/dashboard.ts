import { CashFlowWeekDerived, ProfitAndLossWeekDerived } from './finance';
import { ProductCostSummary } from './product';
import { PurchaseOrderDerived } from './ops';
import { SalesWeekDerived } from './sales';

export interface PipelineBucket {
  status: string;
  quantity: number;
}

export interface InventorySnapshot {
  productId: string;
  productName: string;
  stockEnd: number;
  stockWeeks: number;
}

export interface DashboardSummary {
  revenueYtd: number;
  netProfitYtd: number;
  cashBalance: number;
  netMarginPercent: number;
  pipeline: PipelineBucket[];
  inventory: InventorySnapshot[];
}

export function computeDashboardSummary(
  pnl: ProfitAndLossWeekDerived[],
  cash: CashFlowWeekDerived[],
  purchaseOrders: PurchaseOrderDerived[],
  sales: SalesWeekDerived[],
  products: Map<string, ProductCostSummary>,
): DashboardSummary {
  const revenueYtd = pnl.reduce((sum, row) => sum + row.revenue, 0);
  const netProfitYtd = pnl.reduce((sum, row) => sum + row.netProfit, 0);
  const cashBalance = cash.length ? cash[cash.length - 1].cashBalance : 0;
  const netMarginPercent = revenueYtd === 0 ? 0 : (netProfitYtd / revenueYtd) * 100;

  const pipelineMap = new Map<string, number>();
  for (const order of purchaseOrders) {
    pipelineMap.set(order.status, (pipelineMap.get(order.status) ?? 0) + order.quantity);
  }
  const pipeline: PipelineBucket[] = Array.from(pipelineMap.entries()).map(
    ([status, quantity]) => ({
      status,
      quantity,
    }),
  );

  const latestSalesByProduct = new Map<string, SalesWeekDerived>();
  for (const row of sales) {
    const existing = latestSalesByProduct.get(row.productId);
    if (!existing || row.weekNumber > existing.weekNumber) {
      latestSalesByProduct.set(row.productId, row);
    }
  }

  const inventory: InventorySnapshot[] = [];
  for (const [productId, product] of products.entries()) {
    const latest = latestSalesByProduct.get(productId);
    inventory.push({
      productId,
      productName: product.name,
      stockEnd: latest?.stockEnd ?? 0,
      stockWeeks: latest?.stockWeeks ?? 0,
    });
  }

  return {
    revenueYtd,
    netProfitYtd,
    cashBalance,
    netMarginPercent,
    pipeline,
    inventory,
  };
}
