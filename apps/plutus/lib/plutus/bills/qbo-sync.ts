import { buildManufacturingDescription } from '@/lib/plutus/bills/split';

export type BillMappingLineForSync = {
  qboLineId: string;
  component: string;
  sku: string | null;
  quantity: number | null;
};

export function buildManufacturingLineDescriptionsFromMappings(
  qboBillId: string,
  lines: BillMappingLineForSync[],
): Array<{ lineId: string; description: string }> {
  return lines
    .filter((line) => line.component === 'manufacturing')
    .map((line) => {
      if (!line.sku || !line.quantity || line.quantity <= 0) {
        throw new Error(`Manufacturing line mapping missing sku/quantity: billId=${qboBillId} lineId=${line.qboLineId}`);
      }
      return {
        lineId: line.qboLineId,
        description: buildManufacturingDescription(line.sku, line.quantity),
      };
    });
}
