'use client'

import { useRef, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatAmazonPdpReplicaContractError,
  getReplicaSlotElement,
  sanitizeAmazonPdpReplicaDocument,
  validateAmazonPdpReplicaContract,
  type AmazonPdpReplicaContractError,
} from './amazon-pdp-replica'
import { ListingDetailDialogs, ListingDetailHeader } from './listing-detail-dialogs'
import {
  CLOUDFLARE_MAX_UPLOAD_BYTES,
  SNAPSHOT_ZIP_MAX_UPLOAD_BYTES,
  basePath,
  formatBytes,
  formatUsdFromCents,
  getUploadSizeError,
  isInitialIframeDocument,
  parseUsdToCents,
  type ArgusReplicaDocument,
  type BulletsRevision,
  type BulletsDraft,
  type EbcModuleDraft,
  type EbcModuleEditorTarget,
  type EbcRevision,
  type EbcSection,
  type GalleryRevision,
  type ListingDetailCallbacks,
  type ListingDetailProps,
  type ListingPriceState,
  type VideoRevision,
  looksLikeAsin,
  resolveImageSrc,
} from './listing-detail-shared'
import {
  composeEbcRevision,
  downloadEbcZip,
  downloadGalleryRevisionZip,
  ebcModulePointerKey,
  getEbcModuleHistory,
  updateEbcModuleControls,
} from './listing-detail-versioning'
import { useListingDetailData } from './use-listing-detail-data'

export function ListingDetail({
  listingId,
  listing: listingProp,
}: ListingDetailProps) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)
  const iframeDocRef = useRef<Document | null>(null)
  const [iframeEpoch, setIframeEpoch] = useState(0)
  const [replicaContractError, setReplicaContractError] = useState<AmazonPdpReplicaContractError | null>(null)
  const {
    listing,
    activePointers,
    price,
    titleRevisions,
    titleIndex,
    setTitleIndex,
    bulletsRevisions,
    bulletsIndex,
    setBulletsIndex,
    galleryRevisions,
    galleryIndex,
    setGalleryIndex,
    videoRevisions,
    videoIndex,
    setVideoIndex,
    ebcRevisions,
    ebcIndex,
    setEbcIndex,
    ebcModulePointers,
    setEbcModulePointers,
    refreshListingData,
  } = useListingDetailData({ listingId, listing: listingProp })

  const [titleEditorOpen, setTitleEditorOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [bulletsEditorOpen, setBulletsEditorOpen] = useState(false)
  const [bulletsDraft, setBulletsDraft] = useState<BulletsDraft>({
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
  const [ebcModuleEditorTarget, setEbcModuleEditorTarget] = useState<EbcModuleEditorTarget | null>(null)
  const [ebcModuleDraft, setEbcModuleDraft] = useState<EbcModuleDraft>({ headline: '', bodyText: '' })
  const [ebcModuleFiles, setEbcModuleFiles] = useState<File[]>([])

  const [snapshotIngestOpen, setSnapshotIngestOpen] = useState(false)
  const [snapshotIngestFile, setSnapshotIngestFile] = useState<File | null>(null)
  const [snapshotIngestBusy, setSnapshotIngestBusy] = useState(false)
  const [snapshotIngestError, setSnapshotIngestError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const callbacksRef = useRef<ListingDetailCallbacks>({
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
    const doc = iframeDocRef.current
    if (!doc) return

    const storedDoc = doc as ArgusReplicaDocument
    storedDoc.__argusMainMediaIndex = 0
  }, [listingId])

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
      const versionNumber = selected.seq
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
        refreshListingData()
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
      const versionNumber = selected.seq
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
        refreshListingData()
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
        refreshListingData()
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
      const versionNumber = selected.seq
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
        refreshListingData()
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
      const versionNumber = selected.seq
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
        refreshListingData()
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
      const history = getEbcModuleHistory(ebcRevisions, sectionType, modulePosition)
      if (history.length === 0) return

      const currentRevisionId = getEffectiveEbcRevisionIdForModule(sectionType, modulePosition)
      const effectiveId = currentRevisionId ? currentRevisionId : history[0].revisionId
      const liveRevisionId = activePointers?.activeEbcId
      if (liveRevisionId && effectiveId === liveRevisionId) return

      const index = history.findIndex((item) => item.revisionId === effectiveId)
      const safeIndex = index >= 0 ? index : 0
      const versionNumber = history.length - safeIndex

      const nextHistoryIndex = safeIndex < history.length - 1 ? safeIndex + 1 : safeIndex - 1
      const nextRevisionId = nextHistoryIndex >= 0 ? history[nextHistoryIndex]?.revisionId ?? null : null
      if (!nextRevisionId) return

      if (!window.confirm(`Delete Module v${versionNumber}?`)) return

      const key = ebcModulePointerKey(sectionType, modulePosition)
      setEbcModulePointers((current) => {
        const next = { ...current }
        if (liveRevisionId && nextRevisionId === liveRevisionId) {
          if (key in next) delete next[key]
          return next
        }
        next[key] = nextRevisionId
        return next
      })
      void persistEbcModulePointer(sectionType, modulePosition, nextRevisionId)

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/ebc`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: effectiveId }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }
        refreshListingData()
      })()
    }

    callbacksRef.current.variationSelect = (asin: string) => {
      const normalized = String(asin).trim()
      if (normalized.length === 0) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asin: normalized,
          }),
        })
        if (!res.ok) {
          window.alert(await res.text())
          return
        }

        router.push(`/listings/${normalized}`)
      })()
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
    refreshListingData,
    setBulletsIndex,
    setEbcIndex,
    setEbcModulePointers,
    setGalleryIndex,
    setTitleIndex,
    setVideoIndex,
    videoRevisions,
    ebcRevisions,
  ])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      if (isInitialIframeDocument(iframe, doc)) return
      if (iframeDocRef.current === doc) return
      iframeDocRef.current = doc
      setIframeEpoch((current) => current + 1)

      sanitizeAmazonPdpReplicaDocument(doc)

      const height = doc.documentElement.scrollHeight
      if (height > 0) {
        setIframeHeight(height)
      }

      doc.body.classList.remove('a-meter-animate')

      if (doc.documentElement.dataset.argusLinksBound !== 'true') {
        doc.documentElement.dataset.argusLinksBound = 'true'
        doc.addEventListener(
          'click',
          (e) => {
            const target = e.target
            if (!(target instanceof doc.defaultView!.Element)) return
            const link = target.closest('a')
            if (!link) return
            e.preventDefault()
            e.stopImmediatePropagation()
            e.stopPropagation()
          },
          true,
        )
      }

      const contract = validateAmazonPdpReplicaContract(doc)
      if (!contract.ok) {
        setReplicaContractError(contract)
        console.error('Replica contract mismatch:', formatAmazonPdpReplicaContractError(contract))
        return
      }

      setReplicaContractError(null)

      injectArgusVersionControls(doc, callbacksRef)
    }

    iframe.addEventListener('load', handleLoad)
    const doc = iframe.contentDocument
    if (doc?.readyState === 'complete' && !isInitialIframeDocument(iframe, doc)) {
      handleLoad()
    }
    return () => iframe.removeEventListener('load', handleLoad)
  }, [listing])

  useEffect(() => {
    const doc = iframeDocRef.current
    if (!doc) return
    if (replicaContractError) return

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

    const titleVersionNumber = selectedTitleRev ? selectedTitleRev.seq : undefined
    const bulletsVersionNumber = selectedBullets ? selectedBullets.seq : undefined
    const galleryVersionNumber = selectedGallery ? selectedGallery.seq : undefined
    const videoVersionNumber = selectedVideo ? selectedVideo.seq : undefined
    const ebcVersionNumber = selectedEbc ? selectedEbc.seq : undefined

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
    replicaContractError,
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
      const versionNumber = selected.seq
      void downloadGalleryRevisionZip(selected, versionNumber).catch((err) => console.error(err))
    }

    callbacksRef.current.ebcDownload = () => {
      const composed = composeEbcRevision(ebcRevisions, ebcModulePointers, activePointers?.activeEbcId ?? null)
      if (!composed) return
      void downloadEbcZip('ebc_current.zip', 'ebc_current', composed).catch((err) => console.error(err))
    }
  }, [galleryRevisions, galleryIndex, ebcRevisions, ebcIndex, ebcModulePointers, activePointers])

  async function handleSnapshotIngestSubmit() {
    if (!listing || !snapshotIngestFile) return

    if (snapshotIngestFile.size > SNAPSHOT_ZIP_MAX_UPLOAD_BYTES) {
      setSnapshotIngestError(
        `“${snapshotIngestFile.name}” is ${formatBytes(snapshotIngestFile.size)}. Max zip size is ${formatBytes(SNAPSHOT_ZIP_MAX_UPLOAD_BYTES)}.`,
      )
      return
    }

    setSnapshotIngestBusy(true)
    setSnapshotIngestError(null)

    try {
      const formData = new FormData()
      formData.append('snapshot', snapshotIngestFile)

      const response = await fetch(`${basePath}/api/listings/${listing.id}/ingest`, {
        method: 'POST',
        body: formData,
      })

      const text = await response.text()
      if (!response.ok) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown }
          if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
            setSnapshotIngestError(parsed.error)
            return
          }
        } catch {
          // keep raw text when JSON parsing fails
        }

        setSnapshotIngestError(text.trim().length > 0 ? text : 'Snapshot ingest failed.')
        return
      }

      try {
        const parsed = JSON.parse(text) as { changes?: unknown }
        if (Array.isArray(parsed.changes) && parsed.changes.length > 0) {
          window.alert(`Ingested snapshot:\n${parsed.changes.join('\n')}`)
        } else {
          window.alert('Ingested snapshot (no content changes detected).')
        }
      } catch {
        window.alert('Ingested snapshot.')
      }

      setSnapshotIngestOpen(false)
      setSnapshotIngestFile(null)
      refreshListingData()
    } finally {
      setSnapshotIngestBusy(false)
    }
  }

  async function handleTitleSubmit() {
    if (!listing) return

    const response = await fetch(`${basePath}/api/listings/${listing.id}/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleDraft }),
    })
    if (!response.ok) {
      window.alert(await response.text())
      return
    }

    setTitleEditorOpen(false)
    refreshListingData()
  }

  async function handleBulletsSubmit() {
    if (!listing) return

    const response = await fetch(`${basePath}/api/listings/${listing.id}/bullets`, {
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
    if (!response.ok) {
      window.alert(await response.text())
      return
    }

    setBulletsEditorOpen(false)
    refreshListingData()
  }

  async function handlePriceSubmit() {
    if (!listing) return

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

    const response = await fetch(`${basePath}/api/listings/${listing.id}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceCents: nextPriceCents,
        pricePerUnitCents: nextPerUnitCents,
        pricePerUnitUnit: nextPerUnitCents !== null ? nextPerUnitUnit : null,
      }),
    })
    if (!response.ok) {
      window.alert(await response.text())
      return
    }

    setPriceEditorOpen(false)
    refreshListingData()
  }

  async function handleGallerySubmit() {
    if (!listing) return

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

    const response = await fetch(`${basePath}/api/listings/${listing.id}/gallery`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      if (response.status === 413) {
        window.alert('Upload too large. Max upload size is 100MB per request.')
        return
      }
      window.alert(await response.text())
      return
    }

    setGalleryUploaderOpen(false)
    refreshListingData()
  }

  async function handleVideoSubmit() {
    if (!listing || !videoFile) return

    const selectedFiles = videoPosterFile ? [videoFile, videoPosterFile] : [videoFile]
    const sizeError = getUploadSizeError(selectedFiles, CLOUDFLARE_MAX_UPLOAD_BYTES)
    if (sizeError) {
      window.alert(sizeError)
      return
    }

    const form = new FormData()
    form.append('file', videoFile)
    if (videoPosterFile) form.append('poster', videoPosterFile)

    const response = await fetch(`${basePath}/api/listings/${listing.id}/video`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      if (response.status === 413) {
        window.alert('Upload too large. Max upload size is 100MB per request.')
        return
      }
      window.alert(await response.text())
      return
    }

    setVideoUploaderOpen(false)
    refreshListingData()
  }

  async function handleEbcModuleSubmit() {
    if (!listing || !ebcModuleEditorTarget) return

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

    const response = await fetch(`${basePath}/api/listings/${listing.id}/ebc/module`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      if (response.status === 413) {
        window.alert('Upload too large. Max upload size is 100MB per request.')
        return
      }
      window.alert(await response.text())
      return
    }

    setEbcModuleEditorOpen(false)
    refreshListingData()
  }

  async function handleResetSubmit() {
    if (!listing) return

    setResetBusy(true)
    setResetError(null)

    try {
      const response = await fetch(`${basePath}/api/listings/${listing.id}/reset`, {
        method: 'POST',
      })
      const text = await response.text()
      if (!response.ok) {
        setResetError(text.trim().length > 0 ? text : 'Reset failed.')
        return
      }

      setResetDialogOpen(false)
      setSnapshotIngestOpen(false)
      setSnapshotIngestFile(null)
      setSnapshotIngestError(null)
      setTitleEditorOpen(false)
      setBulletsEditorOpen(false)
      setPriceEditorOpen(false)
      setGalleryUploaderOpen(false)
      setVideoUploaderOpen(false)
      setEbcModuleEditorOpen(false)
      refreshListingData()
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {replicaContractError && (
        <div className="px-4 py-2 text-sm border-b border-red-200 bg-red-50 text-red-800">
          Replica template mismatch: {formatAmazonPdpReplicaContractError(replicaContractError)}
        </div>
      )}
      <ListingDetailHeader
        listing={listing}
        onOpenSnapshotIngest={() => {
          setSnapshotIngestError(null)
          setSnapshotIngestFile(null)
          setSnapshotIngestOpen(true)
        }}
        onOpenReset={() => {
          setResetError(null)
          setResetDialogOpen(true)
        }}
      />
      <iframe
        ref={iframeRef}
        src={`${basePath}/api/fixture/replica.html`}
        style={{ height: iframeHeight, width: '100%', display: 'block', border: 0 }}
        title={listing ? listing.label : listingId}
        sandbox="allow-same-origin allow-scripts"
      />
      <ListingDetailDialogs
        listing={listing}
        snapshotIngestOpen={snapshotIngestOpen}
        snapshotIngestBusy={snapshotIngestBusy}
        snapshotIngestError={snapshotIngestError}
        snapshotIngestFile={snapshotIngestFile}
        onSnapshotIngestClose={() => setSnapshotIngestOpen(false)}
        onSnapshotIngestFileChange={(file) => {
          setSnapshotIngestError(null)
          setSnapshotIngestFile(file)
        }}
        onSnapshotIngestSubmit={handleSnapshotIngestSubmit}
        titleEditorOpen={titleEditorOpen}
        titleDraft={titleDraft}
        onTitleEditorClose={() => setTitleEditorOpen(false)}
        onTitleDraftChange={setTitleDraft}
        onTitleSubmit={handleTitleSubmit}
        bulletsEditorOpen={bulletsEditorOpen}
        bulletsDraft={bulletsDraft}
        onBulletsEditorClose={() => setBulletsEditorOpen(false)}
        onBulletsDraftChange={(key, value) => {
          setBulletsDraft((current) => ({ ...current, [key]: value }))
        }}
        onBulletsSubmit={handleBulletsSubmit}
        priceEditorOpen={priceEditorOpen}
        priceDraft={priceDraft}
        onPriceEditorClose={() => setPriceEditorOpen(false)}
        onPriceDraftChange={(key, value) => {
          setPriceDraft((current) => ({ ...current, [key]: value }))
        }}
        onPriceSubmit={handlePriceSubmit}
        galleryUploaderOpen={galleryUploaderOpen}
        galleryFiles={galleryFiles}
        onGalleryUploaderClose={() => setGalleryUploaderOpen(false)}
        onGalleryFilesChange={setGalleryFiles}
        onGallerySubmit={handleGallerySubmit}
        videoUploaderOpen={videoUploaderOpen}
        videoFile={videoFile}
        videoPosterFile={videoPosterFile}
        onVideoUploaderClose={() => setVideoUploaderOpen(false)}
        onVideoFileChange={setVideoFile}
        onVideoPosterFileChange={setVideoPosterFile}
        onVideoSubmit={handleVideoSubmit}
        ebcModuleEditorOpen={ebcModuleEditorOpen}
        ebcModuleEditorTarget={ebcModuleEditorTarget}
        ebcModuleDraft={ebcModuleDraft}
        ebcModuleFiles={ebcModuleFiles}
        onEbcModuleEditorClose={() => setEbcModuleEditorOpen(false)}
        onEbcModuleDraftChange={(key, value) => {
          setEbcModuleDraft((current) => ({ ...current, [key]: value }))
        }}
        onEbcModuleFilesChange={setEbcModuleFiles}
        onEbcModuleSubmit={handleEbcModuleSubmit}
        resetDialogOpen={resetDialogOpen}
        resetBusy={resetBusy}
        resetError={resetError}
        onResetDialogClose={() => setResetDialogOpen(false)}
        onResetSubmit={handleResetSubmit}
      />
    </div>
  )
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
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(180, 180, 180, 0.9);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        font-size: 12px;
        color: #555;
      }
      .argus-vc-btn {
        all: unset;
        padding: 0 7px;
        height: 22px;
        border-radius: 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background: #f0f0f0;
        border: 1px solid #cfcfcf;
        color: #555;
        font-size: 11px;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0.01em;
        user-select: none;
        white-space: nowrap;
      }
      .argus-vc-btn:hover { background: #e6e6e6; }
      .argus-vc-btn.argus-vc-live {
        background: #eff6ff;
        border-color: rgba(59, 130, 246, 0.45);
        color: rgb(37, 99, 235);
      }
      .argus-vc-btn.argus-vc-live:hover { background: #dbeafe; }
      .argus-vc-btn.argus-vc-danger {
        background: #fff1f1;
        border-color: rgba(220, 38, 38, 0.35);
        color: rgb(185, 28, 28);
      }
      .argus-vc-btn.argus-vc-danger:hover { background: #ffe5e5; }
      .argus-vc-btn[disabled] { opacity: 0.4; cursor: default; }
      .argus-vc-label { user-select: none; white-space: nowrap; }
      .argus-vc-sep {
        width: 1px;
        height: 14px;
        background: rgba(180, 180, 180, 0.7);
        flex-shrink: 0;
      }
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

  const imageBlock = getReplicaSlotElement<HTMLElement>(doc, 'gallery-root')
  if (imageBlock) {
    ensureTrackControls(doc, imageBlock, 'gallery', 'Images', callbacksRef)
    ensureGalleryThumbnailSwap(doc, callbacksRef)
  }

  const titleSection = getReplicaSlotElement<HTMLElement>(doc, 'title')
  if (titleSection) {
    ensureTrackControls(doc, titleSection, 'title', 'Title', callbacksRef)
  }

  const bullets = getReplicaSlotElement<HTMLElement>(doc, 'bullets-root')
  if (bullets) {
    ensureTrackControls(doc, bullets, 'bullets', 'Bullets', callbacksRef)
  }

  const price = getReplicaSlotElement<HTMLElement>(doc, 'price-root')
  if (price) {
    ensurePriceControls(doc, price, callbacksRef)
  }

  let ebc: HTMLElement | null = null
  const descriptionContainer = getReplicaSlotElement<HTMLElement>(doc, 'ebc-description-root')
  const brandContainer = getReplicaSlotElement<HTMLElement>(doc, 'ebc-brand-root')
  if (descriptionContainer) {
    ebc = descriptionContainer
  } else if (brandContainer) {
    ebc = brandContainer
  }

  if (ebc) {
    ensureTrackControls(doc, ebc, 'ebc', 'A+ Content', callbacksRef)
  }

  if (brandContainer) {
    const modules = Array.from(brandContainer.querySelectorAll<HTMLElement>('.aplus-module'))
    for (let i = 0; i < modules.length; i++) {
      ensureEbcModuleControls(doc, modules[i], 'BRAND_STORY', i, callbacksRef)
    }
  }

  if (descriptionContainer) {
    const modules = Array.from(descriptionContainer.querySelectorAll<HTMLElement>('.aplus-module'))
    for (let i = 0; i < modules.length; i++) {
      ensureEbcModuleControls(doc, modules[i], 'PRODUCT_DESCRIPTION', i, callbacksRef)
    }
  }

  const swatches = getVariationSwatches(doc)
  for (const swatch of swatches) {
    const asin = getVariationAsin(swatch)
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

  const sep = doc.createElement('span')
  sep.className = 'argus-vc-sep'

  const edit = doc.createElement('button')
  edit.className = 'argus-vc-btn'
  edit.type = 'button'
  edit.textContent = 'Edit'
  edit.title = 'Create new price override'
  edit.addEventListener('click', () => callbacksRef.current?.priceEdit())

  const del = doc.createElement('button')
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = 'Clear price override'
  del.addEventListener('click', () => callbacksRef.current?.priceDelete())

  controls.append(label, sep, edit, del)
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
  function stopClick(e: MouseEvent) {
    e.preventDefault()
    e.stopImmediatePropagation()
    e.stopPropagation()
  }

  target.classList.add('argus-vc-highlight')
  if (!target.style.position) {
    target.style.position = 'relative'
  }

  const controlsId = `argus-vc-controls-${track}`
  if (doc.getElementById(controlsId)) return

  const controls = doc.createElement('div')
  controls.id = controlsId
  controls.className = `argus-vc-controls argus-vc-controls-${track}`

  const prev = doc.createElement('button')
  prev.id = `argus-vc-prev-${track}`
  prev.className = 'argus-vc-btn'
  prev.type = 'button'
  prev.textContent = '‹'
  prev.addEventListener('click', (e) => {
    stopClick(e)
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
  next.addEventListener('click', (e) => {
    stopClick(e)
    if (track === 'title') callbacksRef.current?.titleNext()
    if (track === 'bullets') callbacksRef.current?.bulletsNext()
    if (track === 'gallery') callbacksRef.current?.galleryNext()
    if (track === 'video') callbacksRef.current?.videoNext()
    if (track === 'ebc') callbacksRef.current?.ebcNext()
  })

  controls.append(prev, span, next)

  const sep = doc.createElement('span')
  sep.className = 'argus-vc-sep'
  controls.append(sep)

  const live = doc.createElement('button')
  live.id = `argus-vc-live-${track}`
  live.className = 'argus-vc-btn argus-vc-live'
  live.type = 'button'
  live.textContent = 'Live'
  live.title = 'Jump to live version on Amazon'
  live.addEventListener('click', (e) => {
    stopClick(e)
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
    edit.textContent = 'Edit'
    edit.title = 'Create new version'
    edit.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.titleEdit()
    })
    controls.append(edit)
  }

  if (track === 'bullets') {
    const edit = doc.createElement('button')
    edit.id = `argus-vc-edit-${track}`
    edit.className = 'argus-vc-btn'
    edit.type = 'button'
    edit.textContent = 'Edit'
    edit.title = 'Create new version'
    edit.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.bulletsEdit()
    })
    controls.append(edit)
  }

  if (track === 'gallery') {
    const upload = doc.createElement('button')
    upload.id = `argus-vc-upload-${track}`
    upload.className = 'argus-vc-btn'
    upload.type = 'button'
    upload.textContent = 'Upload'
    upload.title = 'Upload new version'
    upload.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.galleryUpload()
    })
    controls.append(upload)

    const download = doc.createElement('button')
    download.id = `argus-vc-download-${track}`
    download.className = 'argus-vc-btn'
    download.type = 'button'
    download.textContent = '⬇'
    download.title = 'Download images'
    download.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.galleryDownload()
    })
    controls.append(download)
  }

  if (track === 'video') {
    const upload = doc.createElement('button')
    upload.id = `argus-vc-upload-${track}`
    upload.className = 'argus-vc-btn'
    upload.type = 'button'
    upload.textContent = 'Upload'
    upload.title = 'Upload new version'
    upload.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.videoUpload()
    })
    controls.append(upload)
  }

  if (track === 'ebc') {
    const download = doc.createElement('button')
    download.id = `argus-vc-download-${track}`
    download.className = 'argus-vc-btn'
    download.type = 'button'
    download.textContent = '⬇'
    download.title = 'Download images'
    download.addEventListener('click', (e) => {
      stopClick(e)
      callbacksRef.current?.ebcDownload()
    })
    controls.append(download)
  }

  const del = doc.createElement('button')
  del.id = `argus-vc-delete-${track}`
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = track === 'ebc' ? 'Clear overrides' : 'Delete version'
  del.addEventListener('click', (e) => {
    stopClick(e)
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
  function stopClick(e: MouseEvent) {
    e.preventDefault()
    e.stopImmediatePropagation()
    e.stopPropagation()
  }

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
  prev.addEventListener('click', (e) => {
    stopClick(e)
    callbacksRef.current?.ebcModulePrev(sectionType, modulePosition)
  })

  const label = doc.createElement('span')
  label.className = 'argus-vc-label'
  label.textContent = 'Module —'

  const next = doc.createElement('button')
  next.className = 'argus-vc-btn'
  next.type = 'button'
  next.textContent = '›'
  next.title = 'Next version'
  next.dataset.dir = 'next'
  next.addEventListener('click', (e) => {
    stopClick(e)
    callbacksRef.current?.ebcModuleNext(sectionType, modulePosition)
  })

  const sep = doc.createElement('span')
  sep.className = 'argus-vc-sep'

  const live = doc.createElement('button')
  live.className = 'argus-vc-btn argus-vc-live'
  live.type = 'button'
  live.textContent = 'Live'
  live.title = 'Jump to live version on Amazon'
  live.addEventListener('click', (e) => {
    stopClick(e)
    callbacksRef.current?.ebcModuleLive(sectionType, modulePosition)
  })

  const edit = doc.createElement('button')
  edit.className = 'argus-vc-btn'
  edit.type = 'button'
  edit.textContent = 'Edit'
  edit.title = 'Create new version'
  edit.addEventListener('click', (e) => {
    stopClick(e)
    callbacksRef.current?.ebcModuleEdit(sectionType, modulePosition)
  })

  const del = doc.createElement('button')
  del.className = 'argus-vc-btn argus-vc-danger'
  del.type = 'button'
  del.textContent = '🗑'
  del.title = 'Delete version'
  del.dataset.action = 'delete'
  del.addEventListener('click', (e) => {
    stopClick(e)
    callbacksRef.current?.ebcModuleDelete(sectionType, modulePosition)
  })

  controls.append(prev, label, next, sep, live, edit, del)
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
  const titleSection = getReplicaSlotElement<HTMLElement>(doc, 'title')
  if (!titleSection) return
  const productTitle = titleSection.querySelector<HTMLElement>('#productTitle')
  if (!productTitle) return
  productTitle.textContent = title ? title : ''
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
  const list = getReplicaSlotElement<HTMLUListElement>(doc, 'bullets-list')
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

function svgVideoPlaceholderDataUrl(label: string): string {
  const text = escapeSvgText(label)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${text}">
  <rect width="800" height="800" fill="#f3f4f6"/>
  <rect x="44" y="44" width="712" height="712" rx="28" fill="#ffffff" stroke="#d1d5db" stroke-width="4"/>
  <circle cx="400" cy="340" r="130" fill="#eef2f7" stroke="#c7cdd6" stroke-width="4"/>
  <path d="M372 270 L372 410 L494 340 Z" fill="#6b7280"/>
  <text x="400" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#6b7280">${text}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const ARGUS_GALLERY_PLACEHOLDER_MAIN = svgPlaceholderDataUrl('Upload images')
const ARGUS_GALLERY_PLACEHOLDER_THUMB = svgPlaceholderDataUrl('Upload')
const ARGUS_GALLERY_PLACEHOLDER_VIDEO_THUMB = svgVideoPlaceholderDataUrl('VIDEO')
const ARGUS_EBC_PLACEHOLDER_IMAGE = svgPlaceholderDataUrl('Upload image')
const ARGUS_GALLERY_THUMB_SIZE_PX = 48
const ARGUS_GALLERY_STRETCH_RATIO = 1.3

function sizeGalleryThumbImage(img: HTMLImageElement) {
  img.width = ARGUS_GALLERY_THUMB_SIZE_PX
  img.height = ARGUS_GALLERY_THUMB_SIZE_PX
  img.style.width = `${ARGUS_GALLERY_THUMB_SIZE_PX}px`
  img.style.height = `${ARGUS_GALLERY_THUMB_SIZE_PX}px`
  img.style.objectFit = 'contain'
  img.style.display = 'block'
}

function applyGalleryLandingStretchClass(img: HTMLImageElement) {
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  if (naturalWidth <= 0 || naturalHeight <= 0) return

  img.classList.remove('a-stretch-horizontal', 'a-stretch-vertical')
  img.classList.add(naturalWidth / naturalHeight > ARGUS_GALLERY_STRETCH_RATIO ? 'a-stretch-horizontal' : 'a-stretch-vertical')
}

function ensureGalleryLandingSizing(img: HTMLImageElement) {
  if (img.dataset.argusLandingSizingBound !== 'true') {
    img.dataset.argusLandingSizingBound = 'true'
    img.removeAttribute('onload')
    img.addEventListener('load', () => applyGalleryLandingStretchClass(img))
  }

  applyGalleryLandingStretchClass(img)
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

function getVideoMainViewIndex(doc: Document): number | null {
  const videoItem = doc.querySelector<HTMLElement>('ul.desktop-media-mainView li[data-csa-c-media-type="VIDEO"]')
  if (!videoItem) return null
  return itemNoFromElement(videoItem)
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

  const landing = getReplicaSlotElement<HTMLImageElement>(doc, 'gallery-landing-image')
  const altImages = doc.getElementById('altImages') as HTMLElement | null
  const altList = getReplicaSlotElement<HTMLElement>(doc, 'gallery-thumbnails')

  if (landing) {
    ensureGalleryLandingSizing(landing)
  }

  if (storedDoc.__argusMainMediaIndex === undefined) {
    storedDoc.__argusMainMediaIndex = 0
  }

  if (!rev || rev.images.length === 0) {
    const videoIndex = getVideoMainViewIndex(doc)
    const desiredIndex = videoIndex !== null && storedDoc.__argusMainMediaIndex === videoIndex ? videoIndex : 0

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
      const videoThumb = desiredIndex === videoIndex
        ? altList.querySelector<HTMLLIElement>('li.videoThumbnail')
        : null

      setAltImagesSelection(altList, videoThumb ? videoThumb : first)
    }

    storedDoc.__argusMainMediaIndex = desiredIndex
    setDesktopMediaMainViewIndex(doc, desiredIndex)
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
  const altList = getReplicaSlotElement<HTMLElement>(doc, 'gallery-thumbnails')
  if (!altList) return

  if (altList.dataset.argusGallerySwapBound === 'true') return
  altList.dataset.argusGallerySwapBound = 'true'

  const handleThumbnailSwap = (e: Event, allowPlaceholderUpload: boolean) => {
    const target = e.target
    if (!(target instanceof doc.defaultView!.Element)) return
    if (target.closest('.argus-vc-controls')) return
    const li = target.closest('li')
    if (!li) return

    const storedDoc = doc as ArgusReplicaDocument

    if (li.classList.contains('videoThumbnail')) {
      if (!allowPlaceholderUpload) return
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

    const landing = getReplicaSlotElement<HTMLImageElement>(doc, 'gallery-landing-image')
    if (!landing) return

    const src = img.getAttribute('data-old-hires') ?? img.getAttribute('src')
    if (!src) return

    e.preventDefault()
    e.stopImmediatePropagation()
    e.stopPropagation()

    if (src === ARGUS_GALLERY_PLACEHOLDER_MAIN) {
      if (!allowPlaceholderUpload) return
      callbacksRef.current.galleryUpload()
      return
    }

    storedDoc.__argusMainMediaIndex = 0
    setDesktopMediaMainViewIndex(doc, 0)

    landing.style.visibility = ''
    landing.src = src
    landing.setAttribute('data-old-hires', src)
    ensureGalleryLandingSizing(landing)

    setAltImagesSelection(altList, li)
  }

  altList.addEventListener('click', (e) => handleThumbnailSwap(e, true), true)
  altList.addEventListener('mouseover', (e) => handleThumbnailSwap(e, false), true)
}

function getVariationSwatches(doc: Document): HTMLElement[] {
  const root = getReplicaSlotElement<HTMLElement>(doc, 'variations-root')
  if (!root) return []

  return Array.from(root.querySelectorAll<HTMLElement>('li[data-asin], li[data-defaultasin], li[data-csa-c-item-id]'))
}

function getVariationAsin(swatch: HTMLElement): string | null {
  const attributes = ['data-asin', 'data-defaultasin', 'data-csa-c-item-id'] as const
  for (const attribute of attributes) {
    const candidate = swatch.getAttribute(attribute)
    if (!candidate) continue
    if (looksLikeAsin(candidate)) return candidate
  }

  return null
}

function getVariationLabel(swatch: HTMLElement): string | null {
  const textNode = swatch.querySelector<HTMLElement>('.swatch-title-text-display')
    ?? swatch.querySelector<HTMLElement>('.swatch-title-text')
    ?? swatch.querySelector<HTMLElement>('.a-button-text')

  if (!textNode) return null
  const text = textNode.textContent?.trim() ?? ''
  if (text.length === 0) return null
  return text
}

function applyVariationSelection(doc: Document, asin: string | null) {
  if (!asin) return
  const swatches = getVariationSwatches(doc)
  if (swatches.length === 0) return

  for (const swatch of swatches) {
    swatch.classList.remove('swatch-list-item-selected')
    const button = swatch.querySelector<HTMLElement>('.a-button.a-button-toggle')
    if (button) button.classList.remove('a-button-selected')
    const input = swatch.querySelector<HTMLInputElement>('input[role="radio"]')
    if (input) input.setAttribute('aria-checked', 'false')
  }

  const selected = swatches.find((swatch) => getVariationAsin(swatch) === asin) ?? null
  if (!selected) return

  selected.classList.add('swatch-list-item-selected')
  const selectedButton = selected.querySelector<HTMLElement>('.a-button.a-button-toggle')
  if (selectedButton) selectedButton.classList.add('a-button-selected')
  const selectedInput = selected.querySelector<HTMLInputElement>('input[role="radio"]')
  if (selectedInput) selectedInput.setAttribute('aria-checked', 'true')

  const selectedLabel = getVariationLabel(selected)
  if (!selectedLabel) return

  const modelText = doc.getElementById('inline-twister-expanded-dimension-text-model')
  if (modelText) {
    modelText.textContent = selectedLabel
  }

  const modelHeader = doc.getElementById('inline-twister-expander-header-model')
  if (modelHeader) {
    modelHeader.setAttribute('aria-label', `Selected Model is ${selectedLabel}. Tap to collapse.`)
  }
}

function applyVideo(doc: Document, rev: VideoRevision | null) {
  applyVideoThumbnail(doc)

  const container = getReplicaSlotElement<HTMLElement>(doc, 'video-container')
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

function applyVideoThumbnail(doc: Document) {
  const videoThumb = getReplicaSlotElement<HTMLElement>(doc, 'gallery-video-thumb')
  if (!videoThumb) return

  const img = videoThumb.querySelector<HTMLImageElement>('img')
  const thumb = img ? img : doc.createElement('img')
  thumb.src = ARGUS_GALLERY_PLACEHOLDER_VIDEO_THUMB
  thumb.alt = 'VIDEO'
  sizeGalleryThumbImage(thumb)
  if (!img) {
    const button = videoThumb.querySelector<HTMLElement>('button')
    if (button) button.append(thumb)
  }

  const label = videoThumb.querySelector<HTMLElement>('.video-count') ?? videoThumb.querySelector<HTMLElement>('#videoCount')
  if (label) {
    label.textContent = 'VIDEO'
  }
}

function applyEbc(doc: Document, rev: EbcRevision | null) {
  const brandContainer = getReplicaSlotElement<HTMLElement>(doc, 'ebc-brand-root')
  const descriptionContainer = getReplicaSlotElement<HTMLElement>(doc, 'ebc-description-root')

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
