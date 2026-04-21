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

const REPLICA_RUNTIME_REMOVAL_SELECTORS = [
  '#nav-flyout-ewc',
  '#nav-flyout-rufus',
  '#nav-rufus-disco',
  'veepn-lock-screen',
] as const

const REPLICA_RUNTIME_CLASS_PREFIXES = ['rufus-'] as const

const REPLICA_RUNTIME_STYLE_PROPERTIES = [
  'padding-left',
  'padding-right',
  'width',
  'left',
  'right',
  'top',
  '--rufus-animation-min-height',
  '--rufus-docked-panel-width',
] as const

const REPLICA_LAYOUT_ELEMENT_IDS = ['nav-belt', 'navbar', 'nav-main'] as const

function normalizeVersion(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

function removeClassesByPrefix(element: Element, prefixes: readonly string[]): void {
  const classNames = Array.from(element.classList)
  for (const className of classNames) {
    for (const prefix of prefixes) {
      if (className.startsWith(prefix)) {
        element.classList.remove(className)
      }
    }
  }
}

function removeStyleProperties(element: { style: CSSStyleDeclaration }, properties: readonly string[]): void {
  for (const property of properties) {
    element.style.removeProperty(property)
  }
}

export function sanitizeAmazonPdpReplicaDocument(doc: Document): void {
  for (const selector of REPLICA_RUNTIME_REMOVAL_SELECTORS) {
    const nodes = Array.from(doc.querySelectorAll(selector))
    for (const node of nodes) {
      node.remove()
    }
  }

  const inlineStyleBlocks = Array.from(doc.querySelectorAll('style'))
  for (const inlineStyleBlock of inlineStyleBlocks) {
    const text = inlineStyleBlock.textContent
    if (text === null) continue
    if (text.includes('chrome-extension://')) {
      inlineStyleBlock.remove()
    }
  }

  removeClassesByPrefix(doc.body, REPLICA_RUNTIME_CLASS_PREFIXES)
  removeClassesByPrefix(doc.documentElement, REPLICA_RUNTIME_CLASS_PREFIXES)
  removeStyleProperties(doc.body, REPLICA_RUNTIME_STYLE_PROPERTIES)
  removeStyleProperties(doc.documentElement, REPLICA_RUNTIME_STYLE_PROPERTIES)

  for (const elementId of REPLICA_LAYOUT_ELEMENT_IDS) {
    const element = doc.getElementById(elementId)
    if (!element) continue
    removeStyleProperties(element, REPLICA_RUNTIME_STYLE_PROPERTIES)
  }
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
