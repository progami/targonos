export function normalizeBasePath(value: string): string {
  const raw = value.trim()
  if (raw.length === 0) return ''

  const prefixed = raw.startsWith('/') ? raw : `/${raw}`
  const withoutTrailingSlash = prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed
  const segments = withoutTrailingSlash.split('/').filter(Boolean)

  const halfLen = Math.floor(segments.length / 2)
  const hasDuplicatedSegments =
    segments.length > 0 &&
    segments.length % 2 === 0 &&
    segments.slice(0, halfLen).join('/') === segments.slice(halfLen).join('/')

  const normalized = hasDuplicatedSegments
    ? `/${segments.slice(0, halfLen).join('/')}`
    : withoutTrailingSlash

  return normalized === '/' ? '' : normalized
}

export const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? '')
export const CLOUDFLARE_MAX_UPLOAD_BYTES = 100_000_000

export function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000
  if (mb >= 1) return `${mb.toFixed(1)}MB`
  const kb = bytes / 1_000
  return `${kb.toFixed(1)}KB`
}

export function getUploadSizeError(files: File[], maxBytes: number): string | null {
  const oversized = files.find((file) => file.size > maxBytes) ?? null
  if (oversized) {
    return `“${oversized.name}” is ${formatBytes(oversized.size)}. Max upload size is 100MB per request.`
  }

  let total = 0
  for (const file of files) {
    total += file.size
  }

  if (total > maxBytes) {
    return `Selected files total ${formatBytes(total)}. Max upload size is 100MB per request. Upload fewer files at once.`
  }

  return null
}

export function formatUsdFromCents(cents: number): string {
  const whole = Math.floor(cents / 100)
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0')
  return `${whole}.${fraction}`
}

export function parseUsdToCents(value: string): number | null {
  const raw = value.trim()
  if (raw.length === 0) return null

  const cleaned = raw.replaceAll('$', '').replaceAll(',', '')
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned)
  if (!match) return null

  const dollars = Number(match[1])
  if (!Number.isFinite(dollars)) return null

  const fractionRaw = match[2] ?? ''
  const fraction = fractionRaw.padEnd(2, '0')
  const cents = dollars * 100 + Number(fraction)
  return Number.isFinite(cents) ? cents : null
}

export function isInitialIframeDocument(iframe: HTMLIFrameElement, doc: Document): boolean {
  return iframe.contentWindow?.location.href === 'about:blank' || doc.URL === 'about:blank'
}

export function looksLikeAsin(value: string): boolean {
  return /^[a-z0-9]{10}$/iu.test(value)
}

export interface ListingSummary {
  id: string
  asin: string
  label: string
}

export interface ListingActivePointers {
  activeTitleId: string | null
  activeBulletsId: string | null
  activeGalleryId: string | null
  activeEbcId: string | null
  activeVideoId: string | null
}

export interface ListingPriceState {
  priceCents: number | null
  pricePerUnitCents: number | null
  pricePerUnitUnit: string | null
}

export interface ListingDetailProps {
  listingId: string
  listing?: ListingSummary
}

export interface TitleRevision {
  id: string
  seq: number
  createdAt: string
  title: string
  note: string | null
  origin: string
}

export interface BulletsRevision {
  id: string
  seq: number
  createdAt: string
  bullet1: string | null
  bullet2: string | null
  bullet3: string | null
  bullet4: string | null
  bullet5: string | null
}

export interface GalleryApiRevision {
  id: string
  seq: number
  createdAt: string
  slots: {
    position: number
    media: { filePath: string; sourceUrl: string | null }
  }[]
}

export interface GalleryRevision {
  id: string
  seq: number
  createdAt: string
  images: GalleryImage[]
}

export interface GalleryImage {
  position: number
  src: string
  hiRes: string | null
  isVideo: boolean
}

export interface VideoApiRevision {
  id: string
  seq: number
  createdAt: string
  media: { filePath: string; sourceUrl: string | null }
  posterMedia: { filePath: string; sourceUrl: string | null } | null
}

export interface VideoRevision {
  id: string
  seq: number
  createdAt: string
  src: string
  posterSrc: string | null
}

export interface EbcModulePointerApi {
  sectionType: string
  modulePosition: number
  ebcRevisionId: string
}

export interface EbcApiRevision {
  id: string
  seq: number
  createdAt: string
  sections: {
    position: number
    sectionType: string
    heading: string | null
    modules: {
      position: number
      moduleType: string
      headline: string | null
      bodyText: string | null
      images: {
        position: number
        altText: string | null
        media: { filePath: string; sourceUrl: string | null }
      }[]
    }[]
  }[]
}

export interface EbcRevision {
  id: string
  seq: number
  createdAt: string
  sections: EbcSection[]
}

export interface EbcSection {
  sectionType: string
  heading: string | null
  modules: EbcModule[]
}

export interface EbcModule {
  moduleType: string
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export interface BulletsDraft {
  bullet1: string
  bullet2: string
  bullet3: string
  bullet4: string
  bullet5: string
}

export interface PriceDraft {
  price: string
  perUnitPrice: string
  perUnitUnit: string
}

export interface EbcModuleEditorTarget {
  sectionType: string
  modulePosition: number
}

export interface EbcModuleDraft {
  headline: string
  bodyText: string
}

export type ArgusReplicaDocument = Document & {
  __argusMainMediaIndex?: number
  __argusVideoBaseline?: string
  __argusEbcBaseline?: {
    brand: string
    description: string
  }
}

export interface ListingDetailCallbacks {
  titlePrev: () => void
  titleNext: () => void
  titleEdit: () => void
  titleLive: () => void
  titleDelete: () => void
  bulletsPrev: () => void
  bulletsNext: () => void
  bulletsEdit: () => void
  bulletsLive: () => void
  bulletsDelete: () => void
  priceEdit: () => void
  priceDelete: () => void
  galleryPrev: () => void
  galleryNext: () => void
  galleryLive: () => void
  galleryUpload: () => void
  galleryDownload: () => void
  galleryDelete: () => void
  videoPrev: () => void
  videoNext: () => void
  videoLive: () => void
  videoUpload: () => void
  videoDelete: () => void
  ebcPrev: () => void
  ebcNext: () => void
  ebcLive: () => void
  ebcDelete: () => void
  ebcModulePrev: (sectionType: string, modulePosition: number) => void
  ebcModuleNext: (sectionType: string, modulePosition: number) => void
  ebcModuleLive: (sectionType: string, modulePosition: number) => void
  ebcModuleEdit: (sectionType: string, modulePosition: number) => void
  ebcModuleDelete: (sectionType: string, modulePosition: number) => void
  ebcDownload: () => void
  variationSelect: (asin: string) => void
}

export function toGalleryRevision(rev: GalleryApiRevision): GalleryRevision {
  const images = rev.slots
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((slot) => ({
      position: slot.position,
      src: slot.media.filePath,
      hiRes: slot.media.filePath,
      isVideo: false,
    }))

  return {
    id: rev.id,
    seq: rev.seq,
    createdAt: rev.createdAt,
    images,
  }
}

export function toVideoRevision(rev: VideoApiRevision): VideoRevision {
  const src = rev.media.filePath
  const posterSrc = rev.posterMedia ? rev.posterMedia.filePath : null

  return {
    id: rev.id,
    seq: rev.seq,
    createdAt: rev.createdAt,
    src,
    posterSrc,
  }
}

export function toEbcRevision(rev: EbcApiRevision): EbcRevision {
  return {
    id: rev.id,
    seq: rev.seq,
    createdAt: rev.createdAt,
    sections: rev.sections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        sectionType: section.sectionType,
        heading: section.heading,
        modules: section.modules
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((mod) => ({
            moduleType: mod.moduleType,
            headline: mod.headline,
            bodyText: mod.bodyText,
            images: mod.images
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((img) => ({
                src: img.media.filePath,
                alt: img.altText,
              })),
          })),
      })),
  }
}

export function resolveImageSrc(src: string): string {
  if (src.startsWith('./listingpage_files/') || src.startsWith('listingpage_files/')) {
    return `${basePath}/api/fixture/${src.replace('./', '')}`
  }
  if (src.startsWith('./6pk_files/') || src.startsWith('6pk_files/')) {
    return `${basePath}/api/fixture/${src.replace('./', '')}`
  }
  if (src.startsWith('media/')) {
    return `${basePath}/api/media/${src.replace('media/', '')}`
  }
  return src
}
