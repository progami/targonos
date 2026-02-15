'use client'

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
          <img
            src={images[0].src}
            alt={images[0].alt ?? 'Product image'}
            className="w-full rounded-lg"
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
