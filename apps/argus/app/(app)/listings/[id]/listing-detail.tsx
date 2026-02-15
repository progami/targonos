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

      const doc = iframeDocRef.current
      const baseline = doc ? (doc as ArgusReplicaDocument).__argusTitleBaseline : undefined
      const nextDraft = baseline !== undefined
        ? baseline
        : (listing ? listing.label : '')
      setTitleDraft(nextDraft)
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
      if (!window.confirm(`Delete Title v${selected.seq}?`)) return

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
      const doc = iframeDocRef.current
      const baseline = doc ? (doc as ArgusReplicaDocument).__argusBulletsBaseline : undefined
      setBulletsDraft({
        bullet1: selected?.bullet1 ?? (baseline?.bullets[0] ?? ''),
        bullet2: selected?.bullet2 ?? (baseline?.bullets[1] ?? ''),
        bullet3: selected?.bullet3 ?? (baseline?.bullets[2] ?? ''),
        bullet4: selected?.bullet4 ?? (baseline?.bullets[3] ?? ''),
        bullet5: selected?.bullet5 ?? (baseline?.bullets[4] ?? ''),
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
      if (!window.confirm(`Delete Bullets v${selected.seq}?`)) return

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
      if (!window.confirm(`Delete Images v${selected.seq}?`)) return

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
      if (!window.confirm(`Delete Video v${selected.seq}?`)) return

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
      if (!selectedRevision) return

      const section = selectedRevision.sections.find((s) => s.sectionType === sectionType) ?? null
      const mod = section ? section.modules[modulePosition] ?? null : null
      if (!mod) return

      setEbcModuleEditorTarget({ sectionType, modulePosition })
      setEbcModuleDraft({
        headline: mod.headline ?? '',
        bodyText: mod.bodyText ?? '',
      })
      setEbcModuleFiles([])
      setEbcModuleEditorOpen(true)
    }

    callbacksRef.current.ebcModuleDelete = (sectionType: string, modulePosition: number) => {
      if (!listing) return
      const key = ebcModulePointerKey(sectionType, modulePosition)
      const revisionId = ebcModulePointers[key]
      if (!revisionId) return

      const seq = ebcRevisions.find((rev) => rev.id === revisionId)?.seq
      if (!window.confirm(`Delete Module v${seq ?? '—'}?`)) return

      void (async () => {
        const res = await fetch(`${basePath}/api/listings/${listing.id}/ebc`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId }),
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

      router.push(`${basePath}/listings/${normalized}`)
    }
  }, [
    listing,
    activePointers,
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
      const [meta, titles, bullets, gallery, video, ebc, pointers] = await Promise.all([
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
      ])

      setActivePointers(meta)
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
    const selectedTitle = selectedTitleRev ? selectedTitleRev.title : null

    applyTitle(doc, selectedTitle)
    applyBullets(doc, selectedBullets)
    applyGallery(doc, selectedGallery)
    applyVideo(doc, selectedVideo)
    applyEbc(doc, appliedEbc)
    applyVariationSelection(doc, listing ? listing.asin : null)

    updateTrackControls(doc, 'title', selectedTitleRev?.seq, titleIndex, titleRevisions.length)
    updateTrackControls(doc, 'bullets', selectedBullets?.seq, bulletsIndex, bulletsRevisions.length)
    updateTrackControls(doc, 'gallery', selectedGallery?.seq, galleryIndex, galleryRevisions.length)
    updateTrackControls(doc, 'video', selectedVideo?.seq, videoIndex, videoRevisions.length)
    updateTrackControls(doc, 'ebc', selectedEbc?.seq, ebcIndex, ebcRevisions.length)
    updateEbcModuleControls(doc, ebcRevisions, ebcModulePointers, activePointers?.activeEbcId ?? null)

    const height = doc.documentElement.scrollHeight
    if (height > 0) {
      setIframeHeight(height)
    }
  }, [
    iframeEpoch,
    listing,
    activePointers,
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
      void downloadGalleryRevisionZip(selected).catch((err) => console.error(err))
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
        src={`${basePath}/api/fixture/listingpage.html`}
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
                {galleryFiles.length > 0 ? `${galleryFiles.length} file(s) selected` : 'Select JPG/PNG/WebP/AVIF files.'}
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
      const seq = history[safeIndex]?.seq
      label.textContent = seq ? `Module v${seq}` : 'Module —'
    }

    const prev = control.querySelector<HTMLButtonElement>('button[data-dir="prev"]')
    const next = control.querySelector<HTMLButtonElement>('button[data-dir="next"]')
    const del = control.querySelector<HTMLButtonElement>('button[data-action="delete"]')

    if (prev) prev.disabled = safeIndex >= history.length - 1
    if (next) next.disabled = safeIndex <= 0
    if (del) del.disabled = !(key in pointers)
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

async function downloadGalleryRevisionZip(rev: GalleryRevision) {
  const files = rev.images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((img) => {
      const downloadSrc = img.hiRes ? img.hiRes : img.src
      const ext = fileExt(downloadSrc)
      return {
        url: resolveImageSrc(downloadSrc),
        filename: `gallery_v${rev.seq}_${String(img.position).padStart(2, '0')}${ext}`,
      }
    })

  await downloadFilesAsZip(`gallery_v${rev.seq}.zip`, files)
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
      a { cursor: default !important; }
    `
    doc.head.append(style)
  }

  const imageBlock = doc.querySelector<HTMLElement>('#imageBlock')
  if (imageBlock) {
    ensureTrackControls(doc, imageBlock, 'gallery', 'Images', callbacksRef)
    ensureGalleryThumbnailSwap(doc)
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

  const video = doc.querySelector<HTMLElement>('[data-elementid="vse-vw-dp-widget-container"]') ?? doc.querySelector<HTMLElement>('#ive-hero-video-player')
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
	        callbacksRef.current?.variationSelect(asin)
	      },
	      true,
	    )
	  }
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
  del.title = 'Delete version'
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
  const storedDoc = doc as ArgusReplicaDocument
  const productTitle = doc.getElementById('productTitle')
  if (!productTitle) return

  if (storedDoc.__argusTitleBaseline === undefined) {
    storedDoc.__argusTitleBaseline = productTitle.textContent ?? ''
  }

  if (title === null) {
    if (storedDoc.__argusTitleBaseline !== undefined) {
      productTitle.textContent = storedDoc.__argusTitleBaseline
    }
    return
  }

  productTitle.textContent = title
}

function applyBullets(doc: Document, rev: BulletsRevision | null) {
  const list = doc.querySelector('#feature-bullets ul')
  if (!list) return

  const storedDoc = doc as ArgusReplicaDocument
  if (!storedDoc.__argusBulletsBaseline) {
    const baselineBullets = Array.from(list.querySelectorAll('.a-list-item'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter((text) => text.length > 0)
      .slice(0, 5)

    storedDoc.__argusBulletsBaseline = {
      html: (list as HTMLElement).innerHTML,
      bullets: baselineBullets,
    }
  }

  const template = list.querySelector('li')
  list.querySelectorAll('li').forEach((li) => li.remove())
  if (!rev) {
    if (storedDoc.__argusBulletsBaseline) {
      (list as HTMLElement).innerHTML = storedDoc.__argusBulletsBaseline.html
    }
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

interface GalleryBaselineThumb {
  liDisplay: string
  imgSrc: string | null
  imgOldHires: string | null
}

interface GalleryBaseline {
  landingSrc: string | null
  landingOldHires: string | null
  landingVisibility: string
  altImagesDisplay: string
  thumbs: GalleryBaselineThumb[]
  selectedThumbIndex: number
}

interface BulletsBaseline {
  html: string
  bullets: string[]
}

interface EbcBaselineModule {
  display: string
  html: string
}

interface EbcBaselineContainer {
  display: string
  modules: EbcBaselineModule[]
}

interface EbcBaseline {
  brand: EbcBaselineContainer | null
  description: EbcBaselineContainer | null
}

type ArgusReplicaDocument = Document & {
  __argusTitleBaseline?: string
  __argusBulletsBaseline?: BulletsBaseline
  __argusGalleryBaseline?: GalleryBaseline
  __argusMainMediaIndex?: number
  __argusVideoBaseline?: string
  __argusEbcBaseline?: EbcBaseline
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

function captureGalleryBaseline(doc: Document): GalleryBaseline | null {
  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  const altImages = doc.getElementById('altImages') as HTMLElement | null
  const altList = doc.querySelector<HTMLElement>('#altImages ul')

  if (!landing || !altImages || !altList) return null

  const lis = Array.from(altList.querySelectorAll<HTMLElement>('li'))
  const thumbs: GalleryBaselineThumb[] = lis.map((li) => {
    const img = li.querySelector<HTMLImageElement>('img')
    return {
      liDisplay: li.style.display,
      imgSrc: img ? img.getAttribute('src') : null,
      imgOldHires: img ? img.getAttribute('data-old-hires') : null,
    }
  })

  const selectedByClass = lis.findIndex((li) => li.querySelector('.a-button-thumbnail')?.classList.contains('a-button-selected') ?? false)
  const selectedByRadio = lis.findIndex((li) => li.querySelector<HTMLButtonElement>('button[role="radio"]')?.getAttribute('aria-checked') === 'true')
  const selectedThumbIndex = selectedByClass >= 0 ? selectedByClass : (selectedByRadio >= 0 ? selectedByRadio : 0)

  return {
    landingSrc: landing.getAttribute('src'),
    landingOldHires: landing.getAttribute('data-old-hires'),
    landingVisibility: landing.style.visibility,
    altImagesDisplay: altImages.style.display,
    thumbs,
    selectedThumbIndex,
  }
}

function restoreGalleryBaseline(doc: Document, baseline: GalleryBaseline) {
  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  const altImages = doc.getElementById('altImages') as HTMLElement | null
  const altList = doc.querySelector<HTMLElement>('#altImages ul')

  if (landing) {
    landing.style.visibility = baseline.landingVisibility
    if (baseline.landingSrc) {
      landing.setAttribute('src', baseline.landingSrc)
    } else {
      landing.removeAttribute('src')
    }
    if (baseline.landingOldHires) {
      landing.setAttribute('data-old-hires', baseline.landingOldHires)
    } else {
      landing.removeAttribute('data-old-hires')
    }
  }

  if (altImages) {
    altImages.style.display = baseline.altImagesDisplay
  }

  if (!altList) return

  const lis = Array.from(altList.querySelectorAll<HTMLElement>('li'))
  for (let i = 0; i < baseline.thumbs.length && i < lis.length; i++) {
    const li = lis[i]
    const base = baseline.thumbs[i]
    li.style.display = base.liDisplay
    const img = li.querySelector<HTMLImageElement>('img')
    if (!img) continue
    if (base.imgSrc) {
      img.setAttribute('src', base.imgSrc)
    } else {
      img.removeAttribute('src')
    }
    if (base.imgOldHires) {
      img.setAttribute('data-old-hires', base.imgOldHires)
    } else {
      img.removeAttribute('data-old-hires')
    }
  }

  const selected = lis.length > baseline.selectedThumbIndex ? lis[baseline.selectedThumbIndex] : (lis.length > 0 ? lis[0] : null)
  setAltImagesSelection(altList, selected)
}

function applyGallery(doc: Document, rev: GalleryRevision | null) {
  const storedDoc = doc as ArgusReplicaDocument
  if (!storedDoc.__argusGalleryBaseline) {
    const baseline = captureGalleryBaseline(doc)
    if (baseline) storedDoc.__argusGalleryBaseline = baseline
  }

  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  const altImages = doc.getElementById('altImages') as HTMLElement | null

  if (!rev || rev.images.length === 0) {
    if (storedDoc.__argusGalleryBaseline) {
      restoreGalleryBaseline(doc, storedDoc.__argusGalleryBaseline)
    }

    const mainIndex = typeof storedDoc.__argusMainMediaIndex === 'number' ? storedDoc.__argusMainMediaIndex : 0
    if (Number.isFinite(mainIndex)) setDesktopMediaMainViewIndex(doc, mainIndex)
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

  const altList = doc.querySelector<HTMLElement>('#altImages ul')
  if (!altList) return

  const imageLis = Array.from(altList.querySelectorAll<HTMLLIElement>('li.imageThumbnail'))
    .slice()
    .sort((a, b) => (itemNoFromElement(a) ?? 0) - (itemNoFromElement(b) ?? 0))

  for (let i = 0; i < thumbs.length && i < imageLis.length; i++) {
    const item = thumbs[i]
    const li = imageLis[i]
    const existingImg = li.querySelector('img')
    const img = existingImg ? existingImg : doc.createElement('img')
    img.src = resolveImageSrc(item.src)
    const hiRes = item.hiRes ? resolveImageSrc(item.hiRes) : img.src
    img.setAttribute('data-old-hires', hiRes)
    if (!li.contains(img)) li.append(img)
    li.style.display = ''
  }

  for (let i = thumbs.length; i < imageLis.length; i++) {
    imageLis[i].style.display = 'none'
  }

  const firstVisible = altList.querySelector<HTMLElement>('li.imageThumbnail:not([style*="display: none"])')
  setAltImagesSelection(altList, firstVisible)

  storedDoc.__argusMainMediaIndex = 0
  setDesktopMediaMainViewIndex(doc, 0)
}

function ensureGalleryThumbnailSwap(doc: Document) {
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

    const img = li.querySelector('img')
    if (!img) return

    const landing = doc.getElementById('landingImage') as HTMLImageElement | null
    if (!landing) return

    const src = img.getAttribute('data-old-hires') ?? img.getAttribute('src')
    if (!src) return

    e.preventDefault()
    e.stopImmediatePropagation()
    e.stopPropagation()

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
  const container = doc.querySelector<HTMLElement>('#ive-hero-video-player')
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
  const storedDoc = doc as ArgusReplicaDocument
  const brandContainer = doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
  const descriptionContainer = doc.querySelector<HTMLElement>('#aplus_feature_div')

  if (!storedDoc.__argusEbcBaseline) {
    const brand = brandContainer ? captureEbcContainerBaseline(brandContainer) : null
    const description = descriptionContainer ? captureEbcContainerBaseline(descriptionContainer) : null
    storedDoc.__argusEbcBaseline = { brand, description }
  }

  if (!rev || rev.sections.length === 0) {
    if (brandContainer && storedDoc.__argusEbcBaseline.brand) {
      const marker = brandContainer.dataset.argusEbcApplied
      if (marker !== undefined || brandContainer.style.display === 'none') {
        restoreEbcContainerBaseline(brandContainer, storedDoc.__argusEbcBaseline.brand)
        delete brandContainer.dataset.argusEbcApplied
      }
    }
    if (descriptionContainer && storedDoc.__argusEbcBaseline.description) {
      const marker = descriptionContainer.dataset.argusEbcApplied
      if (marker !== undefined || descriptionContainer.style.display === 'none') {
        restoreEbcContainerBaseline(descriptionContainer, storedDoc.__argusEbcBaseline.description)
        delete descriptionContainer.dataset.argusEbcApplied
      }
    }
    return
  }

  const brandSection = rev.sections.find((section) => section.sectionType === 'BRAND_STORY') ?? null
  const descriptionSection = rev.sections.find((section) => section.sectionType !== 'BRAND_STORY') ?? null

  if (brandContainer) {
    if (!brandSection) {
      brandContainer.style.display = ''
      if (storedDoc.__argusEbcBaseline.brand) {
        restoreEbcContainerBaseline(brandContainer, storedDoc.__argusEbcBaseline.brand)
      }
      delete brandContainer.dataset.argusEbcApplied
    } else {
      brandContainer.style.display = ''
      applyEbcSection(brandContainer, brandSection, storedDoc.__argusEbcBaseline.brand)
      brandContainer.dataset.argusEbcApplied = rev.id
    }
  }

  if (descriptionContainer) {
    if (!descriptionSection) {
      descriptionContainer.style.display = ''
      if (storedDoc.__argusEbcBaseline.description) {
        restoreEbcContainerBaseline(descriptionContainer, storedDoc.__argusEbcBaseline.description)
      }
      delete descriptionContainer.dataset.argusEbcApplied
    } else {
      descriptionContainer.style.display = ''
      applyEbcSection(descriptionContainer, descriptionSection, storedDoc.__argusEbcBaseline.description)
      descriptionContainer.dataset.argusEbcApplied = rev.id
    }
  }
}

function captureEbcContainerBaseline(container: HTMLElement): EbcBaselineContainer {
  const modules = Array.from(container.querySelectorAll<HTMLElement>('.aplus-module'))
  const baselines: EbcBaselineModule[] = modules.map((mod) => {
    const clone = mod.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.argus-vc-ebc-module-controls').forEach((el) => el.remove())
    return {
      display: mod.style.display,
      html: clone.innerHTML,
    }
  })

  return {
    display: container.style.display,
    modules: baselines,
  }
}

function restoreEbcContainerBaseline(container: HTMLElement, baseline: EbcBaselineContainer) {
  container.style.display = baseline.display
  const modules = Array.from(container.querySelectorAll<HTMLElement>('.aplus-module'))
  for (let i = 0; i < modules.length && i < baseline.modules.length; i++) {
    restoreEbcModuleBaseline(modules[i], baseline.modules[i])
  }
}

function restoreEbcModuleBaseline(target: HTMLElement, baseline: EbcBaselineModule) {
  const controls = target.querySelector<HTMLElement>('.argus-vc-ebc-module-controls')
  if (controls) controls.remove()

  target.innerHTML = baseline.html
  target.style.display = baseline.display

  if (controls) target.append(controls)
}

function applyEbcSection(container: HTMLElement, section: EbcSection, baseline: EbcBaselineContainer | null) {
  const modules = Array.from(container.querySelectorAll<HTMLElement>('.aplus-module'))

  for (let mi = 0; mi < modules.length; mi++) {
    const target = modules[mi]
    if (!target) continue
    target.style.display = ''

    const srcMod = section.modules[mi]
    if (!srcMod) {
      const baselineModule = baseline ? baseline.modules[mi] ?? null : null
      if (baselineModule) restoreEbcModuleBaseline(target, baselineModule)
      continue
    }

    const headings = Array.from(target.querySelectorAll('h3, h4, .aplus-module-heading'))
    if (headings.length > 0 && srcMod.headline) {
      headings[0].textContent = srcMod.headline
    }

    const paragraphs = Array.from(target.querySelectorAll('p'))
    if (paragraphs.length > 0 && srcMod.bodyText) {
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
    }

    const images = Array.from(target.querySelectorAll('img'))
    for (let ii = 0; ii < srcMod.images.length; ii++) {
      const srcImg = srcMod.images[ii]
      const img = images[ii]
      if (!img) continue
      img.src = resolveImageSrc(srcImg.src)
      if (srcImg.alt) img.alt = srcImg.alt
    }
  }
}
