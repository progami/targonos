'use client'

import { useRef, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useRouter } from 'next/navigation'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

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

export function ListingDetail({
  listingId,
  listing,
}: ListingDetailProps) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)
  const iframeDocRef = useRef<Document | null>(null)
  const [iframeEpoch, setIframeEpoch] = useState(0)

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
      const nextDraft = selected ? selected.title : (listing ? listing.label : '')
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
        await fetch(`${basePath}/api/listings/${listing.id}/title`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
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
      if (!window.confirm(`Delete Bullets v${selected.seq}?`)) return

      void (async () => {
        await fetch(`${basePath}/api/listings/${listing.id}/bullets`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
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
        await fetch(`${basePath}/api/listings/${listing.id}/gallery`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
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
        await fetch(`${basePath}/api/listings/${listing.id}/video`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId: selected.id }),
        })
        setRefreshKey((current) => current + 1)
      })()
    }

    async function persistEbcModulePointer(sectionType: string, modulePosition: number, ebcRevisionId: string) {
      if (!listing) return
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

      for (const section of layout.sections) {
        for (let mi = 0; mi < section.modules.length; mi++) {
          const key = ebcModulePointerKey(section.sectionType, mi)
          nextPointers[key] = revisionId
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
        await fetch(`${basePath}/api/listings/${listing.id}/ebc/pointers`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        })
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
      setEbcModulePointers((current) => ({ ...current, [ebcModulePointerKey(sectionType, modulePosition)]: nextRevisionId }))
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
      setEbcModulePointers((current) => ({ ...current, [ebcModulePointerKey(sectionType, modulePosition)]: nextRevisionId }))
      void persistEbcModulePointer(sectionType, modulePosition, nextRevisionId)
    }

    callbacksRef.current.ebcModuleLive = (sectionType: string, modulePosition: number) => {
      const activeId = activePointers?.activeEbcId
      const fallback = ebcRevisions.length > 0 ? ebcRevisions[ebcRevisions.length - 1] : null
      const nextRevisionId = activeId ? activeId : (fallback ? fallback.id : null)
      if (!nextRevisionId) return

      setEbcModulePointers((current) => ({ ...current, [ebcModulePointerKey(sectionType, modulePosition)]: nextRevisionId }))
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
      if (!window.confirm('Clear this module override?')) return

      void (async () => {
        await fetch(`${basePath}/api/listings/${listing.id}/ebc/pointers`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionType, modulePosition }),
        })

        const key = ebcModulePointerKey(sectionType, modulePosition)
        setEbcModulePointers((current) => {
          if (!(key in current)) return current
          const next = { ...current }
          delete next[key]
          return next
        })
      })()
    }

    callbacksRef.current.variationSelect = (asin: string) => {
      const normalized = String(asin).trim()
      if (normalized.length === 0) return

      void (async () => {
        await fetch(`${basePath}/api/listings/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asin: normalized }),
        })

        router.push(`/listings/${normalized}`)
      })()
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
      setEbcModulePointers(pointers.reduce<Record<string, string>>((acc, pointer) => {
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
      iframeDocRef.current = doc
      setIframeEpoch((current) => current + 1)

      const height = doc.documentElement.scrollHeight
      if (height > 0) {
        setIframeHeight(height)
      }

      if (listing) {
        injectArgusVersionControls(doc, callbacksRef)
      }

      const links = doc.querySelectorAll('a')
      for (const link of links) {
        link.addEventListener('click', (e) => e.preventDefault())
        link.style.cursor = 'default'
      }
    }

    iframe.addEventListener('load', handleLoad)
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
    applyBullets(doc, selectedBullets)
    applyGallery(doc, selectedGallery)
    applyVideo(doc, selectedVideo)
    applyEbc(doc, appliedEbc)

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
        src={`${basePath}/api/fixture/replica.html`}
        className="w-full border-0"
        style={{ height: iframeHeight }}
        title={listing ? listing.label : listingId}
        sandbox="allow-same-origin"
      />
      {titleEditorOpen && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl border">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">New title version</div>
              <div className="text-xs text-muted-foreground">ASIN {listing.asin}</div>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                rows={4}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Enter a new title…"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                  onClick={() => setTitleEditorOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={titleDraft.trim().length === 0}
                  onClick={async () => {
                    await fetch(`${basePath}/api/listings/${listing.id}/title`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: titleDraft }),
                    })
                    setTitleEditorOpen(false)
                    setRefreshKey((current) => current + 1)
                  }}
                >
                  Save new version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {bulletsEditorOpen && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl border">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">New bullets version</div>
              <div className="text-xs text-muted-foreground">ASIN {listing.asin}</div>
            </div>
            <div className="p-4 space-y-3">
              {([
                ['bullet1', 'Bullet 1'],
                ['bullet2', 'Bullet 2'],
                ['bullet3', 'Bullet 3'],
                ['bullet4', 'Bullet 4'],
                ['bullet5', 'Bullet 5'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <textarea
                    value={bulletsDraft[key]}
                    onChange={(e) => setBulletsDraft((current) => ({ ...current, [key]: e.target.value }))}
                    rows={2}
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="Enter bullet text…"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                  onClick={() => setBulletsEditorOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
                  onClick={async () => {
                    await fetch(`${basePath}/api/listings/${listing.id}/bullets`, {
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
                    setBulletsEditorOpen(false)
                    setRefreshKey((current) => current + 1)
                  }}
                >
                  Save new version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {galleryUploaderOpen && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl border">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">New gallery version</div>
              <div className="text-xs text-muted-foreground">ASIN {listing.asin}</div>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : []
                  setGalleryFiles(list)
                }}
              />
              <div className="text-xs text-muted-foreground">
                {galleryFiles.length > 0 ? `${galleryFiles.length} file(s) selected` : 'Select JPG/PNG/WebP/AVIF files.'}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                  onClick={() => setGalleryUploaderOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={galleryFiles.length === 0}
                  onClick={async () => {
                    const form = new FormData()
                    for (const file of galleryFiles) {
                      form.append('files', file)
                    }

                    await fetch(`${basePath}/api/listings/${listing.id}/gallery`, {
                      method: 'POST',
                      body: form,
                    })
                    setGalleryUploaderOpen(false)
                    setRefreshKey((current) => current + 1)
                  }}
                >
                  Upload new version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {videoUploaderOpen && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl border">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">New video version</div>
              <div className="text-xs text-muted-foreground">ASIN {listing.asin}</div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Video file</div>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="block w-full text-sm"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null
                    setVideoFile(file)
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Poster image (optional)</div>
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null
                    setVideoPosterFile(file)
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                  onClick={() => setVideoUploaderOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={!videoFile}
                  onClick={async () => {
                    if (!videoFile) return
                    const form = new FormData()
                    form.append('file', videoFile)
                    if (videoPosterFile) form.append('poster', videoPosterFile)

                    await fetch(`${basePath}/api/listings/${listing.id}/video`, {
                      method: 'POST',
                      body: form,
                    })
                    setVideoUploaderOpen(false)
                    setRefreshKey((current) => current + 1)
                  }}
                >
                  Upload new version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {ebcModuleEditorOpen && listing && ebcModuleEditorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl border">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">New A+ module version</div>
              <div className="text-xs text-muted-foreground">
                {ebcModuleEditorTarget.sectionType} · Module {ebcModuleEditorTarget.modulePosition + 1}
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Headline</div>
                <textarea
                  value={ebcModuleDraft.headline}
                  onChange={(e) => setEbcModuleDraft((current) => ({ ...current, headline: e.target.value }))}
                  rows={2}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="Enter headline…"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Body</div>
                <textarea
                  value={ebcModuleDraft.bodyText}
                  onChange={(e) => setEbcModuleDraft((current) => ({ ...current, bodyText: e.target.value }))}
                  rows={5}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="Enter body text…"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Images (optional)</div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="block w-full text-sm"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : []
                    setEbcModuleFiles(list)
                  }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {ebcModuleFiles.length > 0 ? `${ebcModuleFiles.length} file(s) selected` : 'Leave empty to keep current images.'}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
                  onClick={() => setEbcModuleEditorOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
                  onClick={async () => {
                    const form = new FormData()
                    form.append('sectionType', ebcModuleEditorTarget.sectionType)
                    form.append('modulePosition', String(ebcModuleEditorTarget.modulePosition))
                    form.append('headline', ebcModuleDraft.headline)
                    form.append('bodyText', ebcModuleDraft.bodyText)
                    for (const file of ebcModuleFiles) {
                      form.append('files', file)
                    }

                    await fetch(`${basePath}/api/listings/${listing.id}/ebc/module`, {
                      method: 'POST',
                      body: form,
                    })
                    setEbcModuleEditorOpen(false)
                    setRefreshKey((current) => current + 1)
                  }}
                >
                  Save new version
                </button>
              </div>
            </div>
          </div>
        </div>
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

    if (prev) prev.disabled = safeIndex >= history.length - 1
    if (next) next.disabled = safeIndex <= 0
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

      /* Match the fixture's intended gallery layout (horizontal thumbnails). */
      #altImages ul {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        gap: 6px !important;
      }
      #altImages ul.a-vertical { align-items: center !important; }
      #altImages li { margin: 0 !important; }
    `
    doc.head.append(style)
  }

  const imageBlock = doc.querySelector<HTMLElement>('#imageBlock')
  if (imageBlock) {
    ensureTrackControls(doc, imageBlock, 'gallery', 'Images', callbacksRef)
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
  del.title = 'Clear override'
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
  if (!title) return
  const productTitle = doc.getElementById('productTitle')
  if (productTitle) {
    productTitle.textContent = title
  }
}

function applyBullets(doc: Document, rev: BulletsRevision | null) {
  const list = doc.querySelector('#feature-bullets ul')
  if (!list) return

  const template = list.querySelector('li')
  list.querySelectorAll('li').forEach((li) => li.remove())
  if (!rev) return

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

function applyGallery(doc: Document, rev: GalleryRevision | null) {
  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  const altImages = doc.getElementById('altImages') as HTMLElement | null

  if (!rev || rev.images.length === 0) {
    if (landing) {
      landing.style.visibility = 'hidden'
      landing.removeAttribute('src')
      landing.removeAttribute('data-old-hires')
    }
    if (altImages) altImages.style.display = 'none'
    return
  }

  const sorted = rev.images.slice().sort((a, b) => a.position - b.position)
  const main = sorted[0]
  const thumbs = sorted.slice(1)

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

  const altList = doc.querySelector('#altImages ul')
  if (!altList) return

  const templateLi = altList.querySelector('li')
  const existingLis = Array.from(altList.querySelectorAll('li'))

  for (let i = 0; i < thumbs.length; i++) {
    const item = thumbs[i]
    const li = existingLis[i]
      ? existingLis[i]
      : (templateLi ? templateLi.cloneNode(true) as HTMLLIElement : doc.createElement('li'))
    const existingImg = li.querySelector('img')
    const img = existingImg ? existingImg : doc.createElement('img')
    img.src = resolveImageSrc(item.src)
    const hiRes = item.hiRes ? resolveImageSrc(item.hiRes) : img.src
    img.setAttribute('data-old-hires', hiRes)
    if (!li.contains(img)) li.append(img)
    li.style.display = ''
    if (!existingLis[i]) altList.append(li)
  }

  for (let i = thumbs.length; i < existingLis.length; i++) {
    existingLis[i].style.display = 'none'
  }
}

function applyVideo(doc: Document, rev: VideoRevision | null) {
  const container = doc.querySelector<HTMLElement>('#ive-hero-video-player')
  if (!container) return
  if (!rev) return

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

  if (!rev) {
    if (brandContainer) brandContainer.style.display = 'none'
    if (descriptionContainer) descriptionContainer.style.display = 'none'
    return
  }

  if (rev.sections.length === 0) {
    if (brandContainer) brandContainer.style.display = 'none'
    if (descriptionContainer) descriptionContainer.style.display = 'none'
    return
  }

  const brandSection = rev.sections.find((section) => section.sectionType === 'BRAND_STORY') ?? null
  const descriptionSection = rev.sections.find((section) => section.sectionType !== 'BRAND_STORY') ?? null

  if (brandContainer) {
    if (!brandSection) {
      brandContainer.style.display = 'none'
    } else {
      brandContainer.style.display = ''
      applyEbcSection(brandContainer, brandSection)
    }
  }

  if (descriptionContainer) {
    if (!descriptionSection) {
      descriptionContainer.style.display = 'none'
    } else {
      descriptionContainer.style.display = ''
      applyEbcSection(descriptionContainer, descriptionSection)
    }
  }
}

function applyEbcSection(container: HTMLElement, section: EbcSection) {
  const modules = Array.from(container.querySelectorAll<HTMLElement>('.aplus-module'))

  for (let mi = 0; mi < section.modules.length; mi++) {
    const srcMod = section.modules[mi]
    const target = modules[mi]
    if (!target) continue
    target.style.display = ''

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

  for (let mi = section.modules.length; mi < modules.length; mi++) {
    modules[mi].style.display = 'none'
  }
}
