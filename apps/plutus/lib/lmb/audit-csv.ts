export type LmbAuditRow = {
  invoice: string;
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  net: number;
};

export type ParsedLmbAuditCsv = {
  headers: string[];
  rows: LmbAuditRow[];
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

function getRequiredIndex(headers: string[], name: string): number {
  const idx = headers.indexOf(name);
  if (idx === -1) {
    throw new Error(`Missing required CSV column: ${name}`);
  }
  return idx;
}

export function parseLmbAuditCsv(content: string): ParsedLmbAuditCsv {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const invoiceIdx = getRequiredIndex(headers, 'Invoice');
  const marketIdx = getRequiredIndex(headers, 'market');
  const dateIdx = getRequiredIndex(headers, 'date');
  const orderIdIdx = getRequiredIndex(headers, 'Order Id');
  const skuIdx = getRequiredIndex(headers, 'Sku');
  const quantityIdx = getRequiredIndex(headers, 'Quantity');
  const descriptionIdx = getRequiredIndex(headers, 'LMB Line Description');
  const netIdx = getRequiredIndex(headers, 'Net');

  const rows: LmbAuditRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);

    const invoice = cols[invoiceIdx]?.trim();
    const market = cols[marketIdx]?.trim();
    const date = cols[dateIdx]?.trim();
    const orderId = cols[orderIdIdx]?.trim();
    const sku = cols[skuIdx]?.trim();
    const quantityRaw = cols[quantityIdx]?.trim();
    const description = cols[descriptionIdx]?.trim();
    const netRaw = cols[netIdx]?.trim();

    if (!invoice || !market || !date || !orderId || !description || !netRaw) {
      throw new Error(`Invalid CSV row ${i + 1}: missing required field`);
    }

    const quantity = quantityRaw === '' ? 0 : Number(quantityRaw);
    if (!Number.isFinite(quantity)) {
      throw new Error(`Invalid CSV row ${i + 1}: Quantity is not a number`);
    }

    const net = Number(netRaw);
    if (!Number.isFinite(net)) {
      throw new Error(`Invalid CSV row ${i + 1}: Net is not a number`);
    }

    rows.push({
      invoice,
      market,
      date,
      orderId,
      sku: sku ? sku : '',
      quantity,
      description,
      net,
    });
  }

  return { headers, rows };
}
