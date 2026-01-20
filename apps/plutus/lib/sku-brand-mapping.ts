export type BrandSkuMappingRow = {
  sku: string;
  brand: string;
};

export type ParsedSkuBrandMappingCsv = {
  headers: string[];
  rows: BrandSkuMappingRow[];
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

export function parseSkuBrandMappingCsv(content: string): ParsedSkuBrandMappingCsv {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

  if (lines.length < 2) {
    throw new Error('SKU mapping CSV must include a header row and at least one data row');
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const skuIdx = getRequiredIndex(headers, 'sku');
  const brandIdx = getRequiredIndex(headers, 'brand');

  const rows: BrandSkuMappingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const sku = cols[skuIdx]?.trim();
    const brand = cols[brandIdx]?.trim();

    if (!sku || !brand) {
      throw new Error(`Invalid SKU mapping row ${i + 1}: sku and brand are required`);
    }

    rows.push({ sku, brand });
  }

  return { headers, rows };
}
