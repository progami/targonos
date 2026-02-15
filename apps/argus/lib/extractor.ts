import * as cheerio from 'cheerio'

// ─── Types ───────────────────────────────────────────────────────

export interface ExtractedBullets {
  bullet1: string | null
  bullet2: string | null
  bullet3: string | null
  bullet4: string | null
  bullet5: string | null
}

export interface ExtractedImage {
  position: number
  src: string
  hiRes: string | null
  isVideo: boolean
}

export interface ExtractedGallery {
  images: ExtractedImage[]
}

export interface ExtractedEbcModule {
  moduleType: string
  headline: string | null
  bodyText: string | null
  images: { src: string; alt: string | null }[]
}

export interface ExtractedEbcSection {
  sectionType: string
  heading: string | null
  modules: ExtractedEbcModule[]
}

export interface ExtractedSnapshot {
  title: string | null
  bullets: ExtractedBullets
  gallery: ExtractedGallery
  ebc: ExtractedEbcSection[]
}

// ─── Module type detection ───────────────────────────────────────

function detectModuleType(classNames: string): string {
  if (classNames.includes('brand-story-hero')) return 'BRAND_STORY_HERO'
  if (classNames.includes('brand-story-card')) return 'BRAND_STORY_CARD'
  if (classNames.includes('fullbackground-image')) return 'FULL_IMAGE'
  if (classNames.includes('four-image-text')) return 'FOUR_IMAGE_TEXT'
  if (classNames.includes('comparison-table')) return 'COMPARISON_TABLE'
  if (classNames.includes('standard-image-text')) return 'IMAGE_TEXT'
  if (classNames.includes('image-text-overlay')) return 'IMAGE_TEXT_OVERLAY'
  return 'UNKNOWN'
}

// ─── Extractors ──────────────────────────────────────────────────

export function extractBullets($: cheerio.CheerioAPI): ExtractedBullets {
  const items: string[] = []
  $('#feature-bullets .a-list-item').each((_i, el) => {
    const text = $(el).text().trim()
    if (text) items.push(text)
  })

  return {
    bullet1: items[0] ?? null,
    bullet2: items[1] ?? null,
    bullet3: items[2] ?? null,
    bullet4: items[3] ?? null,
    bullet5: items[4] ?? null,
  }
}

export function extractGallery($: cheerio.CheerioAPI): ExtractedGallery {
  const images: ExtractedImage[] = []

  // Main landing image
  const landing = $('#landingImage')
  if (landing.length > 0) {
    const src = landing.attr('src')
    if (src) {
      images.push({
        position: 0,
        src,
        hiRes: landing.attr('data-old-hires') ?? null,
        isVideo: false,
      })
    }
  }

  // Thumbnail images (position 1+)
  $('#altImages li img').each((_i, el) => {
    const img = $(el)
    const src = img.attr('src')
    if (!src) return
    // Skip the main image duplicate (already captured as position 0)
    if (images.length === 1 && images[0].src === src) return

    const parentLi = img.closest('li')
    const isVideo = parentLi.hasClass('videoThumbnail') ||
      parentLi.find('.videoThumbnail').length > 0 ||
      src.includes('PKplay-button')

    images.push({
      position: images.length,
      src,
      hiRes: img.attr('data-old-hires') ?? null,
      isVideo,
    })
  })

  return { images }
}

export function extractEbc($: cheerio.CheerioAPI): ExtractedEbcSection[] {
  const sections: ExtractedEbcSection[] = []

  // Brand Story
  const brandStory = $('#aplusBrandStory_feature_div')
  if (brandStory.length > 0) {
    const modules = extractModulesFromContainer($, brandStory)
    if (modules.length > 0) {
      sections.push({
        sectionType: 'BRAND_STORY',
        heading: null,
        modules,
      })
    }
  }

  // Product Description (A+ Content)
  const aplus = $('#aplus_feature_div')
  if (aplus.length > 0) {
    const modules = extractModulesFromContainer($, aplus)
    if (modules.length > 0) {
      sections.push({
        sectionType: 'PRODUCT_DESCRIPTION',
        heading: null,
        modules,
      })
    }
  }

  return sections
}

function extractModulesFromContainer(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container: cheerio.Cheerio<any>,
): ExtractedEbcModule[] {
  const modules: ExtractedEbcModule[] = []

  container.find('.aplus-module').each((_i, el) => {
    const mod = $(el)
    const classNames = mod.attr('class') ?? ''
    const moduleType = detectModuleType(classNames)

    // Extract images
    const images: { src: string; alt: string | null }[] = []
    mod.find('img').each((_j, imgEl) => {
      const img = $(imgEl)
      const src = img.attr('src')
      if (!src) return
      images.push({
        src,
        alt: img.attr('alt')?.trim() ?? null,
      })
    })

    // Extract text
    const headings = mod.find('h3, h4, .aplus-module-heading').map((_j, e) => $(e).text().trim()).get().filter(Boolean)
    const paragraphs = mod.find('p').map((_j, e) => $(e).text().trim()).get().filter(Boolean)

    modules.push({
      moduleType,
      headline: headings[0] ?? null,
      bodyText: paragraphs.length > 0 ? paragraphs.join('\n') : null,
      images,
    })
  })

  return modules
}

export function extractTitle($: cheerio.CheerioAPI): string | null {
  const raw = $('#productTitle').text()
  const normalized = raw.replace(/\s+/gu, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

// ─── Main entry point ────────────────────────────────────────────

export function extractAll(html: string): ExtractedSnapshot {
  const $ = cheerio.load(html)
  return {
    title: extractTitle($),
    bullets: extractBullets($),
    gallery: extractGallery($),
    ebc: extractEbc($),
  }
}
