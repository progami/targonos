#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  REPO_ROOT,
  MONITORING_BASE,
  ensureDir,
  loadMonitoringEnv,
  requireEnv,
  writeCsv,
} from '../weekly-sources/lib/common.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPORT_TYPE = 'GET_V2_SELLER_PERFORMANCE_REPORT'
const TALOS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/talos/package.json')
const OUTPUT_DIR = path.join(MONITORING_BASE, 'Daily', 'Account Health Dashboard (API)')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'account-health.csv')
const REPORT_TIMEOUT_MS = 2 * 60 * 60 * 1000
const POLL_INTERVAL_MS = 15_000
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const HEADERS = [
  'date',
  'captured_at',
  'reporting_date_from',
  'reporting_date_to',
  'marketplace_id',
  'account_status',
  'account_health_rating_status',
  'order_defect_rate_afn',
  'order_count_afn',
  'negative_feedback_count_afn',
  'claims_count_afn',
  'chargeback_count_afn',
  'order_defect_rate_mfn',
  'order_count_mfn',
  'negative_feedback_count_mfn',
  'claims_count_mfn',
  'chargeback_count_mfn',
  'late_shipment_rate',
  'late_shipment_count',
  'late_shipment_shipment_count',
  'invoice_defect_rate',
  'invoice_defect_count',
  'missing_invoice_count',
  'late_invoice_count',
  'invoice_shipment_count',
  'on_time_delivery_rate',
  'on_time_delivery_count',
  'on_time_delivery_shipment_count',
  'unit_on_time_delivery_rate',
  'unit_on_time_delivery_count',
  'unit_count',
  'valid_tracking_rate',
  'shipment_with_valid_tracking_count',
  'valid_tracking_shipment_count',
  'pre_fulfillment_cancellation_rate',
  'cancellation_count',
  'pre_fulfillment_order_count',
  'listing_policy_violations_status',
  'product_authenticity_customer_complaints_count',
  'product_condition_customer_complaints_count',
  'product_safety_customer_complaints_count',
  'food_and_product_safety_issues_count',
  'received_ip_complaints_count',
  'suspected_ip_violations_count',
  'restricted_product_policy_violations_count',
  'customer_product_reviews_policy_violations_count',
  'other_policy_violations_count',
  'document_requests_count',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nowIso() {
  return new Date().toISOString()
}

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRate(value) {
  if (value === null || value === undefined) return ''

  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) return ''

  return `${(numericValue * 100).toFixed(2)}%`
}

function scalar(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function createClient() {
  loadMonitoringEnv()

  const requireFromTalos = createRequire(TALOS_PACKAGE_JSON)
  const SellingPartnerAPI = requireFromTalos('amazon-sp-api')

  return new SellingPartnerAPI({
    region: requireEnv('AMAZON_SP_API_REGION_US'),
    refresh_token: requireEnv('AMAZON_REFRESH_TOKEN_US'),
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: requireEnv('AMAZON_SP_APP_CLIENT_ID'),
      SELLING_PARTNER_APP_CLIENT_SECRET: requireEnv('AMAZON_SP_APP_CLIENT_SECRET'),
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: false,
    },
  })
}

async function findReusableReport(client, marketplaceId) {
  const response = await client.callAPI({
    operation: 'getReports',
    endpoint: 'reports',
    query: {
      reportTypes: [REPORT_TYPE],
      pageSize: 20,
    },
  })

  const reports = response?.reports ?? []
  const activeReports = reports
    .filter((report) => report?.marketplaceIds?.includes(marketplaceId))
    .filter((report) => {
      const status = report?.processingStatus
      return status === 'IN_PROGRESS' || status === 'IN_QUEUE'
    })
    .sort((left, right) => String(right?.createdTime ?? '').localeCompare(String(left?.createdTime ?? '')))

  const activeReport = activeReports[0]
  if (!activeReport?.reportId) return null

  console.log(`[Account Health API] reusing active reportId=${activeReport.reportId}`)
  return activeReport.reportId
}

async function createReport(client, marketplaceId) {
  const created = await client.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body: {
      reportType: REPORT_TYPE,
      marketplaceIds: [marketplaceId],
    },
  })

  if (!created?.reportId) {
    throw new Error('Account Health API: missing reportId')
  }

  return created.reportId
}

async function waitForReport(client, reportId) {
  const deadline = Date.now() + REPORT_TIMEOUT_MS

  while (true) {
    const report = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })

    const status = report?.processingStatus
    console.log(`[Account Health API] reportId=${reportId} status=${status}`)

    if (status === 'DONE') return report
    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`Account Health API: report ${reportId} failed with status ${status}`)
    }
    if (Date.now() > deadline) {
      throw new Error(`Account Health API: report ${reportId} timed out`)
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

async function downloadReportPayload(client, report) {
  const reportDocumentId = report?.reportDocumentId
  if (!reportDocumentId) {
    throw new Error(`Account Health API: report ${report?.reportId ?? 'unknown'} missing reportDocumentId`)
  }

  const document = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId },
  })

  const raw = await client.download(document)
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
  return JSON.parse(text)
}

function collectReportingRanges(value, ranges = []) {
  if (!value || typeof value !== 'object') return ranges

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReportingRanges(item, ranges)
    }
    return ranges
  }

  const reportingDateRange = value.reportingDateRange
  if (reportingDateRange?.reportingDateFrom || reportingDateRange?.reportingDateTo) {
    ranges.push({
      from: reportingDateRange.reportingDateFrom ?? '',
      to: reportingDateRange.reportingDateTo ?? '',
    })
  }

  for (const nestedValue of Object.values(value)) {
    collectReportingRanges(nestedValue, ranges)
  }

  return ranges
}

function reportingWindow(metrics) {
  const ranges = collectReportingRanges(metrics)
  const fromValues = ranges.map((range) => range.from).filter(Boolean).sort()
  const toValues = ranges.map((range) => range.to).filter(Boolean).sort()

  return {
    from: fromValues[0] ?? '',
    to: toValues[toValues.length - 1] ?? '',
  }
}

function buildBlankRow() {
  return Object.fromEntries(HEADERS.map((header) => [header, '']))
}

function extractRow(payload, capturedAt) {
  const accountStatus = payload?.accountStatuses?.[0] ?? {}
  const metrics = Array.isArray(payload?.performanceMetrics)
    ? payload.performanceMetrics[0] ?? {}
    : payload?.performanceMetrics ?? {}

  const afn = metrics?.orderDefectRate?.afn ?? {}
  const mfn = metrics?.orderDefectRate?.mfn ?? {}
  const lateShipment = metrics?.lateShipmentRate ?? {}
  const invoiceDefect = metrics?.invoiceDefectRate ?? {}
  const onTimeDelivery = metrics?.onTimeDeliveryRate ?? {}
  const unitOnTimeDelivery = metrics?.unitOnTimeDeliveryRate ?? {}
  const validTracking = metrics?.validTrackingRate ?? {}
  const preFulfillment = metrics?.preFulfillmentCancellationRate ?? {}
  const listingPolicyViolations = metrics?.listingPolicyViolations ?? {}
  const window = reportingWindow(metrics)

  const row = buildBlankRow()
  row.date = localDateString(new Date(capturedAt))
  row.captured_at = capturedAt
  row.reporting_date_from = window.from
  row.reporting_date_to = window.to
  row.marketplace_id = scalar(metrics?.marketplaceId ?? accountStatus?.marketplaceId)
  row.account_status = scalar(accountStatus?.status)
  row.account_health_rating_status = scalar(metrics?.accountHealthRating?.ahrStatus)
  row.order_defect_rate_afn = formatRate(afn?.rate)
  row.order_count_afn = scalar(afn?.orderCount)
  row.negative_feedback_count_afn = scalar(afn?.negativeFeedback?.count)
  row.claims_count_afn = scalar(afn?.claims?.count)
  row.chargeback_count_afn = scalar(afn?.chargebacks?.count)
  row.order_defect_rate_mfn = formatRate(mfn?.rate)
  row.order_count_mfn = scalar(mfn?.orderCount)
  row.negative_feedback_count_mfn = scalar(mfn?.negativeFeedback?.count)
  row.claims_count_mfn = scalar(mfn?.claims?.count)
  row.chargeback_count_mfn = scalar(mfn?.chargebacks?.count)
  row.late_shipment_rate = formatRate(lateShipment?.rate)
  row.late_shipment_count = scalar(lateShipment?.lateShipmentCount)
  row.late_shipment_shipment_count = scalar(lateShipment?.orderCount)
  row.invoice_defect_rate = formatRate(invoiceDefect?.rate)
  row.invoice_defect_count = scalar(invoiceDefect?.invoiceDefect?.count)
  row.missing_invoice_count = scalar(invoiceDefect?.missingInvoice?.count)
  row.late_invoice_count = scalar(invoiceDefect?.lateInvoice?.count)
  row.invoice_shipment_count = scalar(invoiceDefect?.orderCount)
  row.on_time_delivery_rate = formatRate(onTimeDelivery?.rate)
  row.on_time_delivery_count = scalar(onTimeDelivery?.onTimeDeliveryCount)
  row.on_time_delivery_shipment_count = scalar(onTimeDelivery?.shipmentCountWithValidTracking)
  row.unit_on_time_delivery_rate = formatRate(unitOnTimeDelivery?.rate)
  row.unit_on_time_delivery_count = scalar(unitOnTimeDelivery?.unitOnTimeDeliveryCount)
  row.unit_count = scalar(unitOnTimeDelivery?.totalUnitCount)
  row.valid_tracking_rate = formatRate(validTracking?.rate)
  row.shipment_with_valid_tracking_count = scalar(validTracking?.validTrackingCount)
  row.valid_tracking_shipment_count = scalar(validTracking?.shipmentCount)
  row.pre_fulfillment_cancellation_rate = formatRate(preFulfillment?.rate)
  row.cancellation_count = scalar(preFulfillment?.cancellationCount)
  row.pre_fulfillment_order_count = scalar(preFulfillment?.orderCount)
  row.listing_policy_violations_status = scalar(listingPolicyViolations?.status)
  row.product_authenticity_customer_complaints_count = scalar(metrics?.productAuthenticityCustomerComplaints?.defectsCount)
  row.product_condition_customer_complaints_count = scalar(metrics?.productConditionCustomerComplaints?.defectsCount)
  row.product_safety_customer_complaints_count = scalar(metrics?.productSafetyCustomerComplaints?.defectsCount)
  row.food_and_product_safety_issues_count = scalar(metrics?.foodAndProductSafetyIssues?.defectsCount)
  row.received_ip_complaints_count = scalar(metrics?.receivedIntellectualPropertyComplaints?.defectsCount)
  row.suspected_ip_violations_count = scalar(metrics?.suspectedIntellectualPropertyViolations?.defectsCount)
  row.restricted_product_policy_violations_count = scalar(metrics?.restrictedProductPolicyViolations?.defectsCount)
  row.customer_product_reviews_policy_violations_count = scalar(metrics?.customerProductReviewsPolicyViolations?.defectsCount)
  row.other_policy_violations_count = scalar(metrics?.otherPolicyViolations?.defectsCount)
  row.document_requests_count = scalar(metrics?.documentRequests?.defectsCount)

  return row
}

function readExistingRows(file) {
  if (!fs.existsSync(file)) return []

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []

  const [headerLine, ...dataLines] = lines
  const headers = headerLine.split(',')
  const rows = []

  for (const line of dataLines) {
    const cells = line.split(',')
    const row = {}

    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = cells[index] ?? ''
    }

    if (!DATE_REGEX.test(row.date ?? '')) continue
    rows.push(row)
  }

  return rows
}

function upsertRow(file, row) {
  const rowsByDate = new Map()
  const existingRows = readExistingRows(file)

  for (const existingRow of existingRows) {
    rowsByDate.set(existingRow.date, { ...buildBlankRow(), ...existingRow })
  }

  rowsByDate.set(row.date, { ...buildBlankRow(), ...row })

  const rows = [...rowsByDate.values()].sort((left, right) => left.date.localeCompare(right.date))

  ensureDir(path.dirname(file))
  writeCsv(file, HEADERS, rows)
}

async function main() {
  const client = createClient()
  const marketplaceId = requireEnv('AMAZON_MARKETPLACE_ID_US')

  const reusableReportId = await findReusableReport(client, marketplaceId)
  const reportId = reusableReportId ?? await createReport(client, marketplaceId)
  const report = await waitForReport(client, reportId)
  const payload = await downloadReportPayload(client, report)

  const capturedAt = nowIso()
  const row = extractRow(payload, capturedAt)

  upsertRow(OUTPUT_FILE, row)
  console.log(`account_health_output=${OUTPUT_FILE}`)
}

main().catch((error) => {
  console.error(error?.stack ?? String(error))
  process.exit(1)
})
