export type AmazonUnifiedTransactionRow = {
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

export type ParsedAmazonUnifiedTransactionCsv = {
  headers: string[];
  rows: AmazonUnifiedTransactionRow[];
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
 * Normalize a header name from Amazon Payments reports.
 * Lowercases and strips non-alphanumeric characters so minor label differences
 * (casing, extra spaces, punctuation) don't break parsing.
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(normalizedHeaders: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(raw: string | undefined, field: string, rowNumber: number): number {
  if (raw === undefined) return 0;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '--') return 0;

  const cleaned = trimmed.replace(/[,$\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${field} on row ${rowNumber}: ${trimmed}`);
  }
  return n;
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

function parseQuantity(raw: string | undefined, rowNumber: number): number {
  if (raw === undefined) return 0;
  const trimmed = raw.trim();
  if (trimmed === '') return 0;

  const cleaned = trimmed.replace(/[,$\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid quantity on row ${rowNumber}: ${trimmed}`);
  }
  return n;
}

function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const normalized = cols.map(normalizeHeader);

    const hasDateTime = normalized.includes(normalizeHeader('date/time')) || normalized.includes(normalizeHeader('datetime'));
    const hasSettlement = normalized.includes(normalizeHeader('settlement id')) || normalized.includes(normalizeHeader('settlementid'));
    const hasType = normalized.includes(normalizeHeader('type'));
    const hasTotal = normalized.includes(normalizeHeader('total'));

    if (hasDateTime && hasSettlement && hasType && hasTotal) {
      return i;
    }
  }
  throw new Error('Could not find CSV header row (expected columns like "date/time", "settlement id", "type", "total")');
}

/**
 * Parse the Amazon Payments "Monthly Unified Transaction" / "Date Range Transaction" style CSV.
 *
 * Notes:
 * - These files often include a preamble (definitions) before the header row; we detect the header.
 * - Rows may omit Order Id (fees, adjustments, etc.). We keep them.
 */
export function parseAmazonUnifiedTransactionCsv(content: string): ParsedAmazonUnifiedTransactionCsv {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headerIndex = findHeaderIndex(lines);
  const headers = splitCsvLine(lines[headerIndex]!).map((h) => h.trim());
  const normalizedHeaders = headers.map(normalizeHeader);

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
  const giftWrapCreditsTaxIdx = findColumn(normalizedHeaders, 'giftwrap credits tax', 'giftwrapcreditstax', 'gift wrap credits tax');
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

  if (settlementIdIdx === -1) throw new Error('Missing required column: "settlement id"');
  if (typeIdx === -1) throw new Error('Missing required column: "type"');
  if (totalIdx === -1) throw new Error('Missing required column: "total"');

  const rows: AmazonUnifiedTransactionRow[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);

    const settlementId = cols[settlementIdIdx]?.trim() ?? '';
    if (settlementId === '') continue;

    const rowNumber = i + 1;
    const quantity = parseQuantity(quantityIdx !== -1 ? cols[quantityIdx] : undefined, rowNumber);
    const total = parseRequiredNumber(cols[totalIdx], 'total', rowNumber);

    rows.push({
      dateTime: dateTimeIdx !== -1 ? (cols[dateTimeIdx]?.trim() ?? '') : '',
      settlementId,
      type: cols[typeIdx]?.trim() ?? '',
      orderId: orderIdIdx !== -1 ? (cols[orderIdIdx]?.trim() ?? '') : '',
      sku: skuIdx !== -1 ? (cols[skuIdx]?.trim() ?? '') : '',
      description: descriptionIdx !== -1 ? (cols[descriptionIdx]?.trim() ?? '') : '',
      quantity,
      marketplace: marketplaceIdx !== -1 ? (cols[marketplaceIdx]?.trim() ?? '') : '',
      productSales: parseNumber(productSalesIdx !== -1 ? cols[productSalesIdx] : undefined, 'product sales', rowNumber),
      productSalesTax: parseNumber(productSalesTaxIdx !== -1 ? cols[productSalesTaxIdx] : undefined, 'product sales tax', rowNumber),
      shippingCredits: parseNumber(shippingCreditsIdx !== -1 ? cols[shippingCreditsIdx] : undefined, 'shipping credits', rowNumber),
      shippingCreditsTax: parseNumber(
        shippingCreditsTaxIdx !== -1 ? cols[shippingCreditsTaxIdx] : undefined,
        'shipping credits tax',
        rowNumber,
      ),
      giftWrapCredits: parseNumber(giftWrapCreditsIdx !== -1 ? cols[giftWrapCreditsIdx] : undefined, 'gift wrap credits', rowNumber),
      giftWrapCreditsTax: parseNumber(
        giftWrapCreditsTaxIdx !== -1 ? cols[giftWrapCreditsTaxIdx] : undefined,
        'gift wrap credits tax',
        rowNumber,
      ),
      regulatoryFee: parseNumber(regulatoryFeeIdx !== -1 ? cols[regulatoryFeeIdx] : undefined, 'regulatory fee', rowNumber),
      taxOnRegulatoryFee: parseNumber(
        taxOnRegulatoryFeeIdx !== -1 ? cols[taxOnRegulatoryFeeIdx] : undefined,
        'tax on regulatory fee',
        rowNumber,
      ),
      promotionalRebates: parseNumber(
        promotionalRebatesIdx !== -1 ? cols[promotionalRebatesIdx] : undefined,
        'promotional rebates',
        rowNumber,
      ),
      promotionalRebatesTax: parseNumber(
        promotionalRebatesTaxIdx !== -1 ? cols[promotionalRebatesTaxIdx] : undefined,
        'promotional rebates tax',
        rowNumber,
      ),
      marketplaceWithheldTax: parseNumber(
        marketplaceWithheldTaxIdx !== -1 ? cols[marketplaceWithheldTaxIdx] : undefined,
        'marketplace withheld tax',
        rowNumber,
      ),
      sellingFees: parseNumber(sellingFeesIdx !== -1 ? cols[sellingFeesIdx] : undefined, 'selling fees', rowNumber),
      fbaFees: parseNumber(fbaFeesIdx !== -1 ? cols[fbaFeesIdx] : undefined, 'fba fees', rowNumber),
      otherTransactionFees: parseNumber(
        otherTransactionFeesIdx !== -1 ? cols[otherTransactionFeesIdx] : undefined,
        'other transaction fees',
        rowNumber,
      ),
      other: parseNumber(otherIdx !== -1 ? cols[otherIdx] : undefined, 'other', rowNumber),
      total,
    });
  }

  if (rows.length === 0) {
    throw new Error('No transaction rows found in file');
  }

  return { headers, rows };
}

