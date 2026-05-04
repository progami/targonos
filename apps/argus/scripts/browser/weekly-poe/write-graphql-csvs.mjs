#!/usr/bin/env node

import fs from 'node:fs'

const [payloadPath, productsPath, searchTermsPath] = process.argv.slice(2)

if (!payloadPath || !productsPath || !searchTermsPath) {
  throw new Error('Usage: write-graphql-csvs.mjs <payload.json> <products.csv> <search-terms.csv>')
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
const data = payload.data

if (!data?.niche) {
  throw new Error('POE GraphQL payload is missing niche data')
}

if (!Array.isArray(data.asinMetrics) || data.asinMetrics.length === 0) {
  throw new Error('POE GraphQL payload is missing asinMetrics rows')
}

if (!Array.isArray(data.searchTermMetrics) || data.searchTermMetrics.length === 0) {
  throw new Error('POE GraphQL payload is missing searchTermMetrics rows')
}

const { niche } = data
if (!niche.nicheTitle || !niche.currency || !niche.lastUpdatedTimeISO8601) {
  throw new Error('POE GraphQL niche data is missing title, currency, or lastUpdatedTimeISO8601')
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function row(values) {
  return `${values.map(csvEscape).join(',')}\n`
}

function numberText(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return Number.isInteger(number) ? String(number) : String(number)
}

function lastUpdatedText(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid POE lastUpdatedTimeISO8601: ${value}`)
  }
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
}

function preamble(tabName) {
  return [
    `Niche Name: ${niche.nicheTitle}`,
    tabName,
    `Last updated on ${lastUpdatedText(niche.lastUpdatedTimeISO8601)}`,
    '',
  ].join('\n')
}

function writeProductsCsv() {
  const currency = niche.currency
  const lines = [
    `${preamble('Niche Details - Products Tab')}\n`,
    row([
      'Product Name',
      'ASIN',
      'Brand',
      'Category',
      'Launch Date',
      'Niche Click Count (Past 360 days)',
      'Click Share (Past 360 days)',
      `Average Selling Price (Past 360 days) (${currency})`,
      'Total Ratings',
      'Average Customer Rating',
      'Average BSR',
      'Average # of Sellers and Vendors (Past 360 days)',
    ]),
  ]

  for (const item of data.asinMetrics) {
    lines.push(
      row([
        item.asinTitle,
        item.asin,
        item.brand,
        item.category,
        item.launchDate,
        numberText(item.clickCountT360),
        numberText(item.clickShareT360),
        numberText(item.avgPriceT360),
        numberText(item.totalReviews),
        numberText(item.customerRating),
        numberText(item.bestSellersRanking),
        numberText(item.avgSellerVendorCountT360),
      ]),
    )
  }

  fs.writeFileSync(productsPath, lines.join(''))
}

function writeSearchTermsCsv() {
  const lines = [
    `${preamble('Niche Details - Search Terms Tab')}\n`,
    row([
      'Search Term',
      'Search Volume (Past 360 days)',
      'Search Volume Growth (Past 90 days)',
      'Search Volume Growth (Past 180 days)',
      'Click Share (Past 360 days)',
      'Search Conversion Rate (Past 360 days)',
      'Top Clicked Product 1 (Title)',
      'Top Clicked Product 1 (Asin)',
      'Top Clicked Product 2 (Title)',
      'Top Clicked Product 2 (Asin)',
      'Top Clicked Product 3 (Title)',
      'Top Clicked Product 3 (Asin)',
    ]),
  ]

  for (const item of data.searchTermMetrics) {
    const topClickedProducts = Array.isArray(item.topClickedProducts) ? item.topClickedProducts : []
    lines.push(
      row([
        item.searchTerm,
        numberText(item.searchVolumeT360),
        numberText(item.searchVolumeQoq),
        numberText(item.searchVolumeGrowthT180),
        numberText(item.clickShareT360),
        numberText(item.searchConversionRateT360),
        topClickedProducts[0]?.asinTitle,
        topClickedProducts[0]?.asin,
        topClickedProducts[1]?.asinTitle,
        topClickedProducts[1]?.asin,
        topClickedProducts[2]?.asinTitle,
        topClickedProducts[2]?.asin,
      ]),
    )
  }

  fs.writeFileSync(searchTermsPath, lines.join(''))
}

writeProductsCsv()
writeSearchTermsCsv()
