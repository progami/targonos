import 'server-only'

import type {
  MonitoringChangeEvent,
  MonitoringSnapshotRecord,
  MonitoringStateRecord,
} from '@/lib/monitoring/types'
import { formatEmailDateTime, formatEmailCurrency, formatEmailNumber } from './format'

// ─── Brand ──────────────────────────────────────────────────

const NAVY = '#002C51'
const TEAL = '#00C2B9'
const BG = '#f1f5f9'
const CARD = '#ffffff'
const BORDER = '#e2e8f0'
const TEXT_PRIMARY = '#0f172a'
const TEXT_SECONDARY = '#475569'
const TEXT_TERTIARY = '#94a3b8'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace"

// ─── Severity ───────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  high: { label: 'HIGH', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  medium: { label: 'MEDIUM', color: '#ca8a04', bg: '#fefce8', border: '#fef08a' },
  low: { label: 'LOW', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
} as const

const OWNER_CONFIG = {
  OURS: { label: 'Ours', color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
  COMPETITOR: { label: 'Competitor', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  UNKNOWN: { label: 'Tracked', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
} as const

// ─── Field mapping ──────────────────────────────────────────

type FieldMapping = {
  label: string
  key: keyof MonitoringStateRecord
  format: 'currency' | 'number' | 'text'
}

const FIELD_MAP: Record<string, FieldMapping> = {
  title: { label: 'Title', key: 'title', format: 'text' },
  brand: { label: 'Brand', key: 'brand', format: 'text' },
  status: { label: 'Status', key: 'status', format: 'text' },
  seller_sku: { label: 'SKU', key: 'sellerSku', format: 'text' },
  landed_price: { label: 'Landed Price', key: 'landedPrice', format: 'currency' },
  listing_price: { label: 'Listing Price', key: 'listingPrice', format: 'currency' },
  shipping_price: { label: 'Shipping', key: 'shippingPrice', format: 'currency' },
  buy_box_landed_price: { label: 'Buy Box Price', key: 'landedPrice', format: 'currency' },
  root_bsr_rank: { label: 'Root BSR', key: 'rootBsrRank', format: 'number' },
  sub_bsr_rank: { label: 'Sub BSR', key: 'subBsrRank', format: 'number' },
  total_offer_count: { label: 'Offers', key: 'totalOfferCount', format: 'number' },
  image_count: { label: 'Images', key: 'imageCount', format: 'number' },
  bullet_count: { label: 'Bullet Points', key: 'bulletCount', format: 'number' },
  description_length: { label: 'Desc Length', key: 'descriptionLength', format: 'number' },
}

const MAX_TABLE_ROWS = 8

// ─── Logos (SVG → base64 data URI) ──────────────────────────

const ARGUS_EYE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
  `<circle cx="16" cy="16" r="14" fill="none" stroke="${TEAL}" stroke-width="1" opacity="0.3"/>`,
  `<path d="M3 16 C9 7, 23 7, 29 16 C23 25, 9 25, 3 16 Z" fill="${TEAL}" opacity="0.15"/>`,
  `<path d="M3 16 C9 7, 23 7, 29 16 C23 25, 9 25, 3 16 Z" fill="none" stroke="${TEAL}" stroke-width="1.5"/>`,
  `<circle cx="16" cy="16" r="5" fill="${TEAL}"/>`,
  `<circle cx="16" cy="16" r="2" fill="${NAVY}"/>`,
  '<circle cx="18" cy="14.5" r="1" fill="white" opacity="0.8"/>',
  '</svg>',
].join('')

const ARGUS_LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(ARGUS_EYE_SVG).toString('base64')}`

// ─── Public API ─────────────────────────────────────────────

export function buildAlertSubject(event: MonitoringChangeEvent): string {
  const severity = SEVERITY_CONFIG[event.severity].label
  return `[${severity}] ${event.headline}`
}

export function buildAlertEmailHtml(
  event: MonitoringChangeEvent,
  appUrl: string,
): string {
  const sev = SEVERITY_CONFIG[event.severity]
  const own = OWNER_CONFIG[event.owner]
  const detectedAt = formatEmailDateTime(event.timestamp)
  const comparedTo = event.baselineTimestamp ? formatEmailDateTime(event.baselineTimestamp) : null
  const safeHeadline = esc(event.headline)
  const safeSummary = esc(event.summary)
  const safeAsin = esc(event.asin)
  const safeLabel = event.label ? esc(event.label.length > 60 ? event.label.slice(0, 57) + '...' : event.label) : null
  const categoryLabel = event.primaryCategory.charAt(0).toUpperCase() + event.primaryCategory.slice(1)
  const trackingUrl = esc(`${appUrl}/tracking`)

  const changesHtml = buildChangesTable(event)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(buildAlertSubject(event))}</title>
</head>
<body style="margin:0; padding:0; background:${BG}; -webkit-text-size-adjust:none; -ms-text-size-adjust:none;">
<span style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${safeSummary} &mdash; ${safeAsin}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px;">

<!-- ═══ HEADER ═══ -->
<tr>
<td style="background:${NAVY}; border-radius:12px 12px 0 0; padding:16px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="vertical-align:middle;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td style="vertical-align:middle; padding-right:10px;">
    <img src="${ARGUS_LOGO_URI}" width="28" height="28" alt="" style="display:block; border:0;">
  </td>
  <td style="vertical-align:middle; font-family:${FONT}; font-size:17px; font-weight:800; color:${TEAL}; letter-spacing:0.14em;">
    ARGUS
  </td>
  </tr>
  </table>
</td>
<td align="right" style="vertical-align:middle; font-family:${FONT}; font-size:10px; font-weight:600; color:rgba(255,255,255,0.45); letter-spacing:0.18em; text-transform:uppercase;">
  TARGON
</td>
</tr>
</table>
</td>
</tr>

<!-- ═══ CONTENT CARD ═══ -->
<tr>
<td style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>

<!-- Severity accent strip -->
<td width="4" style="background:${sev.color}; font-size:0; line-height:0;">&nbsp;</td>

<!-- Main content -->
<td style="background:${CARD}; padding:24px; border-right:1px solid ${BORDER};">

  <!-- Badges -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td style="padding-right:6px; padding-bottom:14px;">
    <span style="display:inline-block; padding:3px 8px; border-radius:4px; background:${sev.bg}; border:1px solid ${sev.border}; font-family:${FONT}; font-size:10px; font-weight:800; color:${sev.color}; letter-spacing:0.06em;">
      ${sev.label}
    </span>
  </td>
  <td style="padding-right:6px; padding-bottom:14px;">
    <span style="display:inline-block; padding:3px 8px; border-radius:4px; background:${own.bg}; border:1px solid ${own.border}; font-family:${FONT}; font-size:10px; font-weight:700; color:${own.color};">
      ${own.label}
    </span>
  </td>
  <td style="padding-bottom:14px;">
    <span style="display:inline-block; padding:3px 8px; border-radius:4px; border:1px solid ${BORDER}; font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_SECONDARY};">
      ${esc(categoryLabel)}
    </span>
  </td>
  </tr>
  </table>

  <!-- Headline -->
  <div style="font-family:${FONT}; font-size:18px; font-weight:700; color:${TEXT_PRIMARY}; line-height:1.3; margin:0 0 6px 0;">
    ${safeHeadline}
  </div>

  <!-- Summary -->
  <div style="font-family:${FONT}; font-size:13px; color:${TEXT_SECONDARY}; line-height:1.45; margin:0 0 16px 0;">
    ${safeSummary}
  </div>

  <!-- Meta row -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
  <tr>
  <td style="padding-right:24px;">
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 2px 0;">ASIN</div>
    <div style="font-family:${MONO}; font-size:13px; font-weight:700; color:${TEXT_PRIMARY};">${safeAsin}</div>
    ${safeLabel ? `<div style="font-family:${FONT}; font-size:11px; color:${TEXT_SECONDARY}; margin-top:2px;">${safeLabel}</div>` : ''}
  </td>
  <td style="padding-right:24px;">
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 2px 0;">Detected</div>
    <div style="font-family:${FONT}; font-size:13px; font-weight:600; color:${TEXT_PRIMARY};">${esc(detectedAt)}</div>
  </td>
  ${comparedTo ? `<td>
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 2px 0;">Compared to</div>
    <div style="font-family:${FONT}; font-size:13px; font-weight:600; color:${TEXT_PRIMARY};">${esc(comparedTo)}</div>
  </td>` : ''}
  </tr>
  </table>

  <!-- Divider -->
  <div style="border-top:1px solid ${BORDER}; margin:0 0 20px 0;"></div>

  <!-- Changes table -->
  ${changesHtml}

  <!-- CTA button -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
  <tr>
  <td align="center" bgcolor="${TEAL}" style="border-radius:8px;">
    <a href="${trackingUrl}" target="_blank" style="display:inline-block; padding:11px 22px; font-family:${FONT}; font-size:13px; font-weight:700; color:${NAVY}; text-decoration:none; border-radius:8px;">
      View in Argus &rarr;
    </a>
  </td>
  </tr>
  </table>

</td>
</tr>
</table>
</td>
</tr>

<!-- ═══ FOOTER ═══ -->
<tr>
<td style="padding:16px 24px 0 24px; text-align:center;">
  <div style="font-family:${FONT}; font-size:11px; color:${TEXT_TERTIARY}; line-height:1.6;">
    Automated alert from Argus &middot; Targon Global
  </div>
  <div style="font-family:${FONT}; font-size:10px; color:${TEXT_TERTIARY}; margin-top:4px; opacity:0.7;">
    ${esc(event.changedFieldCount.toString())} field${event.changedFieldCount === 1 ? '' : 's'} changed
  </div>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`
}

// ─── Changes table builder ──────────────────────────────────

function buildChangesTable(event: MonitoringChangeEvent): string {
  const rows = extractChangeRows(event)

  if (rows.length === 0) {
    return `<div style="font-family:${FONT}; font-size:13px; color:${TEXT_SECONDARY}; font-style:italic;">
      Fields changed: ${event.changedFields.map(humanize).join(', ')}
    </div>`
  }

  const headerStyle = `padding:8px 12px; font-family:${FONT}; font-size:10px; font-weight:700; color:${TEXT_TERTIARY}; text-transform:uppercase; letter-spacing:0.06em; border-bottom:2px solid ${BORDER}; background:#f8fafc;`
  const remaining = event.changedFields.length - rows.length

  let html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BORDER}; border-radius:8px; border-collapse:separate; overflow:hidden;">
<tr>
<td style="${headerStyle}">Field</td>
<td style="${headerStyle}" align="right">Before</td>
<td style="${headerStyle}" align="right">After</td>
</tr>`

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isLast = i === rows.length - 1 && remaining <= 0
    const borderBottom = isLast ? 'none' : `1px solid #f1f5f9`
    const bg = i % 2 === 1 ? '#fafbfc' : CARD

    html += `
<tr>
<td style="padding:10px 12px; font-family:${FONT}; font-size:12px; font-weight:600; color:${TEXT_SECONDARY}; border-bottom:${borderBottom}; background:${bg};">
  ${esc(row.label)}
</td>
<td style="padding:10px 12px; font-family:${MONO}; font-size:12px; color:${TEXT_TERTIARY}; border-bottom:${borderBottom}; background:${bg}; white-space:nowrap;" align="right">
  ${esc(row.before)}
</td>
<td style="padding:10px 12px; font-family:${MONO}; font-size:12px; font-weight:700; color:${TEXT_PRIMARY}; border-bottom:${borderBottom}; background:${bg}; white-space:nowrap;" align="right">
  ${esc(row.after)}
</td>
</tr>`
  }

  if (remaining > 0) {
    html += `
<tr>
<td colspan="3" style="padding:8px 12px; font-family:${FONT}; font-size:11px; color:${TEXT_TERTIARY}; font-style:italic; background:#fafbfc;">
  + ${remaining} more field${remaining === 1 ? '' : 's'} changed
</td>
</tr>`
  }

  html += '</table>'
  return html
}

interface ChangeRow {
  label: string
  before: string
  after: string
}

function extractChangeRows(event: MonitoringChangeEvent): ChangeRow[] {
  const rows: ChangeRow[] = []
  const baseline = event.baselineSnapshot
  const current = event.currentSnapshot

  if (!baseline && !current) return rows

  const currency = current?.priceCurrency ?? baseline?.priceCurrency ?? null

  for (const field of event.changedFields) {
    if (rows.length >= MAX_TABLE_ROWS) break

    const mapping = FIELD_MAP[field]
    if (!mapping) continue

    const beforeVal = getSnapshotValue(baseline, mapping.key)
    const afterVal = getSnapshotValue(current, mapping.key)

    // Skip if both values are missing
    if (beforeVal === null && afterVal === null) continue

    rows.push({
      label: mapping.label,
      before: formatFieldValue(beforeVal, mapping.format, currency),
      after: formatFieldValue(afterVal, mapping.format, currency),
    })
  }

  return rows
}

function getSnapshotValue(
  snapshot: MonitoringSnapshotRecord | null,
  key: keyof MonitoringStateRecord,
): string | number | null {
  if (!snapshot) return null
  const value = snapshot[key]
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return null
  return value as string | number
}

function formatFieldValue(
  value: string | number | null,
  format: 'currency' | 'number' | 'text',
  currency: string | null,
): string {
  if (value === null) return '\u2014'

  switch (format) {
    case 'currency':
      return typeof value === 'number' ? formatEmailCurrency(value, currency) : String(value)
    case 'number':
      return typeof value === 'number' ? formatEmailNumber(value) : String(value)
    case 'text': {
      const str = String(value)
      return str.length > 50 ? str.slice(0, 47) + '...' : str
    }
  }
}

function humanize(field: string): string {
  return field
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
