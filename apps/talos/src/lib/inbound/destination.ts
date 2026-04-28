type InboundOrderDestinationInput = {
  warehouseName: string | null
  shipToName: string | null
  shipToAddress: string | null
}

type WarehouseDestinationRecord = {
  name: string | null
  address: string | null
}

export type InboundOrderDestination = {
  name: string | null
  address: string | null
}

function normalizeOptionalString(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  return trimmed
}

export function resolveInboundOrderDestination(
  input: InboundOrderDestinationInput,
  warehouse: WarehouseDestinationRecord | null
): InboundOrderDestination {
  const liveWarehouseName = warehouse ? normalizeOptionalString(warehouse.name) : null
  const snapshotWarehouseName = normalizeOptionalString(input.warehouseName)
  const legacyShipToName = normalizeOptionalString(input.shipToName)
  const liveWarehouseAddress = warehouse ? normalizeOptionalString(warehouse.address) : null
  const legacyShipToAddress = normalizeOptionalString(input.shipToAddress)

  let name = liveWarehouseName
  if (name === null) {
    name = snapshotWarehouseName
  }
  if (name === null) {
    name = legacyShipToName
  }

  let address = liveWarehouseAddress
  if (address === null) {
    address = legacyShipToAddress
  }

  return { name, address }
}
