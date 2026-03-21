import 'server-only'

import type {
  MonitoringChangeEvent,
  MonitoringSnapshotRecord,
  MonitoringStateRecord,
} from '@/lib/monitoring/types'
import { formatEmailDateTime, formatEmailCurrency, formatEmailNumber } from './format'

// ─── Brand ──────────────────────────────────────────────────

const NAVY = '#0b273f'
const TEAL = '#00C2B9'
const BG = '#F5F5F5'
const CARD = '#ffffff'
const BORDER = '#dae4ec'
const TEXT_PRIMARY = '#0b273f'
const TEXT_SECONDARY = '#1a3d56'
const TEXT_TERTIARY = '#6a93b3'
const FONT = "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
const MONO = "Menlo, Consolas, 'Courier New', monospace"

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

  // Product display name: prefer label, fallback to snapshot title, then ASIN
  const productName = event.label
    ?? event.currentSnapshot?.title
    ?? event.baselineSnapshot?.title
    ?? event.asin
  const safeProductName = esc(productName.length > 70 ? productName.slice(0, 67) + '...' : productName)
  const safeAsin = esc(event.asin)
  const safeHeadline = esc(event.headline)
  const safeSummary = esc(event.summary)
  const categoryLabel = event.primaryCategory.charAt(0).toUpperCase() + event.primaryCategory.slice(1)
  const trackingUrl = esc(`${appUrl}/tracking`)
  const logoUrl = esc(`${appUrl}/brand/targon-logo-white.png`)

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
<span style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${safeSummary} &mdash; ${safeProductName}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px;">

<!-- ═══ HEADER ═══ -->
<tr>
<td style="background:${NAVY}; padding:18px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="vertical-align:middle;">
  <span style="font-family:${FONT}; font-size:11px; font-weight:700; color:${NAVY}; background:${TEAL}; display:inline-block; width:22px; height:22px; line-height:22px; text-align:center; border-radius:50%; vertical-align:middle;">&bull;</span>
  <span style="font-family:${FONT}; font-size:16px; font-weight:800; color:${TEAL}; letter-spacing:0.14em; vertical-align:middle; padding-left:8px;">ARGUS</span>
</td>
<td align="right" style="vertical-align:middle;">
  <img src="${logoUrl}" width="100" height="26" alt="TARGON" style="display:inline-block; border:0; vertical-align:middle;">
</td>
</tr>
</table>
</td>
</tr>

<!-- ═══ SEVERITY BAR ═══ -->
<tr>
<td style="background:${sev.color}; height:4px; font-size:0; line-height:0;">&nbsp;</td>
</tr>

<!-- ═══ CONTENT ═══ -->
<tr>
<td style="background:${CARD}; padding:24px; border-left:1px solid ${BORDER}; border-right:1px solid ${BORDER};">

  <!-- Badges -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td style="padding-right:6px; padding-bottom:16px;">
    <span style="display:inline-block; padding:3px 8px; background:${sev.bg}; border:1px solid ${sev.border}; font-family:${FONT}; font-size:10px; font-weight:800; color:${sev.color}; letter-spacing:0.06em;">
      ${sev.label}
    </span>
  </td>
  <td style="padding-right:6px; padding-bottom:16px;">
    <span style="display:inline-block; padding:3px 8px; background:${own.bg}; border:1px solid ${own.border}; font-family:${FONT}; font-size:10px; font-weight:700; color:${own.color};">
      ${own.label}
    </span>
  </td>
  <td style="padding-bottom:16px;">
    <span style="display:inline-block; padding:3px 8px; border:1px solid ${BORDER}; font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_SECONDARY};">
      ${esc(categoryLabel)}
    </span>
  </td>
  </tr>
  </table>

  <!-- Headline -->
  <div style="font-family:${FONT}; font-size:18px; font-weight:700; color:${TEXT_PRIMARY}; line-height:1.3; margin:0 0 4px 0;">
    ${safeHeadline}
  </div>

  <!-- Summary -->
  <div style="font-family:${FONT}; font-size:13px; color:${TEXT_SECONDARY}; line-height:1.45; margin:0 0 20px 0;">
    ${safeSummary}
  </div>

  <!-- Product + Timestamps -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:1px solid ${BORDER}; background:#f8fafc; margin:0 0 24px 0;">
  <tr>
  <td style="padding:14px 16px; border-bottom:1px solid ${BORDER};" colspan="2">
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 4px 0;">Product</div>
    <div style="font-family:${FONT}; font-size:14px; font-weight:700; color:${TEXT_PRIMARY}; line-height:1.3;">${safeProductName}</div>
    <div style="font-family:${MONO}; font-size:11px; color:${TEXT_TERTIARY}; margin-top:3px;">${safeAsin}</div>
  </td>
  </tr>
  <tr>
  <td style="padding:12px 16px;${comparedTo ? ` border-right:1px solid ${BORDER};` : ''}" width="50%">
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 3px 0;">Detected</div>
    <div style="font-family:${FONT}; font-size:13px; font-weight:600; color:${TEXT_PRIMARY};">${esc(detectedAt)}</div>
  </td>
  ${comparedTo ? `<td style="padding:12px 16px;" width="50%">
    <div style="font-family:${FONT}; font-size:10px; font-weight:600; color:${TEXT_TERTIARY}; letter-spacing:0.06em; text-transform:uppercase; margin:0 0 3px 0;">Baseline</div>
    <div style="font-family:${FONT}; font-size:13px; font-weight:600; color:${TEXT_PRIMARY};">${esc(comparedTo)}</div>
  </td>` : ''}
  </tr>
  </table>

  <!-- Changes table -->
  ${changesHtml}

  <!-- CTA button -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
  <tr>
  <td align="center" bgcolor="${TEAL}" style="mso-padding-alt:0;">
    <a href="${trackingUrl}" target="_blank" style="display:inline-block; padding:12px 28px; font-family:${FONT}; font-size:13px; font-weight:700; color:${NAVY}; text-decoration:none;">
      View in Argus &rarr;
    </a>
  </td>
  </tr>
  </table>

</td>
</tr>

<!-- ═══ FOOTER ═══ -->
<tr>
<td style="background:#f8fafc; border:1px solid ${BORDER}; border-top:none; padding:16px 24px; text-align:center;">
  <div style="font-family:${FONT}; font-size:11px; color:${TEXT_TERTIARY}; line-height:1.6;">
    Automated alert from Argus &middot; Targon Global
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
    return `<div style="font-family:${FONT}; font-size:13px; color:${TEXT_SECONDARY};">
      Fields changed: ${event.changedFields.map(humanize).join(', ')}
    </div>`
  }

  const thStyle = `padding:10px 14px; font-family:${FONT}; font-size:10px; font-weight:700; color:${TEXT_TERTIARY}; text-transform:uppercase; letter-spacing:0.06em; background:#f8fafc; border-bottom:2px solid ${BORDER};`

  let html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:1px solid ${BORDER};">
<tr>
<td style="${thStyle} border-right:1px solid ${BORDER};">Field</td>
<td style="${thStyle} border-right:1px solid ${BORDER};" align="right">Before</td>
<td style="${thStyle}" align="right">After</td>
</tr>`

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isLast = i === rows.length - 1
    const bb = isLast ? '' : `border-bottom:1px solid #f1f5f9;`
    const bg = i % 2 === 1 ? '#fafbfc' : CARD

    html += `
<tr>
<td style="padding:10px 14px; font-family:${FONT}; font-size:13px; font-weight:600; color:${TEXT_SECONDARY}; ${bb} background:${bg}; border-right:1px solid ${BORDER};">
  ${esc(row.label)}
</td>
<td style="padding:10px 14px; font-family:${MONO}; font-size:12px; color:${TEXT_TERTIARY}; ${bb} background:${bg}; border-right:1px solid ${BORDER};" align="right">
  ${esc(row.before)}
</td>
<td style="padding:10px 14px; font-family:${MONO}; font-size:12px; font-weight:700; color:${TEXT_PRIMARY}; ${bb} background:${bg};" align="right">
  ${esc(row.after)}
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
    const mapping = FIELD_MAP[field]

    if (!mapping) {
      rows.push({
        label: humanize(field),
        before: '\u2014',
        after: 'Changed',
      })
      continue
    }

    const beforeVal = getSnapshotValue(baseline, mapping.key)
    const afterVal = getSnapshotValue(current, mapping.key)

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
