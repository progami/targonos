#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  throw new Error(message)
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function csvEscape(value) {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function parseWeekContext(filePath) {
  const match = path.basename(filePath).match(/^(W\d+)_(\d{4}-\d{2}-\d{2})_CategoryInsights\.txt$/)
  if (!match) fail(`Unsupported legacy Category Insights filename: ${filePath}`)

  const weekCode = match[1]
  const weekEnd = match[2]
  const [year, month, day] = weekEnd.split('-').map(Number)
  const endDate = new Date(Date.UTC(year, month - 1, day))
  endDate.setUTCDate(endDate.getUTCDate() - 6)
  const weekStart = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`

  return { weekCode, weekStart, weekEnd }
}

function parseMetadata(lines) {
  const metadata = {
    source: '',
    captured_date: '',
    captured_at_utc: '',
    search_term: '',
    marketplace: '',
    marketplace_id: '',
    category: '',
    product_type: '',
    product_type_id: '',
    browse_node: '',
    browse_node_id: '',
    resolved_path: '',
  }

  const title = lines[0] ?? ''
  const titleMatch = title.match(/^Category Insights — (.+)$/)
  if (titleMatch) metadata.browse_node = clean(titleMatch[1])

  for (const line of lines.slice(1)) {
    if (!line.includes(':')) continue
    const separator = line.indexOf(':')
    const key = clean(line.slice(0, separator))
    const value = clean(line.slice(separator + 1))

    if (key === 'Captured') metadata.captured_date = value
    if (key === 'Captured At (UTC)') metadata.captured_at_utc = value
    if (key === 'Source') metadata.source = value
    if (key === 'Search Term') metadata.search_term = value
    if (key === 'Category') metadata.category = value
    if (key === 'Resolved Path') metadata.resolved_path = value

    if (key === 'Marketplace') {
      const match = value.match(/^(.*) \(([^)]+)\)$/)
      metadata.marketplace = clean(match ? match[1] : value)
      metadata.marketplace_id = clean(match ? match[2] : '')
    }

    if (key === 'Product Type') {
      const match = value.match(/^(.*) \(([^)]+)\)$/)
      metadata.product_type = clean(match ? match[1] : value)
      metadata.product_type_id = clean(match ? match[2] : '')
    }

    if (key === 'Browse Node') {
      const match = value.match(/^(.*) \(([^)]+)\)$/)
      metadata.browse_node = clean(match ? match[1] : value)
      metadata.browse_node_id = clean(match ? match[2] : '')
    }
  }

  return metadata
}

function makeBaseRow(weekContext, metadata) {
  return {
    week_code: weekContext.weekCode,
    week_start: weekContext.weekStart,
    week_end: weekContext.weekEnd,
    captured_date: metadata.captured_date,
    captured_at_utc: metadata.captured_at_utc,
    source: metadata.source,
    marketplace: metadata.marketplace,
    marketplace_id: metadata.marketplace_id,
    search_term: metadata.search_term,
    category: metadata.category,
    product_type: metadata.product_type,
    product_type_id: metadata.product_type_id,
    browse_node: metadata.browse_node,
    browse_node_id: metadata.browse_node_id,
    resolved_path: metadata.resolved_path,
  }
}

function pushRow(rows, baseRow, section, metric, period, position, label, value, averageValue, range, displayValue) {
  rows.push({
    ...baseRow,
    section,
    metric,
    period,
    position,
    label,
    value,
    average_value: averageValue,
    range,
    display_value: displayValue,
  })
}

function metricKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function parseCompactNumber(value) {
  const text = clean(value)
  if (!text) return ''
  if (text.startsWith('>')) return text

  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KM]?)$/i)
  if (!match) return text.replace(/,/g, '')

  const base = Number(match[1])
  const suffix = match[2].toUpperCase()
  if (suffix === 'K') return String(Math.round(base * 1000))
  if (suffix === 'M') return String(Math.round(base * 1000000))
  return String(base)
}

function parsePercentNumber(value) {
  return clean(value).replace(/[‰%]/g, '')
}

function parseCategoryPath(categoryPath) {
  const parts = clean(categoryPath).split('>').map((part) => clean(part)).filter(Boolean)
  return {
    category: parts[0] ?? '',
    product_type: parts[1] ?? '',
    browse_node: parts[2] ?? '',
    resolved_path: parts.join(' > '),
  }
}

function parseLegacyReport(text, filePath) {
  const lines = text.split(/\r?\n/)
  const dividerIndex = lines.findIndex((line) => line.startsWith('================================================================================'))
  if (dividerIndex < 0) {
    return parsePageTextReport(text, filePath)
  }

  const metadata = parseMetadata(lines.slice(0, dividerIndex))
  const weekContext = parseWeekContext(filePath)
  const baseRow = makeBaseRow(weekContext, metadata)
  const rows = []

  let currentSection = ''
  let currentMetric = ''
  let position = 0

  for (let index = dividerIndex; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (line.startsWith('================================================================================')) continue

    if (/^[A-Z0-9 &()]+$/.test(line.trim()) && !line.startsWith('  ')) {
      currentSection = line.trim()
      currentMetric = ''
      position = 0
      continue
    }

    if (!line.startsWith('  ')) {
      currentMetric = clean(line)
      position = 0
      continue
    }

    const valueLine = line.trim()
    position += 1

    if (currentSection === 'SUMMARY') {
      const ratioMatch = valueLine.match(/^([^:]+): ([^|]+)\| avg (.+)$/)
      if (ratioMatch) {
        pushRow(
          rows,
          baseRow,
          'summary',
          metricKey(currentMetric),
          clean(ratioMatch[1]),
          '',
          '',
          clean(ratioMatch[2]),
          clean(ratioMatch[3]),
          '',
          '',
        )
        continue
      }

      const summaryMatch = valueLine.match(/^(.+?) \(([^)]+)\): (.+)$/)
      if (summaryMatch) {
        const summaryMetricKey = metricKey(summaryMatch[1])
        const rawValue = clean(summaryMatch[3])
        const range = rawValue.startsWith('>') ? rawValue : ''
        const numericValue = range ? '' : rawValue
        pushRow(rows, baseRow, 'summary', summaryMetricKey, clean(summaryMatch[2]), '', '', numericValue, '', range, rawValue)
        continue
      }
    }

    if (currentSection === 'KEYWORDS & RETURNS') {
      const [left = '', right = ''] = valueLine.split('\t')
      const rowMetricKey = metricKey(currentMetric)
      if (currentMetric === 'Most Popular Keywords (12m)') {
        pushRow(rows, baseRow, 'keywords', rowMetricKey, '12m', position, clean(right), clean(left).replace(/,/g, ''), '', '', '')
        continue
      }
      if (currentMetric === 'Return Reasons (12m)') {
        pushRow(rows, baseRow, 'returns', rowMetricKey, '12m', position, clean(right), clean(left).replace(/%$/, ''), '', '', clean(left))
        continue
      }
      if (currentMetric === 'Star Ratings (12m)') {
        pushRow(rows, baseRow, 'ratings', rowMetricKey, '12m', position, clean(left), clean(right).replace(/,/g, ''), '', '', '')
        continue
      }
    }

    if (currentSection === 'CHARTS (12M)') {
      const match = valueLine.match(/^([^:]+): (.+)$/)
      if (!match) continue
      pushRow(rows, baseRow, 'chart', metricKey(currentMetric), '12m_monthly', position, clean(match[1]), clean(match[2]).replace(/,/g, ''), '', '', '')
      continue
    }

    if (currentSection === 'FEATURES') {
      const [label = '', value = ''] = valueLine.split('\t')
      pushRow(rows, baseRow, 'features', metricKey(currentMetric), '12m', position, clean(label), clean(value).replace(/%$/, ''), '', '', clean(value))
    }
  }

  return rows
}

function parsePageTextReport(text, filePath) {
  const lines = text.split(/\r?\n/)

  if (lines.some((line) => clean(line) === 'Voice of the Customer')) {
    fail(`Unsupported legacy Category Insights capture saved from Voice of the Customer: ${filePath}`)
  }

  const weekContext = parseWeekContext(filePath)
  const categoryLine = lines.find((line) => line.startsWith('Category:'))
  const storeLine = lines.find((line) => line.startsWith('Store:'))
  const capturedLine = lines.find((line) => line.startsWith('Captured:'))
  const titleLine = lines.find((line) => line.startsWith('Category Insights —'))

  if ([categoryLine, storeLine, capturedLine, titleLine].some((value) => value == null)) {
    fail(`Unsupported page-text Category Insights capture: ${filePath}`)
  }

  const pathInfo = parseCategoryPath(categoryLine.replace(/^Category:\s*/, ''))
  const metadata = {
    source: 'Seller Central page-text capture',
    captured_date: clean(capturedLine.replace(/^Captured:\s*/, '')),
    captured_at_utc: '',
    search_term: pathInfo.browse_node,
    marketplace: clean(storeLine.replace(/^Store:\s*/, '')),
    marketplace_id: 'ATVPDKIKX0DER',
    category: pathInfo.category,
    product_type: pathInfo.product_type,
    product_type_id: '',
    browse_node: clean(titleLine.replace(/^Category Insights —\s*/, '')),
    browse_node_id: '',
    resolved_path: pathInfo.resolved_path,
  }

  const performanceIndex = lines.findIndex((line) => line.includes(': Performance'))
  if (performanceIndex >= 0) {
    const performanceLabel = clean(lines[performanceIndex].replace(/: Performance$/, ''))
    if (performanceLabel && performanceLabel !== metadata.browse_node) {
      fail(`Legacy Category Insights browse node mismatch in ${filePath}: expected "${metadata.browse_node}", found "${performanceLabel}"`)
    }
  }

  const baseRow = makeBaseRow(weekContext, metadata)
  const rows = []

  const keywordsIndex = lines.findIndex((line) => clean(line) === 'Most Popular Keywords')
  if (keywordsIndex >= 0) {
    let position = 0
    for (let index = keywordsIndex + 1; index < lines.length; index += 1) {
      const line = lines[index]
      if (!/\t/.test(line)) {
        if (position > 0) break
        continue
      }
      const [value, label] = line.split('\t')
      position += 1
      pushRow(rows, baseRow, 'keywords', 'most_popular_keywords', '12m', position, clean(label), clean(value).replace(/,/g, ''), '', '', '')
    }
  }

  const ratioIndex = lines.findIndex((line) => clean(line) === 'Search to purchase ratio')
  if (ratioIndex >= 0) {
    pushRow(
      rows,
      baseRow,
      'summary',
      'search_to_purchase_ratio',
      '12m',
      '',
      '',
      parsePercentNumber(lines[ratioIndex + 1]),
      parsePercentNumber(lines[ratioIndex + 2]),
      '',
      clean(lines[ratioIndex + 1]),
    )
  }

  const returnRatioIndex = lines.findIndex((line) => clean(line) === 'Return Ratio')
  if (returnRatioIndex >= 0) {
    pushRow(
      rows,
      baseRow,
      'summary',
      'return_ratio',
      '12m',
      '',
      '',
      parsePercentNumber(lines[returnRatioIndex + 1]),
      parsePercentNumber(lines[returnRatioIndex + 2]),
      '',
      clean(lines[returnRatioIndex + 1]),
    )
  }

  const reasonsIndex = lines.findIndex((line) => clean(line) === 'Reasons for returns')
  if (reasonsIndex >= 0) {
    let position = 0
    for (let index = reasonsIndex + 1; index + 1 < lines.length; index += 2) {
      const percentLine = clean(lines[index])
      const labelLine = clean(lines[index + 1])
      if (!percentLine.endsWith('%')) break
      if (!labelLine) break
      position += 1
      pushRow(rows, baseRow, 'returns', 'return_reasons', '12m', position, labelLine, parsePercentNumber(percentLine), '', '', percentLine)
    }
  }

  const summaryPairs = [
    ['Number of sellers', 'seller_count'],
    ['Number of new brands', 'new_brand_count'],
    ['Number of ASINs', 'asin_count'],
    ['Number of new ASINs', 'new_asin_count'],
    ['Offers per ASIN', 'offers_per_asin'],
  ]
  for (const [label, key] of summaryPairs) {
    const index = lines.findIndex((line) => clean(line) === label)
    if (index < 0) continue
    const rawValue = clean(lines[index + 1])
    const range = rawValue.startsWith('>') ? rawValue : ''
    const numericValue = range ? '' : parseCompactNumber(rawValue)
    pushRow(rows, baseRow, 'summary', key, '12m', '', '', numericValue, '', range, rawValue)
  }

  const averageSpendLine = lines.find((line) => line.includes('Average daily Ad spend is '))
  if (averageSpendLine) {
    const displayValue = clean(averageSpendLine.replace('Average daily Ad spend is ', ''))
    pushRow(rows, baseRow, 'summary', 'avg_ad_spend_per_click', '12m', '', '', displayValue.replace(/[^0-9.]/g, ''), '', '', displayValue)
  }

  const majoritySpendLine = lines.find((line) => line.includes('Majority spend upto '))
  if (majoritySpendLine) {
    const displayValue = clean(majoritySpendLine.replace('Majority spend upto ', ''))
    pushRow(rows, baseRow, 'summary', 'majority_ad_spend_per_click', '12m', '', '', displayValue.replace(/[^0-9.]/g, ''), '', '', displayValue)
  }

  if (rows.length === 0) {
    fail(`Unable to extract Category Insights metrics from page-text capture: ${filePath}`)
  }

  return rows
}

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if ([inputPath, outputPath].some((value) => !value)) {
  fail('Usage: convert-legacy-report-to-csv.mjs <input-txt> <output-csv>')
}

const headers = [
  'week_code',
  'week_start',
  'week_end',
  'captured_date',
  'captured_at_utc',
  'source',
  'marketplace',
  'marketplace_id',
  'search_term',
  'category',
  'product_type',
  'product_type_id',
  'browse_node',
  'browse_node_id',
  'resolved_path',
  'section',
  'metric',
  'period',
  'position',
  'label',
  'value',
  'average_value',
  'range',
  'display_value',
]

const rows = parseLegacyReport(fs.readFileSync(inputPath, 'utf8'), inputPath)
const output = [headers.join(',')]
for (const row of rows) {
  output.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','))
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${output.join('\n')}\n`)
