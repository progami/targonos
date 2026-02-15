'use client'

import { useRef, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Button as MuiButton,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'

function normalizeBasePath(value: string): string {
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

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? '')
const CLOUDFLARE_MAX_UPLOAD_BYTES = 100_000_000

function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000
  if (mb >= 1) return `${mb.toFixed(1)}MB`
  const kb = bytes / 1_000
  return `${kb.toFixed(1)}KB`
}

function getUploadSizeError(files: File[], maxBytes: number): string | null {
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

function formatUsdFromCents(cents: number): string {
  const whole = Math.floor(cents / 100)
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0')
  return `${whole}.${fraction}`
}

function parseUsdToCents(value: string): number | null {
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

interface ListingSummary {
  id: string
  asin: string
  label: string
}

interface ListingActivePointers {
  activeTitleId: string | null
  activeBulletsId: string | null
  activeGalleryId: string | null
  activeEbcId: string | null
  activeVideoId: string | null
}

interface ListingPriceState {
  priceCents: number | null
  pricePerUnitCents: number | null
  pricePerUnitUnit: string | null
}

interface ListingDetailProps {
  listingId: string
  listing?: ListingSummary
}

function looksLikeAsin(value: string): boolean {
  return /^[a-z0-9]{10}$/iu.test(value)
}

export function ListingDetail({
  listingId,
  listing: listingProp,
}: ListingDetailProps) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)
  const iframeDocRef = useRef<Document | null>(null)
  const [iframeEpoch, setIframeEpoch] = useState(0)

  const [listing, setListing] = useState<ListingSummary | null>(listingProp ?? null)

  const [refreshKey, setRefreshKey] = useState(0)

  const [titleRevisions, setTitleRevisions] = useState<TitleRevision[]>([])
  const [titleIndex, setTitleIndex] = useState(0)

  const [bulletsRevisions, setBulletsRevisions] = useState<BulletsRevision[]>([])
  const [galleryRevisions, setGalleryRevisions] = useState<GalleryRevision[]>([])
  const [videoRevisions, setVideoRevisions] = useState<VideoRevision[]>([])
  const [ebcRevisions, setEbcRevisions] = useState<EbcRevision[]>([])
  const [ebcModulePointers, setEbcModulePointers] = useState<Record<string, string>>({})

  const [activePointers, setActivePointers] = useState<ListingActivePointers | null>(null)
  const [price, setPrice] = useState<ListingPriceState | null>(null)

  const [bulletsIndex, setBulletsIndex] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [videoIndex, setVideoIndex] = useState(0)
  const [ebcIndex, setEbcIndex] = useState(0)

  const [titleEditorOpen, setTitleEditorOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [bulletsEditorOpen, setBulletsEditorOpen] = useState(false)
  const [bulletsDraft, setBulletsDraft] = useState({
    bullet1: '',
    bullet2: '',
    bullet3: '',
    bullet4: '',
    bullet5: '',
  })

  const [priceEditorOpen, setPriceEditorOpen] = useState(false)
  const [priceDraft, setPriceDraft] = useState({
    price: '',
    perUnitPrice: '',
    perUnitUnit: 'count',
  })

  const [galleryUploaderOpen, setGalleryUploaderOpen] = useState(false)
  const [galleryFiles, setGalleryFiles] = useState<File[]>([])

  const [videoUploaderOpen, setVideoUploaderOpen] = useState(false)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPosterFile, setVideoPosterFile] = useState<File | null>(null)

  const [ebcModuleEditorOpen, setEbcModuleEditorOpen] = useState(false)
  const [ebcModuleEditorTarget, setEbcModuleEditorTarget] = useState<{ sectionType: string; modulePosition: number } | null>(null)
  const [ebcModuleDraft, setEbcModuleDraft] = useState({ headline: '', bodyText: '' })
  const [ebcModuleFiles, setEbcModuleFiles] = useState<File[]>([])

  const callbacksRef = useRef({
    titlePrev: () => {},
    titleNext: () => {},
    titleEdit: () => {},
    titleLive: () => {},
    titleDelete: () => {},
    bulletsPrev: () => {},
    bulletsNext: () => {},
    bulletsEdit: () => {},
    bulletsLive: () => {},
    bulletsDelete: () => {},
    priceEdit: () => {},
    priceDelete: () => {},
    galleryPrev: () => {},
    galleryNext: () => {},
    galleryLive: () => {},
    galleryUpload: () => {},
    galleryDownload: () => {},
    galleryDelete: () => {},
    videoPrev: () => {},
    videoNext: () => {},
    videoLive: () => {},
    videoUpload: () => {},
    videoDelete: () => {},
    ebcPrev: () => {},
    ebcNext: () => {},
    ebcLive: () => {},
    ebcDelete: () => {},
    ebcModulePrev: (_sectionType: string, _modulePosition: number) => {},
    ebcModuleNext: (_sectionType: string, _modulePosition: number) => {},
    ebcModuleLive: (_sectionType: string, _modulePosition: number) => {},
    ebcModuleEdit: (_sectionType: string, _modulePosition: number) => {},
    ebcModuleDelete: (_sectionType: string, _modulePosition: number) => {},
    ebcDownload: () => {},
    variationSelect: (_asin: string) => {},
  })

  useEffect(() => {
    const normalized = String(listingId).trim()
    const abortController = new AbortController()

    if (listingProp && (listingProp.id === normalized || listingProp.asin === normalized)) {
      setListing(listingProp)
      return () => abortController.abort()
    }

    const doc = iframeDocRef.current
    if (doc) {
      const storedDoc = doc as ArgusReplicaDocument
      storedDoc.__argusMainMediaIndex = 0
    }

    setListing(null)
    setActivePointers(null)
    setPrice(null)
    setTitleRevisions([])
    setBulletsRevisions([])
    setGalleryRevisions([])
    setVideoRevisions([])
    setEbcRevisions([])
    setEbcModulePointers({})
    setTitleIndex(0)
    setBulletsIndex(0)
    setGalleryIndex(0)
    setVideoIndex(0)
    setEbcIndex(0)

    void (async () => {
      if (normalized.length === 0) return

      if (looksLikeAsin(normalized)) {
        const res = await fetch(`${basePath}/api/listings/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asin: normalized }),
          signal: abortController.signal,
        })

        if (!res.ok) {
          window.alert(await res.text())
          return
        }

        const data = await res.json() as { id: string; asin: string; label: string }
        setListing({ id: data.id, asin: data.asin, label: data.label })
        return
      }

      const res = await fetch(`${basePath}/api/listings/${normalized}`, { signal: abortController.signal })
      if (!res.ok) {
        window.alert(await res.text())
        return
      }

      const data = await res.json() as { id: string; asin: string; label: string }
      setListing({ id: data.id, asin: data.asin, label: data.label })
    })()

    return () => abortController.abort()
  }, [listingId, listingProp])

  useEffect(() => {
    callbacksRef.current.titlePrev = () => {
      setTitleIndex((current) => {
        const max = titleRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.titleNext = () => setTitleIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.titleEdit = () => {
      const selected = titleRevisions.length > titleIndex ? titleRevisions[titleIndex] : null
      if (selected) {
        setTitleDraft(selected.title)
        setTitleEditorOpen(true)
        return
      }

      setTitleDraft(listing ? listing.label : '')
      setTitleEditorOpen(true)
    }
    callbacksRef.current.titleLive = () => {
      const activeId = activePointers?.activeTitleId
      const index = activeId ? titleRevisions.findIndex((rev) => rev.id === activeId) : -1
      if (index >= 0) {
        setTitleIndex(index)
        return
      }
      if (titleRevisions.length > 0) {
        setTitleIndex(titleRevisions.length - 1)
      }
    }
    callbacksRef.current.titleDelete = () => {
      if (!listing) return
      const selected = titleRevisions.length > titleIndex ? titleRevisions[titleIndex] : null
      if (!selected) return
      const versionNumber = titleRevisions.length - titleIndex
      if (!window.confirm(`Delete Title v${versionNumber}?`)) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/title`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    callbacksRef.current.bulletsPrev = () => {
      setBulletsIndex((current) => {
        const max = bulletsRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.bulletsNext = () => setBulletsIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.bulletsEdit = () => {
      const selected = bulletsRevisions.length > bulletsIndex ? bulletsRevisions[bulletsIndex] : null
      setBulletsDraft({
        bullet1: selected?.bullet1 ?? '',
        bullet2: selected?.bullet2 ?? '',
        bullet3: selected?.bullet3 ?? '',
        bullet4: selected?.bullet4 ?? '',
        bullet5: selected?.bullet5 ?? '',
      })
      setBulletsEditorOpen(true)
    }
    callbacksRef.current.bulletsLive = () => {
      const activeId = activePointers?.activeBulletsId
      const index = activeId ? bulletsRevisions.findIndex((rev) => rev.id === activeId) : -1
      if (index >= 0) {
        setBulletsIndex(index)
        return
      }
      if (bulletsRevisions.length > 0) {
        setBulletsIndex(bulletsRevisions.length - 1)
      }
    }
    callbacksRef.current.bulletsDelete = () => {
      if (!listing) return
      const selected = bulletsRevisions.length > bulletsIndex ? bulletsRevisions[bulletsIndex] : null
      if (!selected) return
      const versionNumber = bulletsRevisions.length - bulletsIndex
      if (!window.confirm(`Delete Bullets v${versionNumber}?`)) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/bullets`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    callbacksRef.current.priceEdit = () => {
      const nextPrice = price && typeof price.priceCents === 'number'
        ? formatUsdFromCents(price.priceCents)
        : ''
      const nextPerUnitPrice = price && typeof price.pricePerUnitCents === 'number'
        ? formatUsdFromCents(price.pricePerUnitCents)
        : ''
      const nextPerUnitUnit = typeof price?.pricePerUnitUnit === 'string' && price.pricePerUnitUnit.trim().length > 0
        ? price.pricePerUnitUnit
        : 'count'

      setPriceDraft({
        price: nextPrice,
        perUnitPrice: nextPerUnitPrice,
        perUnitUnit: nextPerUnitUnit,
      })
      setPriceEditorOpen(true)
    }

    callbacksRef.current.priceDelete = () => {
      if (!listing) return
      if (!window.confirm('Clear price override?')) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/price`, { method: 'DELETE' })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    callbacksRef.current.galleryPrev = () => {
      setGalleryIndex((current) => {
        const max = galleryRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.galleryNext = () => setGalleryIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.galleryLive = () => {
      const activeId = activePointers?.activeGalleryId
      const index = activeId ? galleryRevisions.findIndex((rev) => rev.id === activeId) : -1
      if (index >= 0) {
        setGalleryIndex(index)
        return
      }
      if (galleryRevisions.length > 0) {
        setGalleryIndex(galleryRevisions.length - 1)
      }
    }
    callbacksRef.current.galleryUpload = () => {
      setGalleryFiles([])
      setGalleryUploaderOpen(true)
    }
    callbacksRef.current.galleryDelete = () => {
      if (!listing) return
      const selected = galleryRevisions.length > galleryIndex ? galleryRevisions[galleryIndex] : null
      if (!selected) return
      const versionNumber = galleryRevisions.length - galleryIndex
      if (!window.confirm(`Delete Images v${versionNumber}?`)) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/gallery`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    callbacksRef.current.videoPrev = () => {
      setVideoIndex((current) => {
        const max = videoRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.videoNext = () => setVideoIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.videoLive = () => {
      const activeId = activePointers?.activeVideoId
      const index = activeId ? videoRevisions.findIndex((rev) => rev.id === activeId) : -1
      if (index >= 0) {
        setVideoIndex(index)
        return
      }
      if (videoRevisions.length > 0) {
        setVideoIndex(videoRevisions.length - 1)
      }
    }
    callbacksRef.current.videoUpload = () => {
      setVideoFile(null)
      setVideoPosterFile(null)
      setVideoUploaderOpen(true)
    }
    callbacksRef.current.videoDelete = () => {
      if (!listing) return
      const selected = videoRevisions.length > videoIndex ? videoRevisions[videoIndex] : null
      if (!selected) return
      const versionNumber = videoRevisions.length - videoIndex
      if (!window.confirm(`Delete Video v${versionNumber}?`)) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/video`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    async function persistEbcModulePointer(sectionType: string, modulePosition: number, ebcRevisionId: string) {
      if (!listing) return

      const live = activePointers?.activeEbcId
      if (live && ebcRevisionId === live) {
        await fetch(`${basePath}/api/listings/${listing.id}/ebc/pointers`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionType, modulePosition }),
        })
        return
      }

      await fetch(`${basePath}/api/listings/${listing.id}/ebc/pointers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionType, modulePosition, ebcRevisionId }),
      })
    }

    function getEffectiveEbcRevisionIdForModule(sectionType: string, modulePosition: number): string | null {
      const key = ebcModulePointerKey(sectionType, modulePosition)
      const selected = ebcModulePointers[key]
      if (selected) return selected
      const live = activePointers?.activeEbcId
      if (live) return live
      return null
    }

    async function setAllEbcModulesToRevision(revisionId: string) {
      const baseId = activePointers?.activeEbcId
      const base = baseId ? ebcRevisions.find((rev) => rev.id === baseId) ?? null : null
      const layout = base ? base : (ebcRevisions.length > 0 ? ebcRevisions[0] : null)
      if (!layout) return

      const nextPointers: Record<string, string> = { ...ebcModulePointers }
      const updates: Promise<void>[] = []
      const live = activePointers?.activeEbcId

      for (const section of layout.sections) {
        for (let mi = 0; mi < section.modules.length; mi++) {
          const key = ebcModulePointerKey(section.sectionType, mi)
          if (live && revisionId === live) {
            if (key in nextPointers) delete nextPointers[key]
          } else {
            nextPointers[key] = revisionId
          }
          updates.push(persistEbcModulePointer(section.sectionType, mi, revisionId))
        }
      }

      setEbcModulePointers(nextPointers)
      await Promise.all(updates)
    }

    callbacksRef.current.ebcPrev = () => {
      const max = ebcRevisions.length - 1
      if (max < 0) return
      const nextIndex = ebcIndex < max ? ebcIndex + 1 : ebcIndex
      setEbcIndex(nextIndex)
      const rev = ebcRevisions[nextIndex]
      if (!rev) return
      void setAllEbcModulesToRevision(rev.id)
    }
    callbacksRef.current.ebcNext = () => {
      const nextIndex = ebcIndex > 0 ? ebcIndex - 1 : ebcIndex
      setEbcIndex(nextIndex)
      const rev = ebcRevisions[nextIndex]
      if (!rev) return
      void setAllEbcModulesToRevision(rev.id)
    }
    callbacksRef.current.ebcLive = () => {
      const activeId = activePointers?.activeEbcId
      const index = activeId ? ebcRevisions.findIndex((rev) => rev.id === activeId) : -1
      if (index >= 0) {
        setEbcIndex(index)
        void setAllEbcModulesToRevision(activeId as string)
        return
      }
      if (ebcRevisions.length > 0) {
        const oldestIndex = ebcRevisions.length - 1
        const oldest = ebcRevisions[oldestIndex]
        if (!oldest) return
        setEbcIndex(oldestIndex)
        void setAllEbcModulesToRevision(oldest.id)
      }
    }

    callbacksRef.current.ebcDelete = () => {
      if (!listing) return
      if (!window.confirm('Clear all A+ module overrides?')) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/ebc/pointers`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setEbcModulePointers({})
      })()
    }

    callbacksRef.current.ebcModulePrev = (sectionType: string, modulePosition: number) => {
      const history = getEbcModuleHistory(ebcRevisions, sectionType, modulePosition)
      if (history.length === 0) return

      const currentRevisionId = getEffectiveEbcRevisionIdForModule(sectionType, modulePosition)
      const effectiveId = currentRevisionId ? currentRevisionId : history[0].revisionId
      const index = history.findIndex((item) => item.revisionId === effectiveId)
      const safeIndex = index >= 0 ? index : 0
      const nextIndex = safeIndex < history.length - 1 ? safeIndex + 1 : safeIndex
      const nextRevisionId = history[nextIndex].revisionId
      const key = ebcModulePointerKey(sectionType, modulePosition)
      const live = activePointers?.activeEbcId
      setEbcModulePointers((current) => {
        const next = { ...current }
        if (live && nextRevisionId === live) {
          if (key in next) delete next[key]
          return next
        }
        next[key] = nextRevisionId
        return next
      })
      void persistEbcModulePointer(sectionType, modulePosition, nextRevisionId)
    }

    callbacksRef.current.ebcModuleNext = (sectionType: string, modulePosition: number) => {
      const history = getEbcModuleHistory(ebcRevisions, sectionType, modulePosition)
      if (history.length === 0) return

      const currentRevisionId = getEffectiveEbcRevisionIdForModule(sectionType, modulePosition)
      const effectiveId = currentRevisionId ? currentRevisionId : history[0].revisionId
      const index = history.findIndex((item) => item.revisionId === effectiveId)
      const safeIndex = index >= 0 ? index : 0
      const nextIndex = safeIndex > 0 ? safeIndex - 1 : safeIndex
      const nextRevisionId = history[nextIndex].revisionId
      const key = ebcModulePointerKey(sectionType, modulePosition)
      const live = activePointers?.activeEbcId
      setEbcModulePointers((current) => {
        const next = { ...current }
        if (live && nextRevisionId === live) {
          if (key in next) delete next[key]
          return next
        }
        next[key] = nextRevisionId
        return next
      })
      void persistEbcModulePointer(sectionType, modulePosition, nextRevisionId)
    }

    callbacksRef.current.ebcModuleLive = (sectionType: string, modulePosition: number) => {
      const activeId = activePointers?.activeEbcId
      const fallback = ebcRevisions.length > 0 ? ebcRevisions[ebcRevisions.length - 1] : null
      const nextRevisionId = activeId ? activeId : (fallback ? fallback.id : null)
      if (!nextRevisionId) return

      const key = ebcModulePointerKey(sectionType, modulePosition)
      setEbcModulePointers((current) => {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      })
      void persistEbcModulePointer(sectionType, modulePosition, nextRevisionId)
    }

    callbacksRef.current.ebcModuleEdit = (sectionType: string, modulePosition: number) => {
      const revisionId = getEffectiveEbcRevisionIdForModule(sectionType, modulePosition)
      const fallbackRevision = ebcRevisions.length > 0 ? ebcRevisions[0] : null
      const selectedRevision = revisionId ? ebcRevisions.find((rev) => rev.id === revisionId) ?? fallbackRevision : fallbackRevision
      const section = selectedRevision ? selectedRevision.sections.find((s) => s.sectionType === sectionType) ?? null : null
      const mod = section ? section.modules[modulePosition] ?? null : null

      setEbcModuleEditorTarget({ sectionType, modulePosition })
      setEbcModuleDraft({
        headline: mod?.headline ?? '',
        bodyText: mod?.bodyText ?? '',
      })
      setEbcModuleFiles([])
      setEbcModuleEditorOpen(true)
    }

    callbacksRef.current.ebcModuleDelete = (sectionType: string, modulePosition: number) => {
      if (!listing) return
      if (!window.confirm('Clear this module?')) return

      void (async () => {
        const form = new FormData()
        form.append('sectionType', sectionType)
        form.append('modulePosition', String(modulePosition))
        form.append('headline', '')
        form.append('bodyText', '')
        form.append('clearImages', 'true')

        const res = await fetch(`${basePath}/api/listings/${listing.id}/ebc/module`, {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        setRefreshKey((current) => current + 1)
      })()
    }

    callbacksRef.current.variationSelect = (asin: string) => {
      const normalized = String(asin).trim()
      if (normalized.length === 0) return

      router.push(normalized)
    }
  }, [
    listing,
    activePointers,
    price,
    ebcIndex,
    galleryIndex,
    router,
    titleIndex,
    titleRevisions,
    bulletsIndex,
    bulletsRevisions,
    galleryRevisions,
    videoIndex,
    ebcModulePointers,
    videoRevisions,
    ebcRevisions,
  ])

  useEffect(() => {
    if (!listing) return

    const listingDbId = listing.id
    const abortController = new AbortController()

    async function loadRevisions() {
      const [meta, titles, bullets, gallery, video, ebc, pointers, priceData] = await Promise.all([
        fetch(`${basePath}/api/listings/${listingDbId}`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<ListingActivePointers>,
        fetch(`${basePath}/api/listings/${listingDbId}/title`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<TitleRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/bullets`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<BulletsRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/gallery`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<GalleryApiRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/video`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<VideoApiRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/ebc`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<EbcApiRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/ebc/pointers`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<EbcModulePointerApi[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/price`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<ListingPriceState>,
      ])

      setActivePointers(meta)
      setPrice(priceData)
      setTitleRevisions(titles)
      setBulletsRevisions(bullets)
      setGalleryRevisions(gallery.map(toGalleryRevision))
      setVideoRevisions(video.map(toVideoRevision))
      setEbcRevisions(ebc.map(toEbcRevision))
      const liveEbcId = meta.activeEbcId
      setEbcModulePointers(pointers.reduce<Record<string, string>>((acc, pointer) => {
        if (liveEbcId && pointer.ebcRevisionId === liveEbcId) {
          return acc
        }
        acc[ebcModulePointerKey(pointer.sectionType, pointer.modulePosition)] = pointer.ebcRevisionId
        return acc
      }, {}))

      setTitleIndex(0)
      setBulletsIndex(0)
      setGalleryIndex(0)
      setVideoIndex(0)
      setEbcIndex(0)
    }

    loadRevisions()
    return () => abortController.abort()
  }, [listing, refreshKey])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      if (iframeDocRef.current === doc) return
      iframeDocRef.current = doc
      setIframeEpoch((current) => current + 1)

      const height = doc.documentElement.scrollHeight
      if (height > 0) {
        setIframeHeight(height)
      }

      injectArgusVersionControls(doc, callbacksRef)
      doc.body.classList.remove('a-meter-animate')

      if (doc.documentElement.dataset.argusLinksBound !== 'true') {
        doc.documentElement.dataset.argusLinksBound = 'true'
        doc.addEventListener('click', (e) => {
          const target = e.target
          if (!(target instanceof doc.defaultView!.Element)) return
          const link = target.closest('a')
          if (!link) return
          e.preventDefault()
          e.stopImmediatePropagation()
          e.stopPropagation()
        }, true)
      }
    }

    iframe.addEventListener('load', handleLoad)
    if (iframe.contentDocument?.readyState === 'complete' || iframe.contentDocument?.readyState === 'interactive') {
      handleLoad()
    }
    return () => iframe.removeEventListener('load', handleLoad)
  }, [listing])

  useEffect(() => {
    const doc = iframeDocRef.current
    if (!doc) return

    const selectedTitleRev = titleRevisions.length > titleIndex ? titleRevisions[titleIndex] : null
    const selectedBullets = bulletsRevisions.length > bulletsIndex ? bulletsRevisions[bulletsIndex] : null
    const selectedGallery = galleryRevisions.length > galleryIndex ? galleryRevisions[galleryIndex] : null
    const selectedVideo = videoRevisions.length > videoIndex ? videoRevisions[videoIndex] : null
    const selectedEbc = ebcRevisions.length > ebcIndex ? ebcRevisions[ebcIndex] : null
    const appliedEbc = composeEbcRevision(ebcRevisions, ebcModulePointers, activePointers?.activeEbcId ?? null)
    const selectedTitle = selectedTitleRev ? selectedTitleRev.title : (listing ? listing.label : null)

    applyTitle(doc, selectedTitle)
    applyPrice(doc, price)
    applyBullets(doc, selectedBullets)
    applyGallery(doc, selectedGallery)
    applyVideo(doc, selectedVideo)
    applyEbc(doc, appliedEbc)
    applyVariationSelection(doc, listing ? listing.asin : null)

    const titleVersionNumber = selectedTitleRev ? titleRevisions.length - titleIndex : undefined
    const bulletsVersionNumber = selectedBullets ? bulletsRevisions.length - bulletsIndex : undefined
    const galleryVersionNumber = selectedGallery ? galleryRevisions.length - galleryIndex : undefined
    const videoVersionNumber = selectedVideo ? videoRevisions.length - videoIndex : undefined
    const ebcVersionNumber = selectedEbc ? ebcRevisions.length - ebcIndex : undefined

    updateTrackControls(doc, 'title', titleVersionNumber, titleIndex, titleRevisions.length)
    updateTrackControls(doc, 'bullets', bulletsVersionNumber, bulletsIndex, bulletsRevisions.length)
    updateTrackControls(doc, 'gallery', galleryVersionNumber, galleryIndex, galleryRevisions.length)
    updateTrackControls(doc, 'video', videoVersionNumber, videoIndex, videoRevisions.length)
    updateTrackControls(doc, 'ebc', ebcVersionNumber, ebcIndex, ebcRevisions.length)
    updateEbcModuleControls(doc, ebcRevisions, ebcModulePointers, activePointers?.activeEbcId ?? null)

    const height = doc.documentElement.scrollHeight
    if (height > 0) {
      setIframeHeight(height)
    }
  }, [
    iframeEpoch,
    listing,
    activePointers,
    price,
    titleIndex,
    titleRevisions,
    bulletsRevisions,
    bulletsIndex,
    galleryRevisions,
    galleryIndex,
    videoRevisions,
    videoIndex,
    ebcRevisions,
    ebcModulePointers,
    ebcIndex,
  ])

  useEffect(() => {
    callbacksRef.current.galleryDownload = () => {
      const selected = galleryRevisions.length > galleryIndex ? galleryRevisions[galleryIndex] : null
      if (!selected) return
      const versionNumber = galleryRevisions.length - galleryIndex
      void downloadGalleryRevisionZip(selected, versionNumber).catch((err) => console.error(err))
    }

    callbacksRef.current.ebcDownload = () => {
      const composed = composeEbcRevision(ebcRevisions, ebcModulePointers, activePointers?.activeEbcId ?? null)
      if (!composed) return
      void downloadEbcZip('ebc_current.zip', 'ebc_current', composed).catch((err) => console.error(err))
    }
  }, [galleryRevisions, galleryIndex, ebcRevisions, ebcIndex, ebcModulePointers, activePointers])

  return (
    <div className="flex flex-col h-screen bg-white">
      <iframe
        ref={iframeRef}
        src={`${basePath}/api/fixture/replica.html`}
        className="w-full border-0"
        style={{ height: iframeHeight }}
        title={listing ? listing.label : listingId}
        sandbox="allow-same-origin"
      />
      {titleEditorOpen && listing && (
        <Dialog
          open={titleEditorOpen}
          onClose={() => setTitleEditorOpen(false)}
          fullWidth
          maxWidth="md"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New title version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Write a concise, keyword-rich title for better search rank.
                </Typography>
              </Box>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <TextField
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              multiline
              minRows={4}
              maxRows={8}
              fullWidth
              placeholder="Enter a new title..."
              sx={{
                '& .MuiInputBase-root': {
                  alignItems: 'flex-start',
                  fontSize: 14,
                  lineHeight: 1.45,
                  borderRadius: 2,
                },
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setTitleEditorOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={titleDraft.trim().length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                const res = await fetch(`${basePath}/api/listings/${listing.id}/title`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: titleDraft }),
                })
                if (!res.ok) {
                  window.alert(await res.text())
                  return
                }
                setTitleEditorOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
      {bulletsEditorOpen && listing && (
        <Dialog
          open={bulletsEditorOpen}
          onClose={() => setBulletsEditorOpen(false)}
          fullWidth
          maxWidth="md"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New bullets version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Improve readability and keep each point conversion-focused.
                </Typography>
              </Box>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              {([
                ['bullet1', 'Bullet 1'],
                ['bullet2', 'Bullet 2'],
                ['bullet3', 'Bullet 3'],
                ['bullet4', 'Bullet 4'],
                ['bullet5', 'Bullet 5'],
              ] as const).map(([key, label]) => {
                const charCount = bulletsDraft[key].trim().length

                return (
                  <Box key={key}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {charCount} chars
                      </Typography>
                    </Stack>
                    <TextField
                      value={bulletsDraft[key]}
                      onChange={(e) => setBulletsDraft((current) => ({ ...current, [key]: e.target.value }))}
                      multiline
                      minRows={3}
                      maxRows={7}
                      fullWidth
                      placeholder="Enter bullet text..."
                      variant="outlined"
                      sx={{
                        '& .MuiInputBase-root': {
                          alignItems: 'flex-start',
                          fontSize: 14,
                          lineHeight: 1.45,
                          borderRadius: 2,
                          backgroundColor: 'background.paper',
                        },
                      }}
                    />
                  </Box>
                )
              })}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setBulletsEditorOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                const res = await fetch(`${basePath}/api/listings/${listing.id}/bullets`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    bullet1: bulletsDraft.bullet1,
                    bullet2: bulletsDraft.bullet2,
                    bullet3: bulletsDraft.bullet3,
                    bullet4: bulletsDraft.bullet4,
                    bullet5: bulletsDraft.bullet5,
                  }),
                })
                if (!res.ok) {
                  window.alert(await res.text())
                  return
                }
                setBulletsEditorOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
      {priceEditorOpen && listing && (
        <Dialog
          open={priceEditorOpen}
          onClose={() => setPriceEditorOpen(false)}
          fullWidth
          maxWidth="sm"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                Edit price
              </Typography>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <TextField
                label="Price (USD)"
                value={priceDraft.price}
                onChange={(e) => setPriceDraft((current) => ({ ...current, price: e.target.value }))}
                placeholder="8.99"
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Unit price (optional)"
                  value={priceDraft.perUnitPrice}
                  onChange={(e) => setPriceDraft((current) => ({ ...current, perUnitPrice: e.target.value }))}
                  placeholder="1.50"
                  fullWidth
                />
                <TextField
                  label="Unit (optional)"
                  value={priceDraft.perUnitUnit}
                  onChange={(e) => setPriceDraft((current) => ({ ...current, perUnitUnit: e.target.value }))}
                  placeholder="count"
                  fullWidth
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Unit price renders like <strong>($1.50 / count)</strong>.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setPriceEditorOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={priceDraft.price.trim().length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                const nextPriceCents = parseUsdToCents(priceDraft.price)
                if (nextPriceCents === null) {
                  window.alert('Enter a valid price (e.g. 8.99).')
                  return
                }

                const nextPerUnitCents = parseUsdToCents(priceDraft.perUnitPrice)
                const nextPerUnitUnit = priceDraft.perUnitUnit.trim()
                if (nextPerUnitCents !== null && nextPerUnitUnit.length === 0) {
                  window.alert('Unit is required when unit price is set (e.g. count).')
                  return
                }

                const res = await fetch(`${basePath}/api/listings/${listing.id}/price`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    priceCents: nextPriceCents,
                    pricePerUnitCents: nextPerUnitCents,
                    pricePerUnitUnit: nextPerUnitCents !== null ? nextPerUnitUnit : null,
                  }),
                })
                if (!res.ok) {
                  window.alert(await res.text())
                  return
                }
                setPriceEditorOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Save
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
      {galleryUploaderOpen && listing && (
        <Dialog
          open={galleryUploaderOpen}
          onClose={() => setGalleryUploaderOpen(false)}
          fullWidth
          maxWidth="sm"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                New gallery version
              </Typography>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={1.5}>
              <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                Select images
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : []
                    setGalleryFiles(list)
                  }}
                />
              </MuiButton>
              <Typography variant="caption" color="text.secondary">
                {galleryFiles.length > 0 ? `${galleryFiles.length} file(s) selected` : 'Select up to 6 JPG/PNG/WebP/AVIF files.'}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setGalleryUploaderOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={galleryFiles.length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                if (galleryFiles.length > 6) {
                  window.alert('Gallery supports up to 6 images. Upload video separately.')
                  return
                }

                const sizeError = getUploadSizeError(galleryFiles, CLOUDFLARE_MAX_UPLOAD_BYTES)
                if (sizeError) {
                  window.alert(sizeError)
                  return
                }

                const form = new FormData()
                for (const file of galleryFiles) {
                  form.append('files', file)
                }

                const res = await fetch(`${basePath}/api/listings/${listing.id}/gallery`, {
                  method: 'POST',
                  body: form,
                })
                if (!res.ok) {
                  if (res.status === 413) {
                    window.alert('Upload too large. Max upload size is 100MB per request.')
                    return
                  }
                  window.alert(await res.text())
                  return
                }
                setGalleryUploaderOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Upload new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
      {videoUploaderOpen && listing && (
        <Dialog
          open={videoUploaderOpen}
          onClose={() => setVideoUploaderOpen(false)}
          fullWidth
          maxWidth="sm"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                New video version
              </Typography>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Video file
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select video
                  <input
                    hidden
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => {
                      const file = e.target.files ? e.target.files[0] : null
                      setVideoFile(file)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {videoFile ? videoFile.name : 'Accepted formats: MP4, WebM'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Poster image (optional)
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select poster
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files ? e.target.files[0] : null
                      setVideoPosterFile(file)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {videoPosterFile ? videoPosterFile.name : 'Optional image shown before playback'}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setVideoUploaderOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={!videoFile}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                if (!videoFile) return

                const selectedFiles = videoPosterFile ? [videoFile, videoPosterFile] : [videoFile]
                const sizeError = getUploadSizeError(selectedFiles, CLOUDFLARE_MAX_UPLOAD_BYTES)
                if (sizeError) {
                  window.alert(sizeError)
                  return
                }

                const form = new FormData()
                form.append('file', videoFile)
                if (videoPosterFile) form.append('poster', videoPosterFile)

                const res = await fetch(`${basePath}/api/listings/${listing.id}/video`, {
                  method: 'POST',
                  body: form,
                })
                if (!res.ok) {
                  if (res.status === 413) {
                    window.alert('Upload too large. Max upload size is 100MB per request.')
                    return
                  }
                  window.alert(await res.text())
                  return
                }
                setVideoUploaderOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Upload new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
      {ebcModuleEditorOpen && listing && ebcModuleEditorTarget && (
        <Dialog
          open={ebcModuleEditorOpen}
          onClose={() => setEbcModuleEditorOpen(false)}
          fullWidth
          maxWidth="md"
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
              },
            },
            backdrop: {
              sx: {
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New A+ module version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {ebcModuleEditorTarget.sectionType} • Module {ebcModuleEditorTarget.modulePosition + 1}
                </Typography>
              </Box>
              <Chip
                label={`ASIN ${listing.asin}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Headline
                </Typography>
                <TextField
                  value={ebcModuleDraft.headline}
                  onChange={(e) => setEbcModuleDraft((current) => ({ ...current, headline: e.target.value }))}
                  multiline
                  minRows={2}
                  maxRows={4}
                  fullWidth
                  placeholder="Enter headline..."
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Body
                </Typography>
                <TextField
                  value={ebcModuleDraft.bodyText}
                  onChange={(e) => setEbcModuleDraft((current) => ({ ...current, bodyText: e.target.value }))}
                  multiline
                  minRows={5}
                  maxRows={10}
                  fullWidth
                  placeholder="Enter body text..."
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Images (optional)
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select images
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const list = e.target.files ? Array.from(e.target.files) : []
                      setEbcModuleFiles(list)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {ebcModuleFiles.length > 0 ? `${ebcModuleFiles.length} file(s) selected` : 'Leave empty to keep current images.'}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={() => setEbcModuleEditorOpen(false)}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={async () => {
                const sizeError = getUploadSizeError(ebcModuleFiles, CLOUDFLARE_MAX_UPLOAD_BYTES)
                if (sizeError) {
                  window.alert(sizeError)
                  return
                }

                const form = new FormData()
                form.append('sectionType', ebcModuleEditorTarget.sectionType)
                form.append('modulePosition', String(ebcModuleEditorTarget.modulePosition))
                form.append('headline', ebcModuleDraft.headline)
                form.append('bodyText', ebcModuleDraft.bodyText)
                for (const file of ebcModuleFiles) {
                  form.append('files', file)
                }

                const res = await fetch(`${basePath}/api/listings/${listing.id}/ebc/module`, {
                  method: 'POST',
                  body: form,
                })
                if (!res.ok) {
                  if (res.status === 413) {
                    window.alert('Upload too large. Max upload size is 100MB per request.')
                    return
                  }
                  window.alert(await res.text())
                  return
                }
                setEbcModuleEditorOpen(false)
                setRefreshKey((current) => current + 1)
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      )}
    </div>
  )
}

interface TitleRevision {
  id: string
  seq: number
  createdAt: string
  title: string
  note: string | null
  origin: string
}

interface BulletsRevision {
  id: string
  seq: number
  createdAt: string
  bullet1: string | null
  bullet2: string | null
  bullet3: string | null
  bullet4: string | null
  bullet5: string | null
}

interface GalleryApiRevision {
  id: string
  seq: number
  createdAt: string
  slots: {
    position: number
    media: { filePath: string; sourceUrl: string | null }
  }[]
}

interface GalleryRevision {
  id: string
  seq: number
  createdAt: string
  images: GalleryImage[]
}

interface GalleryImage {
  position: number
  src: string
  hiRes: string | null
  isVideo: boolean
}

interface VideoApiRevision {
  id: string
  seq: number
  createdAt: string
  media: { filePath: string; sourceUrl: string | null }
  posterMedia: { filePath: string; sourceUrl: string | null } | null
}

interface VideoRevision {
  id: string
  seq: number
  createdAt: string
  src: string
  posterSrc: string | null
}

interface EbcModulePointerApi {
  sectionType: string
  modulePosition: number
  ebcRevisionId: string
}

interface EbcApiRevision {
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

interface EbcRevision {
  id: string
  seq: number
  createdAt: string
  sections: EbcSection[]
}

interface EbcSection {
  sectionType: string
  heading: string | null
  modules: EbcModule[]
}

interface EbcModule {
  moduleType: string
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

function toGalleryRevision(rev: GalleryApiRevision): GalleryRevision {
  const images = rev.slots
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((slot) => ({
      position: slot.position,
      src: slot.media.sourceUrl === null ? slot.media.filePath : slot.media.sourceUrl,
      hiRes: slot.media.sourceUrl,
      isVideo: false,
    }))

  return {
    id: rev.id,
    seq: rev.seq,
    createdAt: rev.createdAt,
    images,
  }
}

function toVideoRevision(rev: VideoApiRevision): VideoRevision {
  const src = rev.media.sourceUrl === null ? rev.media.filePath : rev.media.sourceUrl
  const posterSrc = rev.posterMedia
    ? (rev.posterMedia.sourceUrl === null ? rev.posterMedia.filePath : rev.posterMedia.sourceUrl)
    : null

  return {
    id: rev.id,
    seq: rev.seq,
    createdAt: rev.createdAt,
    src,
    posterSrc,
  }
}

function toEbcRevision(rev: EbcApiRevision): EbcRevision {
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
                src: img.media.sourceUrl === null ? img.media.filePath : img.media.sourceUrl,
                alt: img.altText,
              })),
          })),
      })),
  }
}

function resolveImageSrc(src: string): string {
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

function ebcModulePointerKey(sectionType: string, modulePosition: number): string {
  return `${sectionType}:${modulePosition}`
}

function composeEbcRevision(
  all: EbcRevision[],
  pointers: Record<string, string>,
  liveRevisionId: string | null,
): EbcRevision | null {
  if (all.length === 0) return null

  const baseId = liveRevisionId ? liveRevisionId : all[0].id
  const base = all.find((rev) => rev.id === baseId) ?? all[0]

  const byId = new Map<string, EbcRevision>()
  for (const rev of all) {
    byId.set(rev.id, rev)
  }

  const sections: EbcSection[] = base.sections.map((section) => {
    const modules: EbcModule[] = section.modules.map((_mod, modulePosition) => {
      const key = ebcModulePointerKey(section.sectionType, modulePosition)
      const selectedRevisionId = pointers[key]
      const revisionId = selectedRevisionId ? selectedRevisionId : base.id
      const srcRevision = byId.get(revisionId)
      if (!srcRevision) return section.modules[modulePosition]

      const srcSection = srcRevision.sections.find((s) => s.sectionType === section.sectionType) ?? null
      const srcModule = srcSection ? srcSection.modules[modulePosition] ?? null : null
      return srcModule ? srcModule : section.modules[modulePosition]
    })

    return {
      sectionType: section.sectionType,
      heading: section.heading,
      modules,
    }
  })

  return {
    id: base.id,
    seq: base.seq,
    createdAt: base.createdAt,
    sections,
  }
}

function moduleSignature(mod: EbcModule): string {
  return JSON.stringify({
    moduleType: mod.moduleType,
    headline: mod.headline,
    bodyText: mod.bodyText,
    images: mod.images.map((img) => img.src),
  })
}

function getEbcModuleHistory(
  all: EbcRevision[],
  sectionType: string,
  modulePosition: number,
): { revisionId: string; seq: number; module: EbcModule }[] {
  const history: { revisionId: string; seq: number; module: EbcModule }[] = []
  let lastSig: string | null = null

  for (const rev of all) {
    const section = rev.sections.find((s) => s.sectionType === sectionType) ?? null
    if (!section) continue
    const mod = section.modules[modulePosition] ?? null
    if (!mod) continue
    const sig = moduleSignature(mod)
    if (lastSig !== sig) {
      history.push({ revisionId: rev.id, seq: rev.seq, module: mod })
      lastSig = sig
    }
  }

  return history
}

function updateEbcModuleControls(
  doc: Document,
  allRevisions: EbcRevision[],
  pointers: Record<string, string>,
  liveRevisionId: string | null,
) {
  const controls = Array.from(doc.querySelectorAll<HTMLElement>('.argus-vc-ebc-module-controls'))
  for (const control of controls) {
    const sectionType = control.dataset.sectionType
    const modulePositionValue = control.dataset.modulePosition
    if (!sectionType || !modulePositionValue) continue

    const modulePosition = Number(modulePositionValue)
    if (!Number.isFinite(modulePosition)) continue

    const history = getEbcModuleHistory(allRevisions, sectionType, modulePosition)
    if (history.length === 0) continue

    const key = ebcModulePointerKey(sectionType, modulePosition)
    const selectedRevisionId = pointers[key]
    const activeId = selectedRevisionId ? selectedRevisionId : liveRevisionId
    const effectiveId = activeId ? activeId : history[0].revisionId

    const index = history.findIndex((item) => item.revisionId === effectiveId)
    const safeIndex = index >= 0 ? index : 0

    const label = control.querySelector<HTMLElement>('.argus-vc-label')
    if (label) {
      label.textContent = `Module v${history.length - safeIndex}`
    }

    const prev = control.querySelector<HTMLButtonElement>('button[data-dir="prev"]')
    const next = control.querySelector<HTMLButtonElement>('button[data-dir="next"]')
    const del = control.querySelector<HTMLButtonElement>('button[data-action="delete"]')

    if (prev) prev.disabled = safeIndex >= history.length - 1
    if (next) next.disabled = safeIndex <= 0
    if (del) del.disabled = false
  }
}

function fileExt(path: string): string {
  const match = path.match(/\.[a-z0-9]+(?=$|\?)/iu)
  return match ? match[0] : ''
}

async function downloadFilesAsZip(
  zipName: string,
  files: { url: string; filename: string }[],
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  for (const file of files) {
    const res = await fetch(file.url)
    if (!res.ok) {
      throw new Error(`Failed to download ${file.url}`)
    }
    const data = await res.arrayBuffer()
    zip.file(file.filename, data)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

async function downloadGalleryRevisionZip(rev: GalleryRevision, versionNumber: number) {
  const files = rev.images
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 6)
    .map((img) => {
      const downloadSrc = img.hiRes ? img.hiRes : img.src
      const ext = fileExt(downloadSrc)
      return {
        url: resolveImageSrc(downloadSrc),
        filename: `gallery_v${versionNumber}_${String(img.position).padStart(2, '0')}${ext}`,
      }
    })

  await downloadFilesAsZip(`gallery_v${versionNumber}.zip`, files)
}

async function downloadEbcZip(zipName: string, filePrefix: string, rev: EbcRevision) {
  const files: { url: string; filename: string }[] = []
  for (let si = 0; si < rev.sections.length; si++) {
    const section = rev.sections[si]
    for (let mi = 0; mi < section.modules.length; mi++) {
      const mod = section.modules[mi]
      for (let ii = 0; ii < mod.images.length; ii++) {
        const img = mod.images[ii]
        const ext = fileExt(img.src)
        files.push({
          url: resolveImageSrc(img.src),
          filename: `${filePrefix}_s${si + 1}_m${mi + 1}_i${ii + 1}${ext}`,
        })
      }
    }
  }

  await downloadFilesAsZip(zipName, files)
}

function injectArgusVersionControls(
  doc: Document,
  callbacksRef: RefObject<{
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
  }>,
) {
  if (!doc.getElementById('argus-vc-style')) {
    const style = doc.createElement('style')
    style.id = 'argus-vc-style'
    style.textContent = `
      .argus-vc-controls {
        position: absolute;
        top: 6px;
        right: 6px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(180, 180, 180, 0.9);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        font-size: 12px;
        color: #555;
      }
      .argus-vc-btn {
        all: unset;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background: #f0f0f0;
        border: 1px solid #cfcfcf;
        color: #666;
        line-height: 1;
        user-select: none;
      }
      .argus-vc-btn:hover { background: #e6e6e6; }
      .argus-vc-btn.argus-vc-danger {
        background: #fff1f1;
        border-color: rgba(220, 38, 38, 0.35);
        color: rgb(185, 28, 28);
      }
      .argus-vc-btn.argus-vc-danger:hover { background: #ffe5e5; }
      .argus-vc-btn[disabled] { opacity: 0.4; cursor: default; }
      .argus-vc-label { user-select: none; white-space: nowrap; }
      .argus-vc-highlight { outline: 2px solid rgba(160, 160, 160, 0.7); outline-offset: 2px; }
      .argus-ebc-placeholder {
        position: relative !important;
        min-height: 72px;
        border: 1px dashed rgba(148, 163, 184, 0.85);
        border-radius: 10px;
        background: rgba(248, 250, 252, 0.85);
      }
      .argus-ebc-placeholder > :not(.argus-vc-ebc-module-controls) { display: none !important; }
      .argus-ebc-placeholder::after {
        content: attr(data-argus-ebc-placeholder);
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        text-align: center;
        color: #6b7280;
        font-weight: 600;
        font-size: 13px;
        pointer-events: none;
        z-index: 2;
      }
      a { cursor: default !important; }
    `
    doc.head.append(style)
  }

  const imageBlock = doc.querySelector<HTMLElement>('#imageBlock')
  if (imageBlock) {
    ensureTrackControls(doc, imageBlock, 'gallery', 'Images', callbacksRef)
    ensureGalleryThumbnailSwap(doc, callbacksRef)
  }

  const titleSectionCandidate = doc.querySelector<HTMLElement>('#titleSection')
  const titleSection = titleSectionCandidate ? titleSectionCandidate : doc.querySelector<HTMLElement>('#title')
  if (titleSection) {
    ensureTrackControls(doc, titleSection, 'title', 'Title', callbacksRef)
  }

  const bullets = doc.querySelector<HTMLElement>('#feature-bullets')
  if (bullets) {
    ensureTrackControls(doc, bullets, 'bullets', 'Bullets', callbacksRef)
  }

  const price = doc.querySelector<HTMLElement>('#corePrice_feature_div') ?? doc.querySelector<HTMLElement>('#corePriceDisplay_desktop_feature_div')
  if (price) {
    ensurePriceControls(doc, price, callbacksRef)
  }

  const video = doc.getElementById('video-outer-container') as HTMLElement | null
    ?? doc.querySelector<HTMLElement>('ul.desktop-media-mainView li[data-csa-c-media-type="VIDEO"]')
    ?? doc.querySelector<HTMLElement>('[data-elementid="vse-vw-dp-widget-container"]')
    ?? doc.querySelector<HTMLElement>('#ive-hero-video-player')
  if (video) {
    ensureTrackControls(doc, video, 'video', 'Video', callbacksRef)
  }

	  const ebc = doc.querySelector<HTMLElement>('#aplus_feature_div') ?? doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
	  if (ebc) {
	    ensureTrackControls(doc, ebc, 'ebc', 'A+ Content', callbacksRef)
	  }

	  const brandContainer = doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
	  if (brandContainer) {
	    const modules = Array.from(brandContainer.querySelectorAll<HTMLElement>('.aplus-module'))
	    for (let i = 0; i < modules.length; i++) {
	      ensureEbcModuleControls(doc, modules[i], 'BRAND_STORY', i, callbacksRef)
	    }
	  }

	  const descriptionContainer = doc.querySelector<HTMLElement>('#aplus_feature_div')
	  if (descriptionContainer) {
	    const modules = Array.from(descriptionContainer.querySelectorAll<HTMLElement>('.aplus-module'))
	    for (let i = 0; i < modules.length; i++) {
	      ensureEbcModuleControls(doc, modules[i], 'PRODUCT_DESCRIPTION', i, callbacksRef)
	    }
	  }

	  const swatches = Array.from(doc.querySelectorAll<HTMLElement>('#twister_feature_div li[data-asin]'))
	  for (const swatch of swatches) {
	    const asin = swatch.getAttribute('data-asin')
	    if (!asin) continue
	    if (swatch.dataset.argusVariationBound === 'true') continue
	    swatch.dataset.argusVariationBound = 'true'
	    swatch.style.cursor = 'pointer'
	    swatch.addEventListener(
	      'click',
	      (e) => {
	        e.preventDefault()
	        e.stopImmediatePropagation()
	        e.stopPropagation()
	        applyVariationSelection(doc, asin)
	        callbacksRef.current?.variationSelect(asin)
	      },
	      true,
	    )
	  }
	}

function ensurePriceControls(
  doc: Document,
  target: HTMLElement,
  callbacksRef: RefObject<{
    priceEdit: () => void
    priceDelete: () => void
  }>,
) {
  target.classList.add('argus-vc-highlight')
  if (!target.style.position) {
    target.style.position = 'relative'
  }

  const controlsId = 'argus-vc-controls-price'
  if (doc.getElementById(controlsId)) return

  const controls = doc.createElement('div')
  controls.id = controlsId
  controls.className = 'argus-vc-controls'

  const label = doc.createElement('span')
  label.id = 'argus-vc-label-price'
  label.className = 'argus-vc-label'
  label.textContent = 'Price —'

  const edit = doc.createElement('button')
  edit.className = 'argus-vc-btn'
  edit.type = 'button'
  edit.textContent = '✎'
  edit.title = 'Edit price'
  edit.addEventListener('click', () => callbacksRef.current?.priceEdit())

  const del = doc.createElement('button')
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = 'Clear price override'
  del.addEventListener('click', () => callbacksRef.current?.priceDelete())

  controls.append(label, edit, del)
  target.append(controls)
}

function ensureTrackControls(
  doc: Document,
  target: HTMLElement,
  track: 'title' | 'bullets' | 'gallery' | 'video' | 'ebc',
  label: string,
  callbacksRef: RefObject<{
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
  }>,
) {
  target.classList.add('argus-vc-highlight')
  if (!target.style.position) {
    target.style.position = 'relative'
  }

  const controlsId = `argus-vc-controls-${track}`
  if (doc.getElementById(controlsId)) return

  const controls = doc.createElement('div')
  controls.id = controlsId
  controls.className = 'argus-vc-controls'

  const prev = doc.createElement('button')
  prev.id = `argus-vc-prev-${track}`
  prev.className = 'argus-vc-btn'
  prev.type = 'button'
  prev.textContent = '‹'
  prev.addEventListener('click', () => {
    if (track === 'title') callbacksRef.current?.titlePrev()
    if (track === 'bullets') callbacksRef.current?.bulletsPrev()
    if (track === 'gallery') callbacksRef.current?.galleryPrev()
    if (track === 'video') callbacksRef.current?.videoPrev()
    if (track === 'ebc') callbacksRef.current?.ebcPrev()
  })

  const span = doc.createElement('span')
  span.id = `argus-vc-label-${track}`
  span.className = 'argus-vc-label'
  span.textContent = label

  const next = doc.createElement('button')
  next.id = `argus-vc-next-${track}`
  next.className = 'argus-vc-btn'
  next.type = 'button'
  next.textContent = '›'
  next.addEventListener('click', () => {
    if (track === 'title') callbacksRef.current?.titleNext()
    if (track === 'bullets') callbacksRef.current?.bulletsNext()
    if (track === 'gallery') callbacksRef.current?.galleryNext()
    if (track === 'video') callbacksRef.current?.videoNext()
    if (track === 'ebc') callbacksRef.current?.ebcNext()
  })

  controls.append(prev, span, next)

  const live = doc.createElement('button')
  live.id = `argus-vc-live-${track}`
  live.className = 'argus-vc-btn'
  live.type = 'button'
  live.textContent = '⟲'
  live.title = 'Jump to live'
  live.addEventListener('click', () => {
    if (track === 'title') callbacksRef.current?.titleLive()
    if (track === 'bullets') callbacksRef.current?.bulletsLive()
    if (track === 'gallery') callbacksRef.current?.galleryLive()
    if (track === 'video') callbacksRef.current?.videoLive()
    if (track === 'ebc') callbacksRef.current?.ebcLive()
  })
  controls.append(live)

  if (track === 'title') {
    const edit = doc.createElement('button')
    edit.id = `argus-vc-edit-${track}`
    edit.className = 'argus-vc-btn'
    edit.type = 'button'
    edit.textContent = '✎'
    edit.title = 'New version'
    edit.addEventListener('click', () => callbacksRef.current?.titleEdit())
    controls.append(edit)
  }

  if (track === 'bullets') {
    const edit = doc.createElement('button')
    edit.id = `argus-vc-edit-${track}`
    edit.className = 'argus-vc-btn'
    edit.type = 'button'
    edit.textContent = '✎'
    edit.title = 'New version'
    edit.addEventListener('click', () => callbacksRef.current?.bulletsEdit())
    controls.append(edit)
  }

  if (track === 'gallery') {
    const upload = doc.createElement('button')
    upload.id = `argus-vc-upload-${track}`
    upload.className = 'argus-vc-btn'
    upload.type = 'button'
    upload.textContent = '⬆'
    upload.title = 'Upload new version'
    upload.addEventListener('click', () => callbacksRef.current?.galleryUpload())
    controls.append(upload)

    const download = doc.createElement('button')
    download.id = `argus-vc-download-${track}`
    download.className = 'argus-vc-btn'
    download.type = 'button'
    download.textContent = '⬇'
    download.title = 'Download images'
    download.addEventListener('click', () => callbacksRef.current?.galleryDownload())
    controls.append(download)
  }

  if (track === 'video') {
    const upload = doc.createElement('button')
    upload.id = `argus-vc-upload-${track}`
    upload.className = 'argus-vc-btn'
    upload.type = 'button'
    upload.textContent = '⬆'
    upload.title = 'Upload new version'
    upload.addEventListener('click', () => callbacksRef.current?.videoUpload())
    controls.append(upload)
  }

  if (track === 'ebc') {
    const download = doc.createElement('button')
    download.id = `argus-vc-download-${track}`
    download.className = 'argus-vc-btn'
    download.type = 'button'
    download.textContent = '⬇'
    download.title = 'Download images'
    download.addEventListener('click', () => callbacksRef.current?.ebcDownload())
    controls.append(download)
  }

  const del = doc.createElement('button')
  del.id = `argus-vc-delete-${track}`
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = track === 'ebc' ? 'Clear overrides' : 'Delete version'
  del.addEventListener('click', () => {
    if (track === 'title') callbacksRef.current?.titleDelete()
    if (track === 'bullets') callbacksRef.current?.bulletsDelete()
    if (track === 'gallery') callbacksRef.current?.galleryDelete()
    if (track === 'video') callbacksRef.current?.videoDelete()
    if (track === 'ebc') callbacksRef.current?.ebcDelete()
  })
  controls.append(del)

  target.append(controls)
}

function ensureEbcModuleControls(
  doc: Document,
  target: HTMLElement,
  sectionType: string,
  modulePosition: number,
  callbacksRef: RefObject<{
    ebcModulePrev: (sectionType: string, modulePosition: number) => void
    ebcModuleNext: (sectionType: string, modulePosition: number) => void
    ebcModuleLive: (sectionType: string, modulePosition: number) => void
    ebcModuleEdit: (sectionType: string, modulePosition: number) => void
    ebcModuleDelete: (sectionType: string, modulePosition: number) => void
  }>,
) {
  if (!target.style.position) {
    target.style.position = 'relative'
  }

  const controlsId = `argus-vc-controls-ebc-${sectionType}-${modulePosition}`
  if (doc.getElementById(controlsId)) return

  const controls = doc.createElement('div')
  controls.id = controlsId
  controls.className = 'argus-vc-controls argus-vc-ebc-module-controls'
  controls.dataset.sectionType = sectionType
  controls.dataset.modulePosition = String(modulePosition)

  const prev = doc.createElement('button')
  prev.className = 'argus-vc-btn'
  prev.type = 'button'
  prev.textContent = '‹'
  prev.title = 'Previous version'
  prev.dataset.dir = 'prev'
  prev.addEventListener('click', () => callbacksRef.current?.ebcModulePrev(sectionType, modulePosition))

  const label = doc.createElement('span')
  label.className = 'argus-vc-label'
  label.textContent = 'Module —'

  const next = doc.createElement('button')
  next.className = 'argus-vc-btn'
  next.type = 'button'
  next.textContent = '›'
  next.title = 'Next version'
  next.dataset.dir = 'next'
  next.addEventListener('click', () => callbacksRef.current?.ebcModuleNext(sectionType, modulePosition))

  const live = doc.createElement('button')
  live.className = 'argus-vc-btn'
  live.type = 'button'
  live.textContent = '⟲'
  live.title = 'Jump to live'
  live.addEventListener('click', () => callbacksRef.current?.ebcModuleLive(sectionType, modulePosition))

  const edit = doc.createElement('button')
  edit.className = 'argus-vc-btn'
  edit.type = 'button'
  edit.textContent = '✎'
  edit.title = 'New version'
  edit.addEventListener('click', () => callbacksRef.current?.ebcModuleEdit(sectionType, modulePosition))

  const del = doc.createElement('button')
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = 'Clear module'
  del.dataset.action = 'delete'
  del.addEventListener('click', () => callbacksRef.current?.ebcModuleDelete(sectionType, modulePosition))

  controls.append(prev, label, next, live, edit, del)
  target.append(controls)
}

function updateTrackControls(
  doc: Document,
  track: 'title' | 'bullets' | 'gallery' | 'video' | 'ebc',
  seq: number | undefined,
  index: number,
  count: number,
) {
  const label = doc.getElementById(`argus-vc-label-${track}`)
  if (label) {
    const prefix = track === 'title'
      ? 'Title'
      : track === 'gallery'
        ? 'Images'
        : track === 'video'
          ? 'Video'
          : track === 'ebc'
            ? 'A+ Content'
            : 'Bullets'
    label.textContent = seq ? `${prefix} v${seq}` : `${prefix} —`
  }

  const prev = doc.getElementById(`argus-vc-prev-${track}`) as HTMLButtonElement | null
  const next = doc.getElementById(`argus-vc-next-${track}`) as HTMLButtonElement | null
  const live = doc.getElementById(`argus-vc-live-${track}`) as HTMLButtonElement | null
  const del = doc.getElementById(`argus-vc-delete-${track}`) as HTMLButtonElement | null
  const download = doc.getElementById(`argus-vc-download-${track}`) as HTMLButtonElement | null

  if (prev) prev.disabled = count === 0 ? true : index >= count - 1
  if (next) next.disabled = count === 0 ? true : index <= 0
  if (live) live.disabled = count === 0
  if (download) download.disabled = count === 0
  if (del && track !== 'ebc') del.disabled = count === 0
}

function applyTitle(doc: Document, title: string | null) {
  const productTitle = doc.getElementById('productTitle')
  if (!productTitle) return
  productTitle.textContent = title ?? ''
}

function applyPrice(doc: Document, price: ListingPriceState | null) {
  const cents = price?.priceCents ?? null
  const perUnitCents = price?.pricePerUnitCents ?? null
  const perUnitUnit = price?.pricePerUnitUnit ?? null

  const label = doc.getElementById('argus-vc-label-price')
  if (label) {
    label.textContent = cents !== null ? `Price $${formatUsdFromCents(cents)}` : 'Price —'
  }

  function setWhole(whole: HTMLElement, next: string) {
    const decimal = whole.querySelector<HTMLElement>('.a-price-decimal')
    if (!decimal) {
      whole.textContent = next
      return
    }

    const textNode = Array.from(whole.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE) ?? null
    if (textNode) {
      textNode.textContent = next
      return
    }

    whole.insertBefore(doc.createTextNode(next), decimal)
  }

  const priceToPayNodes = Array.from(doc.querySelectorAll<HTMLElement>('.apex-pricetopay-value'))
  for (const node of priceToPayNodes) {
    const symbol = node.querySelector<HTMLElement>('.a-price-symbol')
    if (symbol) symbol.textContent = '$'

    const whole = node.querySelector<HTMLElement>('.a-price-whole')
    const fraction = node.querySelector<HTMLElement>('.a-price-fraction')
    const decimal = whole ? whole.querySelector<HTMLElement>('.a-price-decimal') : null

    if (!whole || !fraction) continue

    if (cents === null) {
      setWhole(whole, '—')
      if (decimal) decimal.style.display = 'none'
      fraction.textContent = ''
      fraction.style.display = 'none'
      continue
    }

    const [wholePart, fractionPart] = formatUsdFromCents(cents).split('.')
    setWhole(whole, wholePart)
    if (decimal) decimal.style.display = ''
    fraction.textContent = fractionPart
    fraction.style.display = ''
  }

  const accessibilityLabel = doc.getElementById('apex-pricetopay-accessibility-label')
  if (accessibilityLabel) {
    accessibilityLabel.textContent = cents !== null ? `$${formatUsdFromCents(cents)}` : '—'
  }

  const showPerUnit = perUnitCents !== null && typeof perUnitUnit === 'string' && perUnitUnit.trim().length > 0
  const perUnitWrappers = Array.from(doc.querySelectorAll<HTMLElement>('.contains-ppu'))
  for (const wrapper of perUnitWrappers) {
    wrapper.style.display = showPerUnit ? '' : 'none'
  }

  if (!showPerUnit || perUnitCents === null || !perUnitUnit) return

  const perUnitText = `$${formatUsdFromCents(perUnitCents)}`

  const perUnitLabels = Array.from(doc.querySelectorAll<HTMLElement>('.apex-priceperunit-accessibility-label'))
  for (const perUnitLabel of perUnitLabels) {
    perUnitLabel.textContent = `${perUnitText} per ${perUnitUnit}`
  }

  const perUnitValues = Array.from(doc.querySelectorAll<HTMLElement>('.apex-priceperunit-value'))
  for (const perUnitValue of perUnitValues) {
    const offscreen = perUnitValue.querySelector<HTMLElement>('.a-offscreen')
    if (offscreen) offscreen.textContent = perUnitText
    const visible = perUnitValue.querySelector<HTMLElement>('[aria-hidden="true"]')
    if (visible) visible.textContent = perUnitText
  }

  const perUnitContainers = Array.from(doc.querySelectorAll<HTMLElement>('.pricePerUnit'))
  for (const perUnitContainer of perUnitContainers) {
    const textNodes = Array.from(perUnitContainer.childNodes).filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
    const tail = textNodes.length > 0 ? textNodes[textNodes.length - 1] : null
    if (tail) tail.textContent = ` / ${perUnitUnit})`
  }
}

function applyBullets(doc: Document, rev: BulletsRevision | null) {
  const list = doc.querySelector('#feature-bullets ul')
  if (!list) return

  const template = list.querySelector('li')
  list.querySelectorAll('li').forEach((li) => li.remove())
  if (!rev) {
    return
  }

  const bullets = [rev.bullet1, rev.bullet2, rev.bullet3, rev.bullet4, rev.bullet5]
    .filter((b): b is string => b !== null)

  for (const text of bullets) {
    const li = template ? template.cloneNode(true) as HTMLLIElement : doc.createElement('li')
    const existingSpan = li.querySelector('.a-list-item')
    const span = existingSpan ? existingSpan : doc.createElement('span')
    span.textContent = text
    if (!span.classList.contains('a-list-item')) span.classList.add('a-list-item')
    if (!li.contains(span)) li.append(span)
    list.append(li)
  }
}

type ArgusReplicaDocument = Document & {
  __argusMainMediaIndex?: number
  __argusVideoBaseline?: string
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function svgPlaceholderDataUrl(label: string): string {
  const text = escapeSvgText(label)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${text}">
  <rect width="800" height="800" fill="#f3f4f6"/>
  <rect x="44" y="44" width="712" height="712" rx="28" fill="#ffffff" stroke="#d1d5db" stroke-width="4"/>
  <path d="M260 360h280v16H260zm0 48h280v16H260z" fill="#c7cdd6"/>
  <circle cx="320" cy="300" r="32" fill="#c7cdd6"/>
  <text x="400" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#6b7280">${text}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const ARGUS_GALLERY_PLACEHOLDER_MAIN = svgPlaceholderDataUrl('Upload images')
const ARGUS_GALLERY_PLACEHOLDER_THUMB = svgPlaceholderDataUrl('Upload')
const ARGUS_EBC_PLACEHOLDER_IMAGE = svgPlaceholderDataUrl('Upload image')
const ARGUS_GALLERY_THUMB_SIZE_PX = 48

function sizeGalleryThumbImage(img: HTMLImageElement) {
  img.width = ARGUS_GALLERY_THUMB_SIZE_PX
  img.height = ARGUS_GALLERY_THUMB_SIZE_PX
  img.style.width = `${ARGUS_GALLERY_THUMB_SIZE_PX}px`
  img.style.height = `${ARGUS_GALLERY_THUMB_SIZE_PX}px`
  img.style.objectFit = 'contain'
  img.style.display = 'block'
}

function itemNoFromElement(el: Element): number | null {
  for (const cls of Array.from(el.classList)) {
    const match = /^itemNo(\d+)$/iu.exec(cls)
    if (!match) continue
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
  }
  return null
}

function setDesktopMediaMainViewIndex(doc: Document, index: number) {
  const mainView = doc.querySelector<HTMLElement>('ul.desktop-media-mainView')
  if (!mainView) return

  const items = Array.from(mainView.querySelectorAll<HTMLElement>('li'))
  if (items.length === 0) return

  const target = items.find((li) => itemNoFromElement(li) === index) ?? null
  if (!target) return

  for (const li of items) {
    const isSelected = li === target
    li.style.display = isSelected ? '' : 'none'
    if (isSelected) {
      li.classList.add('selected')
    } else {
      li.classList.remove('selected')
    }
  }
}

function setAltImagesSelection(altList: Element, selectedLi: Element | null) {
  const buttons = Array.from(altList.querySelectorAll<HTMLElement>('.a-button-thumbnail'))
  for (const button of buttons) {
    button.classList.remove('a-button-selected')
  }

  const radioButtons = Array.from(altList.querySelectorAll<HTMLButtonElement>('button[role="radio"]'))
  for (const radio of radioButtons) {
    radio.setAttribute('aria-checked', 'false')
  }

  if (!selectedLi) return

  const selectedButton = selectedLi.querySelector<HTMLElement>('.a-button-thumbnail')
  if (selectedButton) selectedButton.classList.add('a-button-selected')

  const selectedRadio = selectedLi.querySelector<HTMLButtonElement>('button[role="radio"]')
  if (selectedRadio) selectedRadio.setAttribute('aria-checked', 'true')
}

function applyGallery(doc: Document, rev: GalleryRevision | null) {
  const storedDoc = doc as ArgusReplicaDocument

  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  const altImages = doc.getElementById('altImages') as HTMLElement | null
  const altList = doc.querySelector<HTMLElement>('#altImages ul')

  if (storedDoc.__argusMainMediaIndex === undefined) {
    storedDoc.__argusMainMediaIndex = 0
  }

  if (!rev || rev.images.length === 0) {
    if (landing) {
      landing.style.visibility = ''
      landing.src = ARGUS_GALLERY_PLACEHOLDER_MAIN
      landing.setAttribute('data-old-hires', ARGUS_GALLERY_PLACEHOLDER_MAIN)
    }

    if (altImages) {
      altImages.style.display = ''
    }

    if (altList) {
      const imageLis = Array.from(altList.querySelectorAll<HTMLLIElement>('li.imageThumbnail'))
        .slice()
        .sort((a, b) => (itemNoFromElement(a) ?? 0) - (itemNoFromElement(b) ?? 0))

      for (const li of imageLis) {
        const existingImg = li.querySelector<HTMLImageElement>('img')
        const img = existingImg ? existingImg : doc.createElement('img')
        img.src = ARGUS_GALLERY_PLACEHOLDER_THUMB
        img.setAttribute('data-old-hires', ARGUS_GALLERY_PLACEHOLDER_MAIN)
        sizeGalleryThumbImage(img)
        if (!li.contains(img)) li.append(img)
        li.style.display = ''
      }

      const first = imageLis.length > 0 ? imageLis[0] : null
      setAltImagesSelection(altList, first)
    }

    storedDoc.__argusMainMediaIndex = 0
    setDesktopMediaMainViewIndex(doc, 0)
    return
  }

  const sorted = rev.images.slice().sort((a, b) => a.position - b.position)
  const main = sorted[0]
  const thumbs = sorted

  if (landing) {
    landing.style.visibility = ''
  }
  if (altImages) {
    altImages.style.display = ''
  }

  if (landing && main) {
    const src = resolveImageSrc(main.src)
    landing.src = src
    const hiRes = main.hiRes ? resolveImageSrc(main.hiRes) : src
    landing.setAttribute('data-old-hires', hiRes)
  }

  if (!altList) return

  const imageLis = Array.from(altList.querySelectorAll<HTMLLIElement>('li.imageThumbnail'))
    .slice()
    .sort((a, b) => (itemNoFromElement(a) ?? 0) - (itemNoFromElement(b) ?? 0))

  for (let i = 0; i < imageLis.length; i++) {
    const li = imageLis[i]
    const item = i < thumbs.length ? thumbs[i] : null
    const existingImg = li.querySelector<HTMLImageElement>('img')
    const img = existingImg ? existingImg : doc.createElement('img')

    if (!item) {
      img.src = ARGUS_GALLERY_PLACEHOLDER_THUMB
      img.setAttribute('data-old-hires', ARGUS_GALLERY_PLACEHOLDER_MAIN)
      sizeGalleryThumbImage(img)
      if (!li.contains(img)) li.append(img)
      li.style.display = ''
      continue
    }

    img.src = resolveImageSrc(item.src)
    const hiRes = item.hiRes ? resolveImageSrc(item.hiRes) : img.src
    img.setAttribute('data-old-hires', hiRes)
    sizeGalleryThumbImage(img)
    if (!li.contains(img)) li.append(img)
    li.style.display = ''
  }

  const desiredIndex = storedDoc.__argusMainMediaIndex
  const desiredLi = typeof desiredIndex === 'number'
    ? Array.from(altList.querySelectorAll<HTMLElement>('li')).find((li) => itemNoFromElement(li) === desiredIndex) ?? null
    : null
  const firstVisible = altList.querySelector<HTMLElement>('li:not([style*="display: none"])')
  setAltImagesSelection(altList, desiredLi ? desiredLi : firstVisible)

  setDesktopMediaMainViewIndex(doc, typeof desiredIndex === 'number' ? desiredIndex : 0)
}

function ensureGalleryThumbnailSwap(
  doc: Document,
  callbacksRef: RefObject<{ galleryUpload: () => void }>,
) {
  const altList = doc.querySelector<HTMLElement>('#altImages ul')
  if (!altList) return

  if (altList.dataset.argusGallerySwapBound === 'true') return
  altList.dataset.argusGallerySwapBound = 'true'

  altList.addEventListener('click', (e) => {
    const target = e.target
    if (!(target instanceof doc.defaultView!.Element)) return
    const li = target.closest('li')
    if (!li) return

    const storedDoc = doc as ArgusReplicaDocument

    if (li.classList.contains('videoThumbnail')) {
      const videoIndex = itemNoFromElement(li)
      if (typeof videoIndex !== 'number') return

      e.preventDefault()
      e.stopImmediatePropagation()
      e.stopPropagation()

      storedDoc.__argusMainMediaIndex = videoIndex
      setDesktopMediaMainViewIndex(doc, videoIndex)
      setAltImagesSelection(altList, li)
      return
    }

    const img = li.querySelector<HTMLImageElement>('img')
    if (!img) return

    const landing = doc.getElementById('landingImage') as HTMLImageElement | null
    if (!landing) return

    const src = img.getAttribute('data-old-hires') ?? img.getAttribute('src')
    if (!src) return

    e.preventDefault()
    e.stopImmediatePropagation()
    e.stopPropagation()

    if (src === ARGUS_GALLERY_PLACEHOLDER_MAIN) {
      callbacksRef.current.galleryUpload()
      return
    }

    storedDoc.__argusMainMediaIndex = 0
    setDesktopMediaMainViewIndex(doc, 0)

    landing.style.visibility = ''
    landing.src = src
    landing.setAttribute('data-old-hires', src)

    setAltImagesSelection(altList, li)
  }, true)
}

function applyVariationSelection(doc: Document, asin: string | null) {
  if (!asin) return
  const swatches = Array.from(doc.querySelectorAll<HTMLElement>('#twister_feature_div li[data-asin]'))
  if (swatches.length === 0) return

  for (const swatch of swatches) {
    const button = swatch.querySelector<HTMLElement>('.a-button.a-button-toggle')
    if (button) button.classList.remove('a-button-selected')
    const input = swatch.querySelector<HTMLInputElement>('input[role="radio"]')
    if (input) input.setAttribute('aria-checked', 'false')
  }

  const selected = swatches.find((swatch) => swatch.getAttribute('data-asin') === asin) ?? null
  if (!selected) return

  const selectedButton = selected.querySelector<HTMLElement>('.a-button.a-button-toggle')
  if (selectedButton) selectedButton.classList.add('a-button-selected')
  const selectedInput = selected.querySelector<HTMLInputElement>('input[role="radio"]')
  if (selectedInput) selectedInput.setAttribute('aria-checked', 'true')
}

function applyVideo(doc: Document, rev: VideoRevision | null) {
  const container = doc.getElementById('main-video-container') as HTMLElement | null
    ?? doc.getElementById('ive-hero-video-player') as HTMLElement | null
  if (!container) return

  const storedDoc = doc as ArgusReplicaDocument
  if (storedDoc.__argusVideoBaseline === undefined) {
    storedDoc.__argusVideoBaseline = container.innerHTML
  }

  if (!rev) {
    const baseline = storedDoc.__argusVideoBaseline
    if (baseline !== undefined) {
      const applied = container.querySelector('video.argus-video')
      const appliedMarker = container.dataset.argusVideoApplied
      if (applied || appliedMarker !== undefined) {
        container.innerHTML = baseline
        delete container.dataset.argusVideoApplied
      }
    }
    return
  }

  const existing = container.querySelector<HTMLVideoElement>('video.argus-video')
  const video = existing ? existing : doc.createElement('video')

  if (!existing) {
    container.replaceChildren()
    video.className = 'argus-video'
    video.controls = true
    video.style.width = '100%'
    video.style.maxWidth = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'contain'
    video.setAttribute('playsinline', 'true')
    container.append(video)
  }

  container.dataset.argusVideoApplied = rev.id

  const src = resolveImageSrc(rev.src)
  if (video.src !== src) {
    video.src = src
    video.load()
  }

  if (rev.posterSrc) {
    video.poster = resolveImageSrc(rev.posterSrc)
  }
}

function applyEbc(doc: Document, rev: EbcRevision | null) {
  const brandContainer = doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
  const descriptionContainer = doc.querySelector<HTMLElement>('#aplus_feature_div')

  if (!rev || rev.sections.length === 0) {
    if (brandContainer) {
      brandContainer.style.display = ''
      const modules = Array.from(brandContainer.querySelectorAll<HTMLElement>('.aplus-module'))
      for (const mod of modules) setEbcModulePlaceholder(mod, 'Upload A+ module')
      delete brandContainer.dataset.argusEbcApplied
    }
    if (descriptionContainer) {
      descriptionContainer.style.display = ''
      const modules = Array.from(descriptionContainer.querySelectorAll<HTMLElement>('.aplus-module'))
      for (const mod of modules) setEbcModulePlaceholder(mod, 'Upload A+ module')
      delete descriptionContainer.dataset.argusEbcApplied
    }
    return
  }

  const brandSection = rev.sections.find((section) => section.sectionType === 'BRAND_STORY') ?? null
  const descriptionSection = rev.sections.find((section) => section.sectionType !== 'BRAND_STORY') ?? null

  if (brandContainer) {
    if (!brandSection) {
      brandContainer.style.display = ''
      const modules = Array.from(brandContainer.querySelectorAll<HTMLElement>('.aplus-module'))
      for (const mod of modules) setEbcModulePlaceholder(mod, 'Upload A+ module')
      delete brandContainer.dataset.argusEbcApplied
    } else {
      brandContainer.style.display = ''
      applyEbcSection(brandContainer, brandSection)
      brandContainer.dataset.argusEbcApplied = rev.id
    }
  }

  if (descriptionContainer) {
    if (!descriptionSection) {
      descriptionContainer.style.display = ''
      const modules = Array.from(descriptionContainer.querySelectorAll<HTMLElement>('.aplus-module'))
      for (const mod of modules) setEbcModulePlaceholder(mod, 'Upload A+ module')
      delete descriptionContainer.dataset.argusEbcApplied
    } else {
      descriptionContainer.style.display = ''
      applyEbcSection(descriptionContainer, descriptionSection)
      descriptionContainer.dataset.argusEbcApplied = rev.id
    }
  }
}

function setEbcModulePlaceholder(target: HTMLElement, label: string | null) {
  if (label === null) {
    target.classList.remove('argus-ebc-placeholder')
    target.removeAttribute('data-argus-ebc-placeholder')
    return
  }

  target.classList.add('argus-ebc-placeholder')
  target.setAttribute('data-argus-ebc-placeholder', label)
}

function applyEbcSection(container: HTMLElement, section: EbcSection) {
  const modules = Array.from(container.querySelectorAll<HTMLElement>('.aplus-module'))

  for (let mi = 0; mi < modules.length; mi++) {
    const target = modules[mi]
    if (!target) continue
    target.style.display = ''

    const srcMod = section.modules[mi]
    if (!srcMod) {
      setEbcModulePlaceholder(target, 'Upload A+ module')
      continue
    }

    const hasContent = Boolean(
      (srcMod.headline && srcMod.headline.trim().length > 0) ||
      (srcMod.bodyText && srcMod.bodyText.trim().length > 0) ||
      srcMod.images.length > 0,
    )
    setEbcModulePlaceholder(target, hasContent ? null : 'Upload A+ module')

    const headings = Array.from(target.querySelectorAll('h3, h4, .aplus-module-heading'))
    if (headings.length > 0) {
      headings[0].textContent = srcMod.headline ? srcMod.headline : ''
    }

    const paragraphs = Array.from(target.querySelectorAll('p'))
    if (paragraphs.length > 0) {
      if (srcMod.bodyText) {
        const lines = srcMod.bodyText.split('\n').filter(Boolean)
        for (let i = 0; i < lines.length; i++) {
          const p = paragraphs[i] ? paragraphs[i] : paragraphs[0].cloneNode(true) as HTMLParagraphElement
          p.textContent = lines[i]
          if (!paragraphs[i]) {
            paragraphs[0].parentElement?.append(p)
            paragraphs.push(p)
          }
        }
        for (let i = lines.length; i < paragraphs.length; i++) {
          paragraphs[i].textContent = ''
        }
      } else {
        for (const p of paragraphs) {
          p.textContent = ''
        }
      }
    }

    const images = Array.from(target.querySelectorAll('img'))
    for (let ii = 0; ii < images.length; ii++) {
      const img = images[ii]
      if (!img) continue

      const srcImg = srcMod.images[ii]
      if (!srcImg) {
        img.src = ARGUS_EBC_PLACEHOLDER_IMAGE
        img.alt = 'Upload image'
        continue
      }

      img.src = resolveImageSrc(srcImg.src)
      if (srcImg.alt) img.alt = srcImg.alt
    }
  }
}
