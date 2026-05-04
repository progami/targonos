export const WPR_CHANGE_CATEGORY_OPTIONS = [
  { value: 'CONTENT', label: 'Content' },
  { value: 'PRICING', label: 'Pricing' },
  { value: 'IMAGES', label: 'Images' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'CATALOG', label: 'Catalog' },
] as const;

export type WprChangeCategoryValue = (typeof WPR_CHANGE_CATEGORY_OPTIONS)[number]['value'];
export type WprChangeCategoryKey = WprChangeCategoryValue | 'MIXED';

export function normalizeWprChangeCategoryKey(value: string): WprChangeCategoryKey {
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case 'MANUAL':
      return 'CONTENT';
    case 'CONTENT':
      return 'CONTENT';
    case 'PRICING':
      return 'PRICING';
    case 'IMAGES':
      return 'IMAGES';
    case 'OFFER':
      return 'OFFER';
    case 'CATALOG':
      return 'CATALOG';
    case 'MIXED':
      return 'MIXED';
    default:
      throw new Error(`Unsupported WPR change category: ${value}`);
  }
}

export function expectWritableWprChangeCategory(value: string): WprChangeCategoryValue {
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case 'CONTENT':
      return 'CONTENT';
    case 'PRICING':
      return 'PRICING';
    case 'IMAGES':
      return 'IMAGES';
    case 'OFFER':
      return 'OFFER';
    case 'CATALOG':
      return 'CATALOG';
    default:
      throw new Error(`Invalid WPR change category: ${value}`);
  }
}

export function formatWprChangeCategory(value: string): string {
  const normalized = normalizeWprChangeCategoryKey(value);
  switch (normalized) {
    case 'CONTENT':
      return 'Content';
    case 'PRICING':
      return 'Pricing';
    case 'IMAGES':
      return 'Images';
    case 'OFFER':
      return 'Offer';
    case 'CATALOG':
      return 'Catalog';
    case 'MIXED':
      return 'Mixed';
  }
}

export function getWprChangeCategoryColor(value: string): string {
  const normalized = normalizeWprChangeCategoryKey(value);
  switch (normalized) {
    case 'CONTENT':
      return 'rgba(0, 194, 185, 0.75)';
    case 'PRICING':
      return 'rgba(255, 183, 77, 0.75)';
    case 'IMAGES':
      return 'rgba(129, 199, 132, 0.75)';
    case 'OFFER':
      return 'rgba(100, 181, 246, 0.75)';
    case 'CATALOG':
      return 'rgba(255, 138, 128, 0.75)';
    case 'MIXED':
      return 'rgba(186, 104, 200, 0.75)';
  }
}
