export const AMAZON_PDP_REPLICA_VERSION = 'amazon-pdp-v1' as const

export type AmazonPdpReplicaSlot =
  | 'gallery-root'
  | 'gallery-landing-image'
  | 'gallery-thumbnails'
  | 'gallery-video-thumb'
  | 'video-container'
  | 'title'
  | 'bullets-root'
  | 'bullets-list'
  | 'price-root'
  | 'ebc-brand-root'
  | 'ebc-description-root'
  | 'variations-root'

const REQUIRED_SLOTS: readonly AmazonPdpReplicaSlot[] = [
  'gallery-root',
  'gallery-landing-image',
  'gallery-thumbnails',
  'gallery-video-thumb',
  'video-container',
  'title',
  'bullets-root',
  'bullets-list',
  'price-root',
  'ebc-brand-root',
  'ebc-description-root',
  'variations-root',
]

export type AmazonPdpReplicaContractOk = {
  ok: true
  version: typeof AMAZON_PDP_REPLICA_VERSION
}

export type AmazonPdpReplicaContractError = {
  ok: false
  declaredVersion: string | null
  runtimeVersion: string | null
  missingSlots: AmazonPdpReplicaSlot[]
}

export type AmazonPdpReplicaContract = AmazonPdpReplicaContractOk | AmazonPdpReplicaContractError

function normalizeVersion(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

export function getDeclaredReplicaVersion(doc: Document): string | null {
  const meta = doc.querySelector('meta[name="argus-replica-version"]')
  if (!meta) return null
  return normalizeVersion(meta.getAttribute('content'))
}

export function getRuntimeReplicaVersion(doc: Document): string | null {
  return normalizeVersion(doc.documentElement.getAttribute('data-argus-replica'))
}

export function getReplicaSlotElement<T extends Element>(
  doc: Document,
  slot: AmazonPdpReplicaSlot,
): T | null {
  const el = doc.querySelector(`[data-argus-slot="${slot}"]`)
  if (!el) return null
  return el as T
}

export function validateAmazonPdpReplicaContract(doc: Document): AmazonPdpReplicaContract {
  const declaredVersion = getDeclaredReplicaVersion(doc)
  const runtimeVersion = getRuntimeReplicaVersion(doc)

  const missingSlots: AmazonPdpReplicaSlot[] = []
  for (const slot of REQUIRED_SLOTS) {
    if (!getReplicaSlotElement(doc, slot)) {
      missingSlots.push(slot)
    }
  }

  const expectedVersion = AMAZON_PDP_REPLICA_VERSION
  const declaredMatches = declaredVersion === expectedVersion
  const runtimeMatches = runtimeVersion === expectedVersion

  if (!declaredMatches || !runtimeMatches || missingSlots.length > 0) {
    return {
      ok: false,
      declaredVersion,
      runtimeVersion,
      missingSlots,
    }
  }

  return { ok: true, version: expectedVersion }
}

export function formatAmazonPdpReplicaContractError(error: AmazonPdpReplicaContractError): string {
  const parts: string[] = []

  if (error.declaredVersion !== AMAZON_PDP_REPLICA_VERSION) {
    const declared = error.declaredVersion === null ? 'missing' : error.declaredVersion
    parts.push(`declaredVersion=${declared}`)
  }

  if (error.runtimeVersion !== AMAZON_PDP_REPLICA_VERSION) {
    const runtime = error.runtimeVersion === null ? 'missing' : error.runtimeVersion
    parts.push(`runtimeVersion=${runtime}`)
  }

  if (error.missingSlots.length > 0) {
    parts.push(`missingSlots=${error.missingSlots.join(', ')}`)
  }

  return parts.join(' | ')
}
