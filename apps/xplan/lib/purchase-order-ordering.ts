type DateLike = Date | string | null | undefined;

const orderCodeCollator = new Intl.Collator('en-US', {
  numeric: true,
  sensitivity: 'base',
});

function dateSortValue(value: DateLike): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function comparePurchaseOrderCodes(left: string, right: string): number {
  return orderCodeCollator.compare(left, right);
}

export function comparePurchaseOrderRows<T extends { orderCode: string; productionStart?: DateLike }>(
  left: T,
  right: T,
): number {
  const leftProductionStart = dateSortValue(left.productionStart);
  const rightProductionStart = dateSortValue(right.productionStart);
  if (leftProductionStart < rightProductionStart) return -1;
  if (leftProductionStart > rightProductionStart) return 1;
  return comparePurchaseOrderCodes(left.orderCode, right.orderCode);
}
