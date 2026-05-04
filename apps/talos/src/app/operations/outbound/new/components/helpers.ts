import type { AmazonOutboundShipmentItem, NormalizedInboundItem } from './types'

export const getRecordValue = (record: Record<string, unknown> | null | undefined, key: string) => {
  if (!record) return undefined
  if (record[key] !== undefined) return record[key]
  const lowered = key.toLowerCase()
  const match = Object.keys(record).find(entry => entry.toLowerCase() === lowered)
  return match ? record[match] : undefined
}

export const getStringField = (
  record: Record<string, unknown> | null | undefined,
  keys: string[]
) => {
  if (!record) return ''
  for (const key of keys) {
    const value = getRecordValue(record, key)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export const getNumberField = (
  record: Record<string, unknown> | null | undefined,
  keys: string[]
) => {
  if (!record) return null
  for (const key of keys) {
    const value = getRecordValue(record, key)
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

export const getAddressField = (address: Record<string, unknown> | null | undefined, keys: string[]) =>
  getStringField(address ?? null, keys)

export const formatAmazonAddress = (address?: Record<string, unknown> | null) => {
  if (!address) return ''
  const name = getAddressField(address, ['Name', 'name'])
  const line1 = getAddressField(address, ['AddressLine1', 'addressLine1', 'line1', 'address1'])
  const line2 = getAddressField(address, ['AddressLine2', 'addressLine2', 'line2', 'address2'])
  const line3 = getAddressField(address, ['AddressLine3', 'addressLine3', 'line3'])
  const city = getAddressField(address, ['City', 'city', 'town'])
  const state = getAddressField(address, ['StateOrProvinceCode', 'stateOrProvinceCode', 'state', 'province'])
  const postal = getAddressField(address, ['PostalCode', 'postalCode', 'zipCode', 'zip'])
  const country = getAddressField(address, ['CountryCode', 'countryCode', 'country'])
  const phone = getAddressField(address, ['Phone', 'phone'])

  const cityState = [city, state].filter(Boolean).join(', ')
  const cityStatePostal = [cityState, postal].filter(Boolean).join(' ')

  return [name, line1, line2, line3, cityStatePostal, country, phone].filter(Boolean).join('\n')
}

export const normalizeInboundItems = (items: AmazonOutboundShipmentItem[]): NormalizedInboundItem[] => {
  const normalized: NormalizedInboundItem[] = []

  items.forEach((item) => {
    const sku = getStringField(item, [
      'SellerSKU',
      'sellerSku',
      'sku',
      'skuCode',
      'msku',
      'merchantSku',
    ])
    if (!sku) return

    const quantityExpected =
      getNumberField(item, [
        'QuantityShipped',
        'quantityShipped',
        'quantity',
        'quantityExpected',
        'expectedQuantity',
        'unitsExpected',
      ]) ?? 0

    const quantityReceived = getNumberField(item, [
      'QuantityReceived',
      'quantityReceived',
      'receivedQuantity',
      'unitsReceived',
    ])

    const quantityInCase = getNumberField(item, [
      'QuantityInCase',
      'quantityInCase',
      'unitsPerCase',
      'unitsPerCarton',
      'caseQuantity',
    ])

    normalized.push({
      sku,
      quantityExpected,
      quantityReceived: quantityReceived ?? undefined,
      quantityInCase: quantityInCase ?? undefined,
    })
  })

  return normalized
}
