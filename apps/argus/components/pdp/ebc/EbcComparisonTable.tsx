'use client'

interface EbcComparisonTableProps {
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export function EbcComparisonTable({ headline, bodyText, images }: EbcComparisonTableProps) {
  return (
    <div className="space-y-3">
      {headline && (
        <h4 className="text-lg font-semibold text-[#0F1111] text-center">{headline}</h4>
      )}
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-5">
        {images.map((img, i) => (
          <div key={i} className="text-center space-y-1">
            <img
              src={img.src}
              alt={img.alt ?? `Product ${i + 1}`}
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
