type PurchaseOrderSource = {
  sourceSystem?: string | null;
  notes?: string | null;
};

export function purchaseOrderSourceType(source: PurchaseOrderSource): string {
  const sourceSystem = source.sourceSystem?.trim().toUpperCase();
  if (sourceSystem === 'TALOS') return 'Talos';

  const notes = source.notes?.trim();
  if (notes?.startsWith('Migrated from ')) return 'Migration';

  return 'XPLAN';
}
