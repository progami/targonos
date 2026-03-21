import { NextResponse } from 'next/server'
import type { MonitoringChangeEvent } from '@/lib/monitoring/types'
import { buildAlertEmailHtml, buildAlertSubject } from '@/lib/email/template'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://os.targonglobal.com/argus'

/**
 * GET /api/alerts/preview
 *
 * Query params:
 *   severity – critical | high | medium | low (default: critical)
 *   owner    – OURS | COMPETITOR (default: OURS)
 *   category – price | rank | content | status | images | offers | catalog (default: price)
 *
 * Returns the rendered HTML email for previewing in a browser.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const severity = (searchParams.get('severity') || 'critical') as MonitoringChangeEvent['severity']
  const owner = (searchParams.get('owner') || 'OURS') as MonitoringChangeEvent['owner']
  const category = (searchParams.get('category') || 'price') as MonitoringChangeEvent['primaryCategory']

  // Try loading real monitoring data first
  let event: MonitoringChangeEvent | null = null
  try {
    const { getMonitoringChanges } = await import('@/lib/monitoring/reader')
    const changes = await getMonitoringChanges({ severity, window: '30d' })
    if (changes.length > 0) {
      event = changes[0]
    }
  } catch {
    // Fall through to sample data
  }

  if (!event) {
    event = buildSampleEvent(severity, owner, category)
  }

  const html = buildAlertEmailHtml(event, APP_URL)
  const subject = buildAlertSubject(event)

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Email-Subject': subject,
    },
  })
}

function buildSampleEvent(
  severity: MonitoringChangeEvent['severity'],
  owner: MonitoringChangeEvent['owner'],
  category: MonitoringChangeEvent['primaryCategory'],
): MonitoringChangeEvent {
  const now = new Date()
  const baseline = new Date(now.getTime() - 6 * 60 * 60 * 1000) // 6 hours ago

  const baseSnapshot = {
    asin: 'B001D8XVVU',
    owner,
    title: 'Premium Dust Sheets - Heavy Duty Cotton Twill 12ft x 9ft',
    brand: 'Targon',
    size: '12ft x 9ft',
    status: 'Active',
    sellerSku: 'TG-DS-1209-WHT',
    imageCount: 7,
    imageUrls: [],
    landedPrice: 24.99,
    listingPrice: 24.99,
    shippingPrice: 0,
    priceCurrency: 'USD',
    rootBsrRank: 1450,
    rootBsrCategoryId: '228013',
    subBsrRank: 42,
    subBsrCategoryId: '553608',
    totalOfferCount: 5,
    bulletCount: 5,
    descriptionLength: 820,
    lastUpdatedDate: baseline.toISOString(),
  }

  const changedFields = getFieldsForCategory(category)

  return {
    id: 'sample-alert-preview',
    asin: 'B001D8XVVU',
    label: 'Premium Dust Sheets - Heavy Duty Cotton Twill 12ft x 9ft',
    owner,
    timestamp: now.toISOString(),
    baselineTimestamp: baseline.toISOString(),
    severity,
    categories: [category],
    primaryCategory: category,
    changedFieldCount: changedFields.length,
    changedFields,
    headline: buildSampleHeadline(owner, category),
    summary: buildSampleSummary(category),
    baselineSnapshot: { ...baseSnapshot, capturedAt: baseline.toISOString() },
    currentSnapshot: {
      ...baseSnapshot,
      ...getCurrentValues(category),
      capturedAt: now.toISOString(),
    },
  }
}

function getFieldsForCategory(category: string): string[] {
  switch (category) {
    case 'price':
      return ['landed_price', 'listing_price']
    case 'rank':
      return ['root_bsr_rank', 'sub_bsr_rank']
    case 'content':
      return ['title', 'bullet_count', 'description_length']
    case 'status':
      return ['status']
    case 'images':
      return ['image_count']
    case 'offers':
      return ['total_offer_count']
    default:
      return ['title']
  }
}

function getCurrentValues(category: string): Record<string, unknown> {
  switch (category) {
    case 'price':
      return { landedPrice: 26.99, listingPrice: 26.99 }
    case 'rank':
      return { rootBsrRank: 980, subBsrRank: 28 }
    case 'content':
      return { title: 'Premium Cotton Dust Sheets - Extra Heavy Duty 12ft x 9ft (Pack of 2)', bulletCount: 6, descriptionLength: 1050 }
    case 'status':
      return { status: 'Inactive' }
    case 'images':
      return { imageCount: 9 }
    case 'offers':
      return { totalOfferCount: 8 }
    default:
      return {}
  }
}

function buildSampleHeadline(owner: MonitoringChangeEvent['owner'], category: string): string {
  const ownerLabel = owner === 'OURS' ? 'Our' : owner === 'COMPETITOR' ? 'Competitor' : 'Tracked'
  switch (category) {
    case 'price':
      return `${ownerLabel} B001D8XVVU pricing changed`
    case 'rank':
      return `${ownerLabel} B001D8XVVU rank improved`
    case 'content':
      return `${ownerLabel} B001D8XVVU content changed`
    case 'status':
      return `${ownerLabel} B001D8XVVU availability changed`
    case 'images':
      return `${ownerLabel} B001D8XVVU gallery changed`
    case 'offers':
      return `${ownerLabel} B001D8XVVU offer mix changed`
    default:
      return `${ownerLabel} B001D8XVVU catalog data changed`
  }
}

function buildSampleSummary(category: string): string {
  switch (category) {
    case 'price':
      return 'Landed price: $24.99 -> $26.99'
    case 'rank':
      return 'Root BSR: 1,450 -> 980'
    case 'content':
      return 'Fields changed: title, bullet_count, description_length'
    case 'status':
      return 'Status: Active -> Inactive'
    case 'images':
      return 'Image count: 7 -> 9'
    case 'offers':
      return 'Offer count: 5 -> 8'
    default:
      return 'Catalog fields changed: title'
  }
}
