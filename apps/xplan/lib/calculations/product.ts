import { coerceNumber } from '@/lib/utils/numbers';
import { ProductInput } from './types';

export interface ProductCostSummary {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
  tariffCost: number;
  advertisingCost: number;
  landedUnitCost: number;
  grossContribution: number;
  grossMarginPercent: number;
}

export function computeProductCostSummary(product: ProductInput): ProductCostSummary {
  const sellingPrice = coerceNumber(product.sellingPrice);
  const manufacturingCost = coerceNumber(product.manufacturingCost);
  const freightCost = coerceNumber(product.freightCost);
  const tariffRate = coerceNumber(product.tariffRate);
  const tacosPercent = coerceNumber(product.tacosPercent);
  const fbaFee = coerceNumber(product.fbaFee);
  const amazonReferralRate = coerceNumber(product.amazonReferralRate);
  const storagePerMonth = coerceNumber(product.storagePerMonth);

  const tariffCost = manufacturingCost * tariffRate;
  const advertisingCost = sellingPrice * tacosPercent;
  const landedUnitCost = manufacturingCost + freightCost + tariffCost;
  const grossContribution = sellingPrice - landedUnitCost - advertisingCost;
  const grossMarginPercent = sellingPrice === 0 ? 0 : grossContribution / sellingPrice;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    sellingPrice,
    manufacturingCost,
    freightCost,
    tariffRate,
    tacosPercent,
    fbaFee,
    amazonReferralRate,
    storagePerMonth,
    tariffCost,
    advertisingCost,
    landedUnitCost,
    grossContribution,
    grossMarginPercent,
  };
}

export function buildProductCostIndex(products: ProductInput[]): Map<string, ProductCostSummary> {
  return new Map(products.map((product) => [product.id, computeProductCostSummary(product)]));
}
