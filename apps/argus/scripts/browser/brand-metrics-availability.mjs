const MS_PER_DAY = 24 * 60 * 60 * 1000

export const BRAND_METRICS_SOURCE_LIMIT_NOTE =
  "Brand Metrics uses Amazon's latest published week, not necessarily the latest completed calendar week. This source typically lags the calendar by about 2 weeks."

function parseIsoDate(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  if (match === null) {
    throw new Error(`Invalid ISO date: ${dateText}`)
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const dayOfMonth = Number(match[3])
  return new Date(Date.UTC(year, monthIndex, dayOfMonth))
}

function toIsoDate(dateValue) {
  return dateValue.toISOString().slice(0, 10)
}

export function getLatestCompletedWeekEndDate(referenceDate) {
  const reference = parseIsoDate(referenceDate)
  const dayOfWeek = reference.getUTCDay()
  const daysSinceSaturday = (dayOfWeek + 1) % 7
  const latestCompletedWeekEnd = new Date(reference.getTime() - (daysSinceSaturday * MS_PER_DAY))
  return toIsoDate(latestCompletedWeekEnd)
}

export function createBrandMetricsAvailabilityLagDetail({ exportedEndDate, referenceDate }) {
  const latestCompletedWeekEndDate = getLatestCompletedWeekEndDate(referenceDate)
  const exportedEnd = parseIsoDate(exportedEndDate)
  const latestCompletedWeekEnd = parseIsoDate(latestCompletedWeekEndDate)
  const lagDays = Math.round((latestCompletedWeekEnd.getTime() - exportedEnd.getTime()) / MS_PER_DAY)

  if (lagDays < 0) {
    throw new Error(
      `Exported Brand Metrics week ${exportedEndDate} is after latest completed week ${latestCompletedWeekEndDate}`,
    )
  }

  if (lagDays === 0) {
    return `Brand Metrics availability: latest completed week ended ${latestCompletedWeekEndDate}; exported week ended ${exportedEndDate} (latest completed week available).`
  }

  if (lagDays % 7 !== 0) {
    throw new Error(
      `Brand Metrics export ${exportedEndDate} does not end on a completed week boundary relative to ${latestCompletedWeekEndDate}`,
    )
  }

  const completedWeeksBehind = lagDays / 7
  const suffix = completedWeeksBehind === 1 ? '' : 's'
  return `Brand Metrics availability: latest completed week ended ${latestCompletedWeekEndDate}; exported week ended ${exportedEndDate} (${completedWeeksBehind} completed week${suffix} behind).`
}

function main() {
  const command = process.argv[2]
  if (command === 'source-limit-note') {
    process.stdout.write(BRAND_METRICS_SOURCE_LIMIT_NOTE)
    return
  }

  if (command === 'lag-detail') {
    const exportedEndDate = process.argv[3]
    const referenceDate = process.argv[4]
    process.stdout.write(
      createBrandMetricsAvailabilityLagDetail({
        exportedEndDate,
        referenceDate,
      }),
    )
    return
  }

  throw new Error(`Unsupported command: ${command}`)
}

if (import.meta.main) {
  main()
}
