import { ValidationError } from '@/lib/api/errors'
import { WarehouseKind } from '@targon/prisma-talos'
import { isAmazonWarehouseCode } from '@/lib/warehouses/amazon-warehouse'

export function isAmazonVirtualWarehouse(warehouse: {
  code: string
  kind: WarehouseKind
}) {
  if (warehouse.kind === WarehouseKind.AMAZON_FBA) {
    return true
  }

  if (isAmazonWarehouseCode(warehouse.code)) {
    return true
  }

  return false
}

export function assertValidOutboundSourceWarehouse(warehouse: {
  code: string
  kind: WarehouseKind
}) {
  if (isAmazonVirtualWarehouse(warehouse)) {
    throw new ValidationError(
      `Warehouse ${warehouse.code} is an Amazon virtual warehouse and cannot be used as an outbound source`
    )
  }
}
