'use client'

import Image from 'next/image'

interface EbcFullImageProps {
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export function EbcFullImage({ headline, bodyText, images }: EbcFullImageProps) {
  return (
    <div className="space-y-3">
      {images[0] && (
        <Image
          src={images[0].src}
          alt={images[0].alt ?? 'Product image'}
          width={1200}
          height={1200}
          unoptimized
          className="h-auto w-full rounded-lg"
        />
      )}
      {headline && (
        <h4 className="text-lg font-semibold text-[#0F1111]">{headline}</h4>
      )}
      {bodyText && (
        <p className="text-sm text-[#333] leading-relaxed whitespace-pre-line">{bodyText}</p>
      )}
    </div>
  )
}
