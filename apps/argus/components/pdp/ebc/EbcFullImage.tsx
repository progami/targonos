'use client'

interface EbcFullImageProps {
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export function EbcFullImage({ headline, bodyText, images }: EbcFullImageProps) {
  return (
    <div className="space-y-3">
      {images[0] && (
        <img
          src={images[0].src}
          alt={images[0].alt ?? 'Product image'}
          className="w-full rounded-lg"
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
