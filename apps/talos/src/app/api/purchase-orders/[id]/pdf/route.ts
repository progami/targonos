import { NextResponse } from 'next/server'
import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { getPurchaseOrderById } from '@/lib/services/purchase-order-service'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'
import { getCurrentTenant, getTenantPrisma } from '@/lib/tenant/server'
import { BUYER_LEGAL_ENTITY, getBuyerVatNumber } from '@/lib/config/legal-entity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—'
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Convert number to words (for amounts)
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  if (num === 0) return 'Zero'

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '')
  }

  const dollars = Math.floor(num)
  const cents = Math.round((num - dollars) * 100)

  let result = ''
  if (dollars >= 1000000) {
    result += convertLessThanThousand(Math.floor(dollars / 1000000)) + ' Million '
    result += convertLessThanThousand(Math.floor((dollars % 1000000) / 1000)) + ' Thousand '
    result += convertLessThanThousand(dollars % 1000)
  } else if (dollars >= 1000) {
    result += convertLessThanThousand(Math.floor(dollars / 1000)) + ' Thousand '
    result += convertLessThanThousand(dollars % 1000)
  } else {
    result = convertLessThanThousand(dollars)
  }

  result = result.trim()
  if (cents > 0) {
    result += ' and ' + convertLessThanThousand(cents) + '/100'
  }

  return result
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderPurchaseOrderHtml(params: {
  poNumber: string
  vendorPi?: string | null
  buyerName: string
  buyerAddress: string
  buyerPhone?: string | null
  buyerVatNumber?: string | null
  supplierName: string
  supplierAddress?: string | null
  supplierPhone?: string | null
  createdAt: Date
  createdByName?: string | null
  expectedDate?: Date | null
  inspectionDate?: Date | null
  incoterms?: string | null
  paymentTerms?: string | null
  shipToName?: string | null
  shipToAddress?: string | null
  notes?: string | null
  lines: Array<{
    skuCode: string
    skuDescription: string | null
    packingDetails?: string | null
    cartonDetails?: string | null
    unitsOrdered: number
    unitCost: number | null
    totalCost: number | null
  }>
}): string {
  const logoSrc = '/talos/brand/logo.svg'

  // Calculate totals
  let grandTotal = 0
  for (const line of params.lines) {
    const lineTotal = line.totalCost ?? (line.unitCost !== null ? line.unitCost * line.unitsOrdered : 0)
    grandTotal += lineTotal ?? 0
  }

  const amountInWords = numberToWords(grandTotal)

  // Format addresses
  const buyerAddressLines = params.buyerAddress.split(',').map(s => s.trim())
  const supplierAddressHtml = params.supplierAddress
    ? escapeHtml(params.supplierAddress).replace(/\n/g, '<br>')
    : ''
  const shipToAddressHtml = params.shipToAddress
    ? escapeHtml(params.shipToAddress).replace(/\n/g, '<br>')
    : buyerAddressLines.join('<br>')

  // Build line items HTML
  const lineItemsHtml = params.lines.map(line => {
    const unitCost = line.unitCost
    const lineTotal = line.totalCost ?? (unitCost !== null ? unitCost * line.unitsOrdered : null)

    return `
      <tr>
        <td class="desc-cell">
          <div class="sku-code">${escapeHtml(line.skuCode)}</div>
          ${line.skuDescription ? `<div class="sku-detail"><span class="detail-label">Product:</span> ${escapeHtml(line.skuDescription)}</div>` : ''}
          ${line.packingDetails ? `<div class="sku-detail"><span class="detail-label">Packing:</span> ${escapeHtml(line.packingDetails)}</div>` : ''}
          ${line.cartonDetails ? `<div class="sku-detail"><span class="detail-label">Carton:</span> ${escapeHtml(line.cartonDetails)}</div>` : ''}
        </td>
        <td class="qty-cell">${line.unitsOrdered.toLocaleString()}</td>
        <td class="price-cell">${unitCost !== null ? formatCurrency(unitCost) : '—'}</td>
        <td class="total-cell">${lineTotal !== null ? formatCurrency(lineTotal) : '—'}</td>
      </tr>
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order ${escapeHtml(params.poNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1e293b;
      background: #fff;
    }

    .page {
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.5in;
      background: white;
      display: flex;
      flex-direction: column;
    }

    .page-content {
      flex: 1;
    }

    @media print {
      body { background: white; margin: 0; padding: 0; }
      .page {
        width: 100%;
        min-height: auto;
        height: auto;
        margin: 0;
        padding: 0.4in;
        page-break-after: always;
        page-break-inside: avoid;
      }
      .page:last-child {
        page-break-after: avoid;
      }
      .no-print { display: none !important; }
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 3px solid #1e293b;
    }

    .logo-section {
      flex: 1;
    }

    .logo {
      display: block;
      height: 32px;
      width: auto;
    }

    .company-address {
      margin-top: 10px;
      font-size: 11px;
      color: #475569;
      line-height: 1.6;
    }

    .po-title-section {
      text-align: right;
    }

    .po-title {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }

    .po-meta {
      display: table;
      margin-left: auto;
    }

    .po-meta-row {
      display: table-row;
    }

    .po-meta-label {
      display: table-cell;
      text-align: right;
      padding-right: 12px;
      padding-bottom: 4px;
      font-size: 9px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .po-meta-value {
      display: table-cell;
      text-align: right;
      padding-bottom: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
    }

    /* Parties Section */
    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 25px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 9px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 10px;
    }

    .party-name {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }

    .party-address {
      font-size: 11px;
      color: #475569;
      line-height: 1.6;
    }

    /* Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .items-table thead th {
      background: #1e293b;
      color: white;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      text-align: left;
    }

    .items-table thead th:nth-child(2),
    .items-table thead th:nth-child(3),
    .items-table thead th:nth-child(4) {
      text-align: right;
    }

    .items-table tbody td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .desc-cell {
      width: 50%;
    }

    .sku-code {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .sku-detail {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }

    .detail-label {
      font-weight: 600;
      color: #94a3b8;
    }

    .qty-cell, .price-cell, .total-cell {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }

    .total-cell {
      font-weight: 600;
      color: #0f172a;
    }

    /* Totals */
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 20px;
    }

    .totals-box {
      width: 280px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 11px;
    }

    .total-row.balance {
      border-top: 2px solid #0f172a;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .total-label {
      color: #64748b;
    }

    .total-value {
      font-weight: 600;
      color: #0f172a;
    }

    .amount-words {
      text-align: right;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
    }

    /* Page 2 */
    .page-ref {
      text-align: right;
      font-size: 11px;
      color: #94a3b8;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 30px;
    }

    .terms-notes {
      display: flex;
      gap: 30px;
      margin-bottom: 60px;
    }

    .info-box {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 20px;
      min-height: 180px;
    }

    .info-box-title {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding-bottom: 10px;
      border-bottom: 1px solid #cbd5e1;
      margin-bottom: 15px;
    }

    .info-row {
      margin-bottom: 10px;
      font-size: 11px;
    }

    .info-label {
      font-weight: 600;
      color: #475569;
    }

    .info-value {
      color: #64748b;
    }

    .info-value.highlight {
      color: #b45309;
      font-weight: 500;
    }

    .notes-text {
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }

    /* Signatures */
    .signatures {
      display: flex;
      gap: 30px;
      margin-top: 40px;
    }

    .signature {
      flex: 1;
    }

    .signature-line {
      border-top: 1px solid #0f172a;
      padding-top: 10px;
      margin-top: 50px;
    }

    .signature-name {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
    }

    .signature-title {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Footer */
    .footer {
      margin-top: auto;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: right;
      font-size: 9px;
      color: #94a3b8;
    }

    /* Print button */
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #00C2B9;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 1000;
    }

    .print-btn:hover {
      background: #00a8a0;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>

  <!-- Page 1 -->
  <div class="page">
    <div class="page-content">
      <div class="header">
        <div class="logo-section">
          <img class="logo" src="${logoSrc}" alt="Targon" />
          <div class="company-address">
            ${buyerAddressLines.slice(0, 2).join(', ')}<br>
            ${buyerAddressLines.slice(2).join(', ')}<br>
            ${params.buyerPhone ? `Phone: ${params.buyerPhone}` : ''}
          </div>
        </div>
        <div class="po-title-section">
          <div class="po-title">PURCHASE<br>ORDER</div>
          <div class="po-meta">
            <div class="po-meta-row">
              <span class="po-meta-label">PO Number:</span>
              <span class="po-meta-value">${escapeHtml(params.poNumber)}</span>
            </div>
            <div class="po-meta-row">
              <span class="po-meta-label">Date:</span>
              <span class="po-meta-value">${formatDate(params.createdAt)}</span>
            </div>
            ${params.vendorPi ? `
            <div class="po-meta-row">
              <span class="po-meta-label">Vendor PI:</span>
              <span class="po-meta-value">${escapeHtml(params.vendorPi)}</span>
            </div>
            ` : ''}
            <div class="po-meta-row">
              <span class="po-meta-label">Shipment:</span>
              <span class="po-meta-value">By Sea</span>
            </div>
          </div>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <div class="party-label">Vendor</div>
          <div class="party-name">${escapeHtml(params.supplierName)}</div>
          <div class="party-address">
            ${supplierAddressHtml}
            ${params.supplierPhone ? `<br>Tel: ${escapeHtml(params.supplierPhone)}` : ''}
          </div>
        </div>
        <div class="party">
          <div class="party-label">Ship To</div>
          <div class="party-name">${escapeHtml(params.shipToName || params.buyerName)}</div>
          <div class="party-address">${shipToAddressHtml}</div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description & Packing Details</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="totals-box">
          <div class="total-row">
            <span class="total-label">Total Amount (USD):</span>
            <span class="total-value">${formatCurrency(grandTotal)}</span>
          </div>
          <div class="total-row balance">
            <span class="total-label">BALANCE DUE:</span>
            <span class="total-value">${formatCurrency(grandTotal)}</span>
          </div>
          <div class="amount-words">
            SAY TOTAL U.S. DOLLARS ${amountInWords.toUpperCase()}.
          </div>
        </div>
      </div>
    </div>
    <div class="footer">Page 1 of 2</div>
  </div>

  <!-- Page 2 -->
  <div class="page">
    <div class="page-content">
      <div class="page-ref">CONTINUATION SHEET - REF: PO ${escapeHtml(params.poNumber)}</div>

      <div class="terms-notes">
        <div class="info-box">
          <div class="info-box-title">Terms & Conditions</div>
          ${params.expectedDate ? `
          <div class="info-row">
            <span class="info-label">Delivery:</span>
            <span class="info-value highlight">${formatDate(params.expectedDate)}</span>
          </div>
          ` : ''}
          ${params.paymentTerms ? `
          <div class="info-row">
            <span class="info-label">Payment Terms:</span><br>
            <span class="info-value">${escapeHtml(params.paymentTerms)}</span>
          </div>
          ` : ''}
          ${params.incoterms ? `
          <div class="info-row">
            <span class="info-label">Incoterms:</span>
            <span class="info-value">${escapeHtml(params.incoterms)}</span>
          </div>
          ` : ''}
        </div>
        <div class="info-box">
          <div class="info-box-title">Notes</div>
          <div class="notes-text">
            ${params.notes?.trim() ? escapeHtml(params.notes).replace(/\n/g, '<br>') : 'No additional notes.'}
          </div>
        </div>
      </div>

      <div class="signatures">
        <div class="signature">
          <div class="signature-line">
            <div class="signature-name">${escapeHtml(params.createdByName?.toUpperCase() ?? 'CREATOR')}</div>
            <div class="signature-title">Created By</div>
          </div>
        </div>
        <div class="signature">
          <div class="signature-line">
            <div class="signature-name">JARRAR AMJAD</div>
            <div class="signature-title">Founder, Targon LLC</div>
          </div>
        </div>
        <div class="signature">
          <div class="signature-line">
            <div class="signature-name">${escapeHtml(params.supplierName ? params.supplierName.split(' ')[0].toUpperCase() : 'SUPPLIER')}</div>
            <div class="signature-title">${escapeHtml(params.supplierName)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="footer">Page 2 of 2</div>
  </div>
</body>
</html>`
}

export const GET = withAuthAndParams(async (_request, params, _session) => {
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const order = await getPurchaseOrderById(id)
  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  // Prefer snapshot supplier address stored on the PO. Fall back to live supplier for older POs.
  let supplierAddress: string | null = order.counterpartyAddress ?? null
  let supplierPhone: string | null = null
  if (order.counterpartyName) {
    const prisma = await getTenantPrisma()
    const supplier = await prisma.supplier.findFirst({
      where: { name: order.counterpartyName },
      select: { address: true, phone: true },
    })
    if (!supplierAddress) {
      supplierAddress = supplier?.address ?? null
    }
    supplierPhone = supplier?.phone ?? null
  }

  const tenant = await getCurrentTenant()
  const buyerVatNumber = getBuyerVatNumber(tenant.code)

  const poNumber = order.poNumber ?? toPublicOrderNumber(order.orderNumber)

  // Get proforma invoice number from stage data if available
  const vendorPi = (order as { proformaInvoiceNumber?: string | null }).proformaInvoiceNumber ?? null

  const lines = order.lines.map(line => ({
    skuCode: line.skuCode,
    skuDescription: line.skuDescription ?? null,
    packingDetails: line.unitsPerCarton ? `${line.unitsPerCarton} units/carton` : null,
    cartonDetails: line.quantity ? `${line.quantity} cartons` : null,
    unitsOrdered: line.unitsOrdered,
    unitCost: toNumber(line.unitCost),
    totalCost: toNumber(line.totalCost),
  }))

  const html = renderPurchaseOrderHtml({
    poNumber,
    vendorPi,
    buyerName: BUYER_LEGAL_ENTITY.name,
    buyerAddress: BUYER_LEGAL_ENTITY.address,
    buyerPhone: '785-370-3532',
    buyerVatNumber,
    supplierName: order.counterpartyName ?? '',
    supplierAddress,
    supplierPhone,
    createdAt: order.createdAt,
    createdByName: order.createdByName,
    expectedDate: order.expectedDate,
    incoterms: order.incoterms,
    paymentTerms: order.paymentTerms,
    shipToName: order.warehouseName ?? order.shipToName,
    shipToAddress: order.shipToAddress ?? null,
    notes: order.notes,
    lines,
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
})
