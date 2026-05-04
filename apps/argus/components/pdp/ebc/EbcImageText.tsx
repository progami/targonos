'use client'

import Image from 'next/image'

interface EbcImageTextProps {
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export function EbcImageText({ headline, bodyText, images }: EbcImageTextProps) {
  return (
    <div className="flex gap-6 items-start">
      {images[0] && (
        <div className="shrink-0 w-1/2">
          <Image
            src={images[0].src}
            alt={images[0].alt ?? 'Product image'}
            width={1200}
            height={1200}
            unoptimized
            className="h-auto w-full rounded-lg"
          />
        </div>
      )}
      <div className="flex-1 space-y-2">
        {headline && (
          <h4 className="text-lg font-semibold text-[#0F1111]">{headline}</h4>
        )}
        {bodyText && (
          <p className="text-sm text-[#333] leading-relaxed whitespace-pre-line">{bodyText}</p>
        )}
      </div>
    </div>
  )
}
