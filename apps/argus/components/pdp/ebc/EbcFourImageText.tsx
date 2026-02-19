'use client'

interface EbcFourImageTextProps {
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export function EbcFourImageText({ headline, bodyText, images }: EbcFourImageTextProps) {
  return (
    <div className="space-y-3">
      {headline && (
        <h4 className="text-lg font-semibold text-[#0F1111] text-center">{headline}</h4>
      )}
      <div className="grid grid-cols-4 gap-3">
        {images.map((img, i) => (
          <div key={i} className="text-center space-y-1">
            <img
              src={img.src}
              alt={img.alt ?? `Image ${i + 1}`}
              className="w-full rounded"
            />
            {img.alt && (
              <p className="text-xs text-[#333]">{img.alt}</p>
            )}
          </div>
        ))}
      </div>
      {bodyText && (
        <p className="text-sm text-[#333] leading-relaxed whitespace-pre-line">{bodyText}</p>
      )}
    </div>
  )
}
