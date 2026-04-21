import type { WeekLabel, WprWeekBundle } from './types'

type WeekStartDateRow = {
  week_label: WeekLabel
  start_date: string
}

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
})

const DAY_MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error(`Invalid ISO date ${value}`)
  }

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)

  return new Date(Date.UTC(year, month - 1, day))
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function formatDateSpan(startDate: string, endDate: string): string {
  return `${DAY_MONTH_FORMATTER.format(parseIsoDate(startDate))} - ${DAY_MONTH_YEAR_FORMATTER.format(parseIsoDate(endDate))}`
}

export function buildWeekStartDateLookup<T extends WeekStartDateRow>(
  rows: readonly T[],
): Record<WeekLabel, string> {
  const weekStartDates: Record<WeekLabel, string> = {}

  for (const row of rows) {
    weekStartDates[row.week_label] = row.start_date
  }

  return weekStartDates
}

export function buildBundleWeekStartDateLookup(bundle: Pick<WprWeekBundle, 'weeks' | 'clusters' | 'scp' | 'businessReports'>): Record<WeekLabel, string> {
  const discoveredWeekStartDates: Partial<Record<WeekLabel, string>> = {}

  const registerRows = (rows: readonly WeekStartDateRow[]) => {
    for (const row of rows) {
      discoveredWeekStartDates[row.week_label] = row.start_date
    }
  }

  for (const cluster of bundle.clusters) {
    registerRows(cluster.weekly)
  }
  registerRows(bundle.scp.weekly)
  registerRows(bundle.businessReports.weekly)

  const weekStartDates: Record<WeekLabel, string> = {}
  for (const week of bundle.weeks) {
    const startDate = discoveredWeekStartDates[week]
    if (startDate === undefined) {
      throw new Error(`Missing week start date for ${week}`)
    }

    weekStartDates[week] = startDate
  }

  return weekStartDates
}

export function formatWeekDateRange(startDate: string): string {
  const endDate = addUtcDays(parseIsoDate(startDate), 6)
  const endDateIso = endDate.toISOString().slice(0, 10)
  return formatDateSpan(startDate, endDateIso)
}

export function formatWeekLabelWithDateRange(weekLabel: WeekLabel, startDate: string): string {
  return `${weekLabel} · ${formatWeekDateRange(startDate)}`
}

export function formatWeekLabelFromLookup(
  weekLabel: WeekLabel,
  weekStartDates: Readonly<Record<WeekLabel, string>>,
): string {
  const startDate = weekStartDates[weekLabel]
  if (startDate === undefined) {
    throw new Error(`Missing week start date for ${weekLabel}`)
  }

  return formatWeekLabelWithDateRange(weekLabel, startDate)
}

export function formatWeekWindowLabel(
  weeks: readonly WeekLabel[],
  weekStartDates: Readonly<Record<WeekLabel, string>>,
): string {
  if (weeks.length === 0) {
    return ''
  }

  const firstWeek = weeks[0]
  if (firstWeek === undefined) {
    throw new Error('Missing first week label')
  }

  if (weeks.length === 1) {
    return formatWeekLabelFromLookup(firstWeek, weekStartDates)
  }

  const lastWeek = weeks[weeks.length - 1]
  if (lastWeek === undefined) {
    throw new Error('Missing last week label')
  }

  const firstStartDate = weekStartDates[firstWeek]
  if (firstStartDate === undefined) {
    throw new Error(`Missing week start date for ${firstWeek}`)
  }

  const lastStartDate = weekStartDates[lastWeek]
  if (lastStartDate === undefined) {
    throw new Error(`Missing week start date for ${lastWeek}`)
  }

  const lastEndDateIso = addUtcDays(parseIsoDate(lastStartDate), 6).toISOString().slice(0, 10)
  return `${firstWeek} - ${lastWeek} · ${formatDateSpan(firstStartDate, lastEndDateIso)}`
}
