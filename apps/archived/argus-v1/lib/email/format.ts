import 'server-only'

/**
 * Format an ISO timestamp to a clean human-readable string.
 * Example: "Mar 20th 2026, 14:00 CT"
 */
export function formatEmailDateTime(iso: string | null): string {
  if (!iso) return '\u2014'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '\u2014'

  const month = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'America/Chicago',
  }).format(date)

  const day = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: 'America/Chicago',
  }).format(date)

  const dayNum = Number(day)

  const year = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'America/Chicago',
  }).format(date)

  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  }).format(date)

  return `${month} ${dayNum}${ordinalSuffix(dayNum)} ${year}, ${time} CT`
}

/**
 * Format an ISO timestamp to just the date portion.
 * Example: "Mar 20th 2026"
 */
export function formatEmailDate(iso: string | null): string {
  if (!iso) return '\u2014'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '\u2014'

  const month = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'America/Chicago',
  }).format(date)

  const day = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: 'America/Chicago',
  }).format(date)

  const dayNum = Number(day)

  const year = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'America/Chicago',
  }).format(date)

  return `${month} ${dayNum}${ordinalSuffix(dayNum)} ${year}`
}

export function formatEmailCurrency(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (value === null || value === undefined) return '\u2014'
  if (!currency) return value.toFixed(2)

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

export function formatEmailNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '\u2014'
  return value.toLocaleString('en-US')
}

function ordinalSuffix(value: number): string {
  const remainder100 = value % 100
  if (remainder100 >= 11 && remainder100 <= 13) return 'th'

  switch (value % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}
