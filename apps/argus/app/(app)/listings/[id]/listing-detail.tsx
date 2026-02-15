'use client'

import { useRef, useEffect, useState } from 'react'
import type { RefObject } from 'react'

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
}

interface ListingDetailProps {
  listingId: string
  listing?: ListingSummary
}

export function ListingDetail({
  listingId,
  listing,
}: ListingDetailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)
  const iframeDocRef = useRef<Document | null>(null)
  const [iframeEpoch, setIframeEpoch] = useState(0)

  const [refreshKey, setRefreshKey] = useState(0)

  const [titleRevisions, setTitleRevisions] = useState<TitleRevision[]>([])
  const [titleIndex, setTitleIndex] = useState(0)

  const [bulletsRevisions, setBulletsRevisions] = useState<BulletsRevision[]>([])
  const [galleryRevisions, setGalleryRevisions] = useState<GalleryRevision[]>([])
  const [ebcRevisions, setEbcRevisions] = useState<EbcRevision[]>([])

  const [activePointers, setActivePointers] = useState<ListingActivePointers | null>(null)

  const [bulletsIndex, setBulletsIndex] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [ebcIndex, setEbcIndex] = useState(0)

  const [titleEditorOpen, setTitleEditorOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const callbacksRef = useRef({
    titlePrev: () => {},
    titleNext: () => {},
    titleEdit: () => {},
    titleLive: () => {},
    bulletsPrev: () => {},
    bulletsNext: () => {},
    bulletsLive: () => {},
    galleryPrev: () => {},
    galleryNext: () => {},
    galleryLive: () => {},
    galleryDownload: () => {},
    ebcPrev: () => {},
    ebcNext: () => {},
    ebcLive: () => {},
    ebcDownload: () => {},
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
      if (!activeId) return
      const index = titleRevisions.findIndex((rev) => rev.id === activeId)
      if (index < 0) return
      setTitleIndex(index)
    }

    callbacksRef.current.bulletsPrev = () => {
      setBulletsIndex((current) => {
        const max = bulletsRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.bulletsNext = () => setBulletsIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.bulletsLive = () => {
      const activeId = activePointers?.activeBulletsId
      if (!activeId) return
      const index = bulletsRevisions.findIndex((rev) => rev.id === activeId)
      if (index < 0) return
      setBulletsIndex(index)
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
      if (!activeId) return
      const index = galleryRevisions.findIndex((rev) => rev.id === activeId)
      if (index < 0) return
      setGalleryIndex(index)
    }

    callbacksRef.current.ebcPrev = () => {
      setEbcIndex((current) => {
        const max = ebcRevisions.length - 1
        if (max < 0) return current
        return current < max ? current + 1 : current
      })
    }
    callbacksRef.current.ebcNext = () => setEbcIndex((current) => (current > 0 ? current - 1 : current))
    callbacksRef.current.ebcLive = () => {
      const activeId = activePointers?.activeEbcId
      if (!activeId) return
      const index = ebcRevisions.findIndex((rev) => rev.id === activeId)
      if (index < 0) return
      setEbcIndex(index)
    }
  }, [
    listing,
    activePointers,
    titleIndex,
    titleRevisions,
    bulletsRevisions,
    galleryRevisions,
    ebcRevisions,
  ])

  useEffect(() => {
    if (!listing) return

    const listingDbId = listing.id
    const abortController = new AbortController()

    async function loadRevisions() {
      const [meta, titles, bullets, gallery, ebc] = await Promise.all([
        fetch(`${basePath}/api/listings/${listingDbId}`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<ListingActivePointers>,
        fetch(`${basePath}/api/listings/${listingDbId}/title`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<TitleRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/bullets`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<BulletsRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/gallery`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<GalleryApiRevision[]>,
        fetch(`${basePath}/api/listings/${listingDbId}/ebc`, { signal: abortController.signal })
          .then((res) => res.json()) as Promise<EbcApiRevision[]>,
      ])

      setActivePointers(meta)
      setTitleRevisions(titles)
      setBulletsRevisions(bullets)
      setGalleryRevisions(gallery.map(toGalleryRevision))
      setEbcRevisions(ebc.map(toEbcRevision))

      setTitleIndex(0)
      setBulletsIndex(0)
      setGalleryIndex(0)
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
    const selectedEbc = ebcRevisions.length > ebcIndex ? ebcRevisions[ebcIndex] : null
    const selectedTitle = selectedTitleRev ? selectedTitleRev.title : (listing ? listing.label : null)

    applyTitle(doc, selectedTitle)
    applyBullets(doc, selectedBullets)
    applyGallery(doc, selectedGallery)
    applyEbc(doc, selectedEbc)

    updateTrackControls(doc, 'title', selectedTitleRev?.seq, titleIndex, titleRevisions.length)
    updateTrackControls(doc, 'bullets', selectedBullets?.seq, bulletsIndex, bulletsRevisions.length)
    updateTrackControls(doc, 'gallery', selectedGallery?.seq, galleryIndex, galleryRevisions.length)
    updateTrackControls(doc, 'ebc', selectedEbc?.seq, ebcIndex, ebcRevisions.length)

    const height = doc.documentElement.scrollHeight
    if (height > 0) {
      setIframeHeight(height)
    }
  }, [
    iframeEpoch,
    listing,
    titleIndex,
    titleRevisions,
    bulletsRevisions,
    bulletsIndex,
    galleryRevisions,
    galleryIndex,
    ebcRevisions,
    ebcIndex,
  ])

  useEffect(() => {
    callbacksRef.current.galleryDownload = () => {
      const selected = galleryRevisions.length > galleryIndex ? galleryRevisions[galleryIndex] : null
      if (!selected) return
      void downloadGalleryRevisionZip(selected).catch((err) => console.error(err))
    }

    callbacksRef.current.ebcDownload = () => {
      const selected = ebcRevisions.length > ebcIndex ? ebcRevisions[ebcIndex] : null
      if (!selected) return
      void downloadEbcRevisionZip(selected).catch((err) => console.error(err))
    }
  }, [galleryRevisions, galleryIndex, ebcRevisions, ebcIndex])

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
    return `${basePath}/${src}`
  }
  return src
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
      const ext = fileExt(img.src)
      return {
        url: resolveImageSrc(img.src),
        filename: `gallery_v${rev.seq}_${String(img.position).padStart(2, '0')}${ext}`,
      }
    })

  await downloadFilesAsZip(`gallery_v${rev.seq}.zip`, files)
}

async function downloadEbcRevisionZip(rev: EbcRevision) {
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
          filename: `ebc_v${rev.seq}_s${si + 1}_m${mi + 1}_i${ii + 1}${ext}`,
        })
      }
    }
  }

  await downloadFilesAsZip(`ebc_v${rev.seq}.zip`, files)
}

function injectArgusVersionControls(
  doc: Document,
  callbacksRef: RefObject<{
    titlePrev: () => void
    titleNext: () => void
    titleEdit: () => void
    titleLive: () => void
    bulletsPrev: () => void
    bulletsNext: () => void
    bulletsLive: () => void
    galleryPrev: () => void
    galleryNext: () => void
    galleryLive: () => void
    galleryDownload: () => void
    ebcPrev: () => void
    ebcNext: () => void
    ebcLive: () => void
    ebcDownload: () => void
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

  const ebc = doc.querySelector<HTMLElement>('#aplus_feature_div') ?? doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
  if (ebc) {
    ensureTrackControls(doc, ebc, 'ebc', 'A+ Content', callbacksRef)
  }
}

function ensureTrackControls(
  doc: Document,
  target: HTMLElement,
  track: 'title' | 'bullets' | 'gallery' | 'ebc',
  label: string,
  callbacksRef: RefObject<{
    titlePrev: () => void
    titleNext: () => void
    titleEdit: () => void
    titleLive: () => void
    bulletsPrev: () => void
    bulletsNext: () => void
    bulletsLive: () => void
    galleryPrev: () => void
    galleryNext: () => void
    galleryLive: () => void
    galleryDownload: () => void
    ebcPrev: () => void
    ebcNext: () => void
    ebcLive: () => void
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

  if (track === 'gallery') {
    const download = doc.createElement('button')
    download.id = `argus-vc-download-${track}`
    download.className = 'argus-vc-btn'
    download.type = 'button'
    download.textContent = '⬇'
    download.title = 'Download images'
    download.addEventListener('click', () => callbacksRef.current?.galleryDownload())
    controls.append(download)
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
  target.append(controls)
}

function updateTrackControls(
  doc: Document,
  track: 'title' | 'bullets' | 'gallery' | 'ebc',
  seq: number | undefined,
  index: number,
  count: number,
) {
  const label = doc.getElementById(`argus-vc-label-${track}`)
  if (label) {
    const prefix = track === 'title' ? 'Title' : track === 'gallery' ? 'Images' : track === 'ebc' ? 'A+ Content' : 'Bullets'
    label.textContent = seq ? `${prefix} v${seq}` : `${prefix} —`
  }

  const prev = doc.getElementById(`argus-vc-prev-${track}`) as HTMLButtonElement | null
  const next = doc.getElementById(`argus-vc-next-${track}`) as HTMLButtonElement | null

  if (prev) prev.disabled = count === 0 ? true : index >= count - 1
  if (next) next.disabled = count === 0 ? true : index <= 0
}

function applyTitle(doc: Document, title: string | null) {
  if (!title) return
  const productTitle = doc.getElementById('productTitle')
  if (productTitle) {
    productTitle.textContent = title
  }
}

function applyBullets(doc: Document, rev: BulletsRevision | null) {
  if (!rev) return

  const list = doc.querySelector('#feature-bullets ul')
  if (!list) return

  const template = list.querySelector('li')
  list.querySelectorAll('li').forEach((li) => li.remove())

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
  if (!rev) return
  if (rev.images.length === 0) return

  const sorted = rev.images.slice().sort((a, b) => a.position - b.position)
  const main = sorted[0]
  const thumbs = sorted.slice(1)

  const landing = doc.getElementById('landingImage') as HTMLImageElement | null
  if (landing && main) {
    const src = resolveImageSrc(main.src)
    landing.src = src
    landing.setAttribute('data-old-hires', src)
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
    img.setAttribute('data-old-hires', img.src)
    if (!li.contains(img)) li.append(img)
    li.style.display = ''
    if (!existingLis[i]) altList.append(li)
  }

  for (let i = thumbs.length; i < existingLis.length; i++) {
    existingLis[i].style.display = 'none'
  }
}

function applyEbc(doc: Document, rev: EbcRevision | null) {
  if (!rev) return

  const brandContainer = doc.querySelector<HTMLElement>('#aplusBrandStory_feature_div')
  const descriptionContainer = doc.querySelector<HTMLElement>('#aplus_feature_div')

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
