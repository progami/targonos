export const REMOVED_PAYMENT_CATEGORY = '__REMOVED__';

export function isRemovedPaymentCategory(category: string | null | undefined): boolean {
  return category?.trim() === REMOVED_PAYMENT_CATEGORY;
}
