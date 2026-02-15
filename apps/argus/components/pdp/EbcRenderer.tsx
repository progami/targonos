'use client'

import { cn } from '@/lib/utils'
import { EbcFullImage } from './ebc/EbcFullImage'
import { EbcImageText } from './ebc/EbcImageText'
import { EbcFourImageText } from './ebc/EbcFourImageText'
import { EbcComparisonTable } from './ebc/EbcComparisonTable'

interface EbcModule {
  moduleType: string
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

interface EbcSection {
  sectionType: string
  heading: string | null
  modules: EbcModule[]
}

interface EbcRendererProps {
  sections: EbcSection[]
  diff?: {
    changedSections: number[]
  }
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

function resolveEbcImageSrc(src: string): string {
  if (src.startsWith('./listingpage_files/') || src.startsWith('listingpage_files/')) {
    return `${basePath}/api/fixture/${src.replace('./', '')}`
  }
  if (src.startsWith('media/')) {
    return `${basePath}/${src}`
  }
  return src
}

export function EbcRenderer({ sections, diff }: EbcRendererProps) {
  if (sections.length === 0) return null

  return (
    <div className="space-y-8">
      {sections.map((section, si) => {
        const isChanged = diff?.changedSections.includes(si)
        return (
          <div
            key={si}
            className={cn(
              'space-y-4',
              isChanged && 'ring-2 ring-yellow-400 ring-offset-2 rounded-lg p-2',
            )}
          >
            {section.heading && (
              <h3 className="text-xl font-bold text-[#0F1111]">
                {section.heading}
              </h3>
            )}
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {section.sectionType === 'BRAND_STORY' ? 'Brand Story' : 'A+ Content'}
            </div>
            <div className="space-y-6">
              {section.modules.map((mod, mi) => {
                const resolvedImages = mod.images.map((img) => ({
                  ...img,
                  src: resolveEbcImageSrc(img.src),
                }))
                return (
                  <div key={mi}>
                    <ModuleRenderer
                      moduleType={mod.moduleType}
                      headline={mod.headline}
                      bodyText={mod.bodyText}
                      images={resolvedImages}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModuleRenderer({
  moduleType,
  headline,
  bodyText,
  images,
}: EbcModule) {
  switch (moduleType) {
    case 'IMAGE_TEXT':
    case 'IMAGE_TEXT_OVERLAY':
      return <EbcImageText headline={headline} bodyText={bodyText} images={images} />
    case 'FOUR_IMAGE_TEXT':
    case 'BRAND_STORY_CARD':
      return <EbcFourImageText headline={headline} bodyText={bodyText} images={images} />
    case 'COMPARISON_TABLE':
      return <EbcComparisonTable headline={headline} bodyText={bodyText} images={images} />
    case 'FULL_IMAGE':
    case 'BRAND_STORY_HERO':
    case 'UNKNOWN':
    default:
      return <EbcFullImage headline={headline} bodyText={bodyText} images={images} />
  }
}
