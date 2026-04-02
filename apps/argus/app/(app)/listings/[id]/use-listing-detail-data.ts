'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  basePath,
  looksLikeAsin,
  toEbcRevision,
  toGalleryRevision,
  toVideoRevision,
  type BulletsRevision,
  type EbcApiRevision,
  type EbcModulePointerApi,
  type EbcRevision,
  type GalleryApiRevision,
  type GalleryRevision,
  type ListingActivePointers,
  type ListingDetailProps,
  type ListingPriceState,
  type ListingSummary,
  type TitleRevision,
  type VideoApiRevision,
  type VideoRevision,
} from './listing-detail-shared'
import { ebcModulePointerKey } from './listing-detail-versioning'

interface ListingDetailData {
  listing: ListingSummary | null
  setListing: Dispatch<SetStateAction<ListingSummary | null>>
  activePointers: ListingActivePointers | null
  setActivePointers: Dispatch<SetStateAction<ListingActivePointers | null>>
  price: ListingPriceState | null
  setPrice: Dispatch<SetStateAction<ListingPriceState | null>>
  titleRevisions: TitleRevision[]
  setTitleRevisions: Dispatch<SetStateAction<TitleRevision[]>>
  titleIndex: number
  setTitleIndex: Dispatch<SetStateAction<number>>
  bulletsRevisions: BulletsRevision[]
  setBulletsRevisions: Dispatch<SetStateAction<BulletsRevision[]>>
  bulletsIndex: number
  setBulletsIndex: Dispatch<SetStateAction<number>>
  galleryRevisions: GalleryRevision[]
  setGalleryRevisions: Dispatch<SetStateAction<GalleryRevision[]>>
  galleryIndex: number
  setGalleryIndex: Dispatch<SetStateAction<number>>
  videoRevisions: VideoRevision[]
  setVideoRevisions: Dispatch<SetStateAction<VideoRevision[]>>
  videoIndex: number
  setVideoIndex: Dispatch<SetStateAction<number>>
  ebcRevisions: EbcRevision[]
  setEbcRevisions: Dispatch<SetStateAction<EbcRevision[]>>
  ebcIndex: number
  setEbcIndex: Dispatch<SetStateAction<number>>
  ebcModulePointers: Record<string, string>
  setEbcModulePointers: Dispatch<SetStateAction<Record<string, string>>>
  refreshListingData: () => void
}

async function readJsonOrThrow<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(text)
  }

  return JSON.parse(text) as T
}

function resetRevisionState(
  setActivePointers: Dispatch<SetStateAction<ListingActivePointers | null>>,
  setPrice: Dispatch<SetStateAction<ListingPriceState | null>>,
  setTitleRevisions: Dispatch<SetStateAction<TitleRevision[]>>,
  setBulletsRevisions: Dispatch<SetStateAction<BulletsRevision[]>>,
  setGalleryRevisions: Dispatch<SetStateAction<GalleryRevision[]>>,
  setVideoRevisions: Dispatch<SetStateAction<VideoRevision[]>>,
  setEbcRevisions: Dispatch<SetStateAction<EbcRevision[]>>,
  setEbcModulePointers: Dispatch<SetStateAction<Record<string, string>>>,
  setTitleIndex: Dispatch<SetStateAction<number>>,
  setBulletsIndex: Dispatch<SetStateAction<number>>,
  setGalleryIndex: Dispatch<SetStateAction<number>>,
  setVideoIndex: Dispatch<SetStateAction<number>>,
  setEbcIndex: Dispatch<SetStateAction<number>>,
) {
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
}

export function useListingDetailData({ listingId, listing: listingProp }: ListingDetailProps): ListingDetailData {
  const [listing, setListing] = useState<ListingSummary | null>(listingProp ?? null)
  const [activePointers, setActivePointers] = useState<ListingActivePointers | null>(null)
  const [price, setPrice] = useState<ListingPriceState | null>(null)
  const [titleRevisions, setTitleRevisions] = useState<TitleRevision[]>([])
  const [titleIndex, setTitleIndex] = useState(0)
  const [bulletsRevisions, setBulletsRevisions] = useState<BulletsRevision[]>([])
  const [bulletsIndex, setBulletsIndex] = useState(0)
  const [galleryRevisions, setGalleryRevisions] = useState<GalleryRevision[]>([])
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [videoRevisions, setVideoRevisions] = useState<VideoRevision[]>([])
  const [videoIndex, setVideoIndex] = useState(0)
  const [ebcRevisions, setEbcRevisions] = useState<EbcRevision[]>([])
  const [ebcIndex, setEbcIndex] = useState(0)
  const [ebcModulePointers, setEbcModulePointers] = useState<Record<string, string>>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshListingData = useCallback(() => {
    setRefreshKey((current) => current + 1)
  }, [])

  useEffect(() => {
    const normalized = String(listingId).trim()
    const abortController = new AbortController()

    if (listingProp && (listingProp.id === normalized || listingProp.asin === normalized)) {
      setListing(listingProp)
      return () => abortController.abort()
    }

    setListing(null)
    resetRevisionState(
      setActivePointers,
      setPrice,
      setTitleRevisions,
      setBulletsRevisions,
      setGalleryRevisions,
      setVideoRevisions,
      setEbcRevisions,
      setEbcModulePointers,
      setTitleIndex,
      setBulletsIndex,
      setGalleryIndex,
      setVideoIndex,
      setEbcIndex,
    )

    void (async () => {
      if (normalized.length === 0) return

      try {
        if (looksLikeAsin(normalized)) {
          const ensured = await readJsonOrThrow<ListingSummary>(`${basePath}/api/listings/ensure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asin: normalized }),
            signal: abortController.signal,
          })
          setListing(ensured)
          return
        }

        const resolved = await readJsonOrThrow<ListingSummary>(`${basePath}/api/listings/${normalized}`, {
          signal: abortController.signal,
        })
        setListing({ id: resolved.id, asin: resolved.asin, label: resolved.label })
      } catch (error) {
        if (abortController.signal.aborted) return
        window.alert(error instanceof Error ? error.message : 'Failed to load listing.')
      }
    })()

    return () => abortController.abort()
  }, [listingId, listingProp])

  useEffect(() => {
    if (!listing) return

    const listingDbId = listing.id
    const abortController = new AbortController()

    void (async () => {
      try {
        const [meta, titles, bullets, gallery, video, ebc, pointers, priceData] = await Promise.all([
          readJsonOrThrow<ListingActivePointers>(`${basePath}/api/listings/${listingDbId}`, { signal: abortController.signal }),
          readJsonOrThrow<TitleRevision[]>(`${basePath}/api/listings/${listingDbId}/title`, { signal: abortController.signal }),
          readJsonOrThrow<BulletsRevision[]>(`${basePath}/api/listings/${listingDbId}/bullets`, { signal: abortController.signal }),
          readJsonOrThrow<GalleryApiRevision[]>(`${basePath}/api/listings/${listingDbId}/gallery`, { signal: abortController.signal }),
          readJsonOrThrow<VideoApiRevision[]>(`${basePath}/api/listings/${listingDbId}/video`, { signal: abortController.signal }),
          readJsonOrThrow<EbcApiRevision[]>(`${basePath}/api/listings/${listingDbId}/ebc`, { signal: abortController.signal }),
          readJsonOrThrow<EbcModulePointerApi[]>(`${basePath}/api/listings/${listingDbId}/ebc/pointers`, {
            signal: abortController.signal,
          }),
          readJsonOrThrow<ListingPriceState>(`${basePath}/api/listings/${listingDbId}/price`, { signal: abortController.signal }),
        ])

        const mappedEbc = ebc.map(toEbcRevision)
        const liveEbcId = meta.activeEbcId

        setActivePointers(meta)
        setPrice(priceData)
        setTitleRevisions(titles)
        setBulletsRevisions(bullets)
        setGalleryRevisions(gallery.map(toGalleryRevision))
        setVideoRevisions(video.map(toVideoRevision))
        setEbcRevisions(mappedEbc)
        setEbcModulePointers(
          pointers.reduce<Record<string, string>>((accumulator, pointer) => {
            if (liveEbcId && pointer.ebcRevisionId === liveEbcId) {
              return accumulator
            }

            accumulator[ebcModulePointerKey(pointer.sectionType, pointer.modulePosition)] = pointer.ebcRevisionId
            return accumulator
          }, {}),
        )

        setTitleIndex(0)
        setBulletsIndex(0)
        setGalleryIndex(0)
        setVideoIndex(0)
        setEbcIndex(0)
      } catch (error) {
        if (abortController.signal.aborted) return
        window.alert(error instanceof Error ? error.message : 'Failed to load listing revisions.')
      }
    })()

    return () => abortController.abort()
  }, [listing, refreshKey])

  return {
    listing,
    setListing,
    activePointers,
    setActivePointers,
    price,
    setPrice,
    titleRevisions,
    setTitleRevisions,
    titleIndex,
    setTitleIndex,
    bulletsRevisions,
    setBulletsRevisions,
    bulletsIndex,
    setBulletsIndex,
    galleryRevisions,
    setGalleryRevisions,
    galleryIndex,
    setGalleryIndex,
    videoRevisions,
    setVideoRevisions,
    videoIndex,
    setVideoIndex,
    ebcRevisions,
    setEbcRevisions,
    ebcIndex,
    setEbcIndex,
    ebcModulePointers,
    setEbcModulePointers,
    refreshListingData,
  }
}
