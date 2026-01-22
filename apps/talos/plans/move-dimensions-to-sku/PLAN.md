# Move Item Package Dimensions from Batch to SKU

**Author:** Claude  
**Created:** January 22, 2026 at 12:45 PM CST  
**Status:** In Progress

---

## Objective

Consolidate item package dimensions at the SKU level instead of the batch level. This removes duplication and simplifies the data model.

## Fields to Move

### From SkuBatch to SKU (remove from batch):
- `unitSide1Cm`, `unitSide2Cm`, `unitSide3Cm`
- `unitWeightKg`
- `unitDimensionsCm`

### Add to SKU (currently only on batch):
- `amazonItemPackageSide1Cm`, `amazonItemPackageSide2Cm`, `amazonItemPackageSide3Cm`
- `amazonItemPackageDimensionsCm`

---

## Tasks

- [ ] 1. Update Prisma schema - add amazonItemPackage fields to SKU
- [ ] 2. Create migration SQL to add columns to SKU
- [ ] 3. Create data migration to copy batch dimensions to SKU
- [ ] 4. Update Prisma schema - remove dimension fields from SkuBatch
- [ ] 5. Create migration SQL to drop columns from SkuBatch
- [ ] 6. Update `api/skus/[id]/batches/route.ts` - remove dimension handling
- [ ] 7. Update `api/skus/[id]/batches/[batchId]/route.ts` - remove dimension handling
- [ ] 8. Update `api/amazon/sync/route.ts` - write dimensions to SKU
- [ ] 9. Update `api/amazon/import-skus/route.ts` - write dimensions to SKU
- [ ] 10. Update `api/amazon/fba-fee-discrepancies/route.ts` - read from SKU
- [ ] 11. Update `sku-batches-modal.tsx` - remove dimension inputs
- [ ] 12. Update `skus-panel.tsx` - handle dimensions at SKU level
- [ ] 13. Update services (po-stage, fulfillment-order, movement-note)
- [ ] 14. Update seed scripts
- [ ] 15. Build and test
- [ ] 16. Deploy migrations to both US and UK schemas

---

## Affected Files

### Schema
- `prisma/schema.prisma`

### API Routes
- `src/app/api/skus/route.ts`
- `src/app/api/skus/[id]/batches/route.ts`
- `src/app/api/skus/[id]/batches/[batchId]/route.ts`
- `src/app/api/amazon/sync/route.ts`
- `src/app/api/amazon/import-skus/route.ts`
- `src/app/api/amazon/fba-fee-discrepancies/route.ts`
- `src/app/api/transactions/route.ts`
- `src/app/api/transactions/[id]/route.ts`
- `src/app/api/purchase-orders/[id]/lines/route.ts`

### UI Components
- `src/app/config/products/skus-panel.tsx`
- `src/app/config/products/sku-batches-modal.tsx`
- `src/app/config/products/batches/page.tsx`
- `src/app/config/products/amazon-import-button.tsx`
- `src/app/amazon/fba-fee-discrepancies/page.tsx`

### Services
- `src/lib/services/po-stage-service.ts`
- `src/lib/services/fulfillment-order-service.ts`
- `src/lib/services/movement-note-service.ts`

### Seeds
- `scripts/setup/products.ts`

---

## Migration Strategy

1. **Phase 1 - Add columns to SKU** (non-breaking)
   - Add `amazonItemPackageDimensionsCm`, `amazonItemPackageSide1Cm/2Cm/3Cm` to SKU table

2. **Phase 2 - Data migration**
   - Copy dimension data from first batch of each SKU to the SKU record
   - Prioritize batches with non-null amazon dimensions

3. **Phase 3 - Code updates**
   - Update all read/write operations to use SKU instead of batch
   - Remove dimension inputs from batch modal

4. **Phase 4 - Cleanup** (after verification)
   - Drop dimension columns from sku_batches table

---

## Notes

- SKU already has `unitSide1Cm`, `unitSide2Cm`, `unitSide3Cm`, `unitWeightKg` fields
- SKU already has `itemSide1Cm`, `itemSide2Cm`, `itemSide3Cm`, `itemWeightKg` fields
- Only need to ADD the amazonItemPackage fields to SKU
- Services have fallback logic (batch ?? sku) that needs simplification
