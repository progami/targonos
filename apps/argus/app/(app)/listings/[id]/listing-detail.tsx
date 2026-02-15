'use client'

import { useRef, useEffect, useState } from 'react'
import { BulletPoints } from '@/components/pdp/BulletPoints'
import { ImageGallery } from '@/components/pdp/ImageGallery'
import { EbcRenderer } from '@/components/pdp/EbcRenderer'
import { VersionBar } from '@/components/versions/VersionBar'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface GalleryImage {
  position: number
  src: string
  hiRes: string | null
  isVideo: boolean
}

interface EbcSection {
  sectionType: string
  heading: string | null
  modules: {
    moduleType: string
    headline: string | null
    bodyText: string | null
    images: { src: string; alt: string | null }[]
  }[]
}

interface ListingDetailProps {
  listingId: string
  listing?: {
    id: string
    asin: string
    label: string
  }
  bullets?: {
    bullet1: string | null
    bullet2: string | null
    bullet3: string | null
    bullet4: string | null
    bullet5: string | null
    seq: number
    createdAt: string
  } | null
  gallery?: {
    images: GalleryImage[]
    seq: number
    createdAt: string
  } | null
  ebc?: {
    sections: EbcSection[]
    seq: number
    createdAt: string
  } | null
  totalSnapshots?: number
}

export function ListingDetail({
  listingId,
  listing,
  bullets,
  gallery,
  ebc,
  totalSnapshots = 0,
}: ListingDetailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)
  const [activeTrack, setActiveTrack] = useState<string | null>(null)
  const hasVersionData = !!(bullets || gallery || ebc)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      const height = doc.documentElement.scrollHeight
      if (height > 0) {
        setIframeHeight(height)
      }

      const links = doc.querySelectorAll('a')
      for (const link of links) {
        link.addEventListener('click', (e) => e.preventDefault())
        link.style.cursor = 'default'
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-4">
          <a
            href={`${basePath}/listings`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Listings
          </a>
          <h1 className="text-lg font-semibold">
            {listing?.label ?? 'PDP Replica'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
            {listing?.asin ?? listingId}
          </span>
        </div>
      </div>

      {/* Version bar */}
      {hasVersionData && listing && (
        <VersionBar
          listing={listing}
          bullets={bullets ? { seq: bullets.seq, createdAt: bullets.createdAt } : null}
          gallery={gallery ? { seq: gallery.seq, createdAt: gallery.createdAt } : null}
          ebc={ebc ? { seq: ebc.seq, createdAt: ebc.createdAt } : null}
          totalSnapshots={totalSnapshots}
          activeTrack={activeTrack}
          onTrackSelect={setActiveTrack}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {hasVersionData ? (
          <div className="max-w-[1200px] mx-auto">
            {/* Version-controlled components */}
            <div className="bg-white border-b">
              {/* Image Gallery + Bullets row (Amazon PDP layout) */}
              <div className="flex gap-6 p-6">
                {/* Left: Images */}
                <div className="w-[40%] shrink-0">
                  {gallery && gallery.images.length > 0 && (
                    <ImageGallery images={gallery.images} />
                  )}
                </div>

                {/* Right: Bullets */}
                <div className="flex-1">
                  {bullets && <BulletPoints bullets={bullets} />}
                </div>
              </div>

              {/* EBC Content */}
              {ebc && ebc.sections.length > 0 && (
                <div className="px-6 py-8 border-t">
                  <EbcRenderer sections={ebc.sections} />
                </div>
              )}
            </div>

            {/* Iframe for everything else */}
            <div className="border-t">
              <div className="px-4 py-2 bg-gray-50 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Full PDP Reference
              </div>
              <iframe
                ref={iframeRef}
                src={`${basePath}/api/fixture/replica.html`}
                className="w-full border-0"
                style={{ height: iframeHeight }}
                title="Amazon PDP Replica"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        ) : (
          /* Fallback: iframe-only view when no DB data */
          <div className="bg-white">
            <iframe
              ref={iframeRef}
              src={`${basePath}/api/fixture/replica.html`}
              className="w-full border-0"
              style={{ height: iframeHeight }}
              title="Amazon PDP Replica"
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  )
}
