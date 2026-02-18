export type AmazonTransactionRow = {
  dateTime: string;
  settlementId: string;
  type: string;
  orderId: string;
  sku: string;
  description: string;
  quantity: number;
  marketplace: string;
  productSales: number;
  productSalesTax: number;
  shippingCredits: number;
  shippingCreditsTax: number;
  giftWrapCredits: number;
  giftWrapCreditsTax: number;
  regulatoryFee: number;
  taxOnRegulatoryFee: number;
  promotionalRebates: number;
  promotionalRebatesTax: number;
  marketplaceWithheldTax: number;
  sellingFees: number;
  fbaFees: number;
  otherTransactionFees: number;
  other: number;
  total: number;
};

export type ParsedAmazonCsv = {
  headers: string[];
  rows: AmazonTransactionRow[];
};

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}

/**
 * Normalize a header name from the Amazon Date Range Transaction Report.
 * Lowercases and strips non-alphanumeric characters so minor label differences
 * (casing, extra spaces, punctuation) don't break parsing.
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const normalized = cols.map(normalizeHeader);

    const hasOrderId = normalized.includes(normalizeHeader('order id')) || normalized.includes(normalizeHeader('orderid'));
    const hasTotal = normalized.includes(normalizeHeader('total'));
    if (hasOrderId && hasTotal) {
      return i;
    }
  }
  throw new Error('Could not find CSV header row (expected columns like "order id" and "total")');
}

/**
 * Find a column index by trying several normalized variants.
 * Returns -1 if no match is found.
 */
function findColumn(normalizedHeaders: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseRequiredNumber(raw: string | undefined, field: string, rowNumber: number): number {
  if (raw === undefined) {
    throw new Error(`Missing ${field} on row ${rowNumber}`);
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '--') {
    throw new Error(`Missing ${field} on row ${rowNumber}`);
  }

  const cleaned = trimmed.replace(/[,$\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${field} on row ${rowNumber}: ${trimmed}`);
  }

  return n;
}

function parseNumber(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '' || raw.trim() === '--') return 0;
  const cleaned = raw.replace(/[,$\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n;
}

export function parseAmazonTransactionCsv(content: string): ParsedAmazonCsv {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headerIndex = findHeaderIndex(lines);
  const rawHeaders = splitCsvLine(lines[headerIndex]!).map((h) => h.trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  // Locate columns flexibly
  const dateTimeIdx = findColumn(normalizedHeaders, 'date/time', 'datetime', 'date time');
  const settlementIdIdx = findColumn(normalizedHeaders, 'settlement id', 'settlementid');
  const typeIdx = findColumn(normalizedHeaders, 'type');
  const orderIdIdx = findColumn(normalizedHeaders, 'order id', 'orderid');
  const skuIdx = findColumn(normalizedHeaders, 'sku');
  const descriptionIdx = findColumn(normalizedHeaders, 'description');
  const quantityIdx = findColumn(normalizedHeaders, 'quantity');
  const marketplaceIdx = findColumn(normalizedHeaders, 'marketplace');
  const productSalesIdx = findColumn(normalizedHeaders, 'product sales', 'productsales');
  const productSalesTaxIdx = findColumn(normalizedHeaders, 'product sales tax', 'productsalestax');
  const shippingCreditsIdx = findColumn(normalizedHeaders, 'shipping credits', 'shippingcredits');
  const shippingCreditsTaxIdx = findColumn(normalizedHeaders, 'shipping credits tax', 'shippingcreditstax');
  const giftWrapCreditsIdx = findColumn(normalizedHeaders, 'gift wrap credits', 'giftwrapcredits');
  const giftWrapCreditsTaxIdx = findColumn(
    normalizedHeaders,
    'giftwrap credits tax',
    'giftwrapcreditstax',
    'gift wrap credits tax',
  );
  const regulatoryFeeIdx = findColumn(normalizedHeaders, 'regulatory fee', 'regulatoryfee');
  const taxOnRegulatoryFeeIdx = findColumn(normalizedHeaders, 'tax on regulatory fee', 'taxonregulatoryfee');
  const promotionalRebatesIdx = findColumn(normalizedHeaders, 'promotional rebates', 'promotionalrebates');
  const promotionalRebatesTaxIdx = findColumn(normalizedHeaders, 'promotional rebates tax', 'promotionalrebatestax');
  const marketplaceWithheldTaxIdx = findColumn(normalizedHeaders, 'marketplace withheld tax', 'marketplacewithheldtax');
  const sellingFeesIdx = findColumn(normalizedHeaders, 'selling fees', 'sellingfees');
  const fbaFeesIdx = findColumn(normalizedHeaders, 'fba fees', 'fbafees');
  const otherTransactionFeesIdx = findColumn(normalizedHeaders, 'other transaction fees', 'othertransactionfees');
  const otherIdx = findColumn(normalizedHeaders, 'other');
  const totalIdx = findColumn(normalizedHeaders, 'total');

  // order id is required for reconciliation
  if (orderIdIdx === -1) {
    throw new Error('Missing required column: "order id"');
  }
  if (totalIdx === -1) {
    throw new Error('Missing required column: "total"');
  }

  const rows: AmazonTransactionRow[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);

    const orderId = cols[orderIdIdx]?.trim() ?? '';
    // Skip rows without an order id - these are summary/header rows
    if (orderId === '') continue;

    const quantityRaw = quantityIdx !== -1 ? cols[quantityIdx]?.trim() ?? '' : '';
    const quantity = quantityRaw === '' ? 0 : Number(quantityRaw);
    const total = parseRequiredNumber(totalIdx !== -1 ? cols[totalIdx] : undefined, 'total', i + 1);

    rows.push({
      dateTime: dateTimeIdx !== -1 ? (cols[dateTimeIdx]?.trim() ?? '') : '',
      settlementId: settlementIdIdx !== -1 ? (cols[settlementIdIdx]?.trim() ?? '') : '',
      type: typeIdx !== -1 ? (cols[typeIdx]?.trim() ?? '') : '',
      orderId,
      sku: skuIdx !== -1 ? (cols[skuIdx]?.trim() ?? '') : '',
      description: descriptionIdx !== -1 ? (cols[descriptionIdx]?.trim() ?? '') : '',
      quantity: Number.isFinite(quantity) ? quantity : 0,
      marketplace: marketplaceIdx !== -1 ? (cols[marketplaceIdx]?.trim() ?? '') : '',
      productSales: parseNumber(productSalesIdx !== -1 ? cols[productSalesIdx] : undefined),
      productSalesTax: parseNumber(productSalesTaxIdx !== -1 ? cols[productSalesTaxIdx] : undefined),
      shippingCredits: parseNumber(shippingCreditsIdx !== -1 ? cols[shippingCreditsIdx] : undefined),
      shippingCreditsTax: parseNumber(shippingCreditsTaxIdx !== -1 ? cols[shippingCreditsTaxIdx] : undefined),
      giftWrapCredits: parseNumber(giftWrapCreditsIdx !== -1 ? cols[giftWrapCreditsIdx] : undefined),
      giftWrapCreditsTax: parseNumber(giftWrapCreditsTaxIdx !== -1 ? cols[giftWrapCreditsTaxIdx] : undefined),
      regulatoryFee: parseNumber(regulatoryFeeIdx !== -1 ? cols[regulatoryFeeIdx] : undefined),
      taxOnRegulatoryFee: parseNumber(taxOnRegulatoryFeeIdx !== -1 ? cols[taxOnRegulatoryFeeIdx] : undefined),
      promotionalRebates: parseNumber(promotionalRebatesIdx !== -1 ? cols[promotionalRebatesIdx] : undefined),
      promotionalRebatesTax: parseNumber(promotionalRebatesTaxIdx !== -1 ? cols[promotionalRebatesTaxIdx] : undefined),
      marketplaceWithheldTax: parseNumber(
        marketplaceWithheldTaxIdx !== -1 ? cols[marketplaceWithheldTaxIdx] : undefined,
      ),
      sellingFees: parseNumber(sellingFeesIdx !== -1 ? cols[sellingFeesIdx] : undefined),
      fbaFees: parseNumber(fbaFeesIdx !== -1 ? cols[fbaFeesIdx] : undefined),
      otherTransactionFees: parseNumber(otherTransactionFeesIdx !== -1 ? cols[otherTransactionFeesIdx] : undefined),
      other: parseNumber(otherIdx !== -1 ? cols[otherIdx] : undefined),
      total,
    });
  }

  return { headers: rawHeaders, rows };
}
