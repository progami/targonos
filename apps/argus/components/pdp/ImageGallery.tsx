'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Play } from 'lucide-react'

interface GalleryImage {
  position: number
  src: string
  hiRes: string | null
  isVideo: boolean
}

interface ImageGalleryProps {
  images: GalleryImage[]
  diff?: {
    changedPositions: number[]
  }
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function ImageGallery({ images, diff }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeImage = images[activeIndex]

  if (images.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative flex items-center justify-center bg-white border rounded-lg p-2 min-h-[400px]">
        {activeImage && (
          <img
            src={resolveImageSrc(activeImage.hiRes ?? activeImage.src)}
            alt={`Product image ${activeIndex + 1}`}
            className="max-w-full max-h-[480px] object-contain"
          />
        )}
        {activeImage?.isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {images.map((img, i) => {
          const isActive = i === activeIndex
          const isChanged = diff?.changedPositions.includes(img.position)
          return (
            <button
              key={img.position}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'relative shrink-0 w-[72px] h-[72px] border-2 rounded p-0.5 transition-colors',
                isActive ? 'border-[#C45500]' : 'border-gray-200 hover:border-gray-400',
                isChanged && 'ring-2 ring-yellow-400',
              )}
            >
              <img
                src={resolveImageSrc(img.src)}
                alt={`Thumbnail ${i + 1}`}
                className="w-full h-full object-contain"
              />
              {img.isVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Play className="w-4 h-4 text-gray-700" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function resolveImageSrc(src: string): string {
  // If it's a relative fixture path, prefix with basePath + /api/fixture/
  if (src.startsWith('./listingpage_files/') || src.startsWith('listingpage_files/')) {
    return `${basePath}/api/fixture/${src.replace('./', '')}`
  }
  // If it's a media store path, prefix with basePath
  if (src.startsWith('media/')) {
    return `${basePath}/${src}`
  }
  // Absolute URL — use as-is
  return src
}
