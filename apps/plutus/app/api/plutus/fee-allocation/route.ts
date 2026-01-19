import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseLmbAuditCsv } from '@/lib/lmb/audit-csv';
import { computeFeeAllocation } from '@/lib/fee-allocation';

export const runtime = 'nodejs';

type BrandMapInput = {
  skus: Array<{ sku: string; brand: string }>;
};

function makeBrandMap(input: BrandMapInput) {
  const skuToBrand = new Map<string, string>();
  const brandSet = new Set<string>();

  for (const row of input.skus) {
    const sku = row.sku.trim();
    const brand = row.brand.trim();

    if (sku === '' || brand === '') {
      throw new Error('Invalid SKU mapping: sku and brand are required');
    }

    const existing = skuToBrand.get(sku);
    if (existing !== undefined && existing !== brand) {
      throw new Error(`SKU maps to multiple brands: ${sku}`);
    }

    skuToBrand.set(sku, brand);
    brandSet.add(brand);
  }

  return {
    getBrandForSku: (sku: string) => {
      const brand = skuToBrand.get(sku);
      if (!brand) {
        throw new Error(`SKU not mapped to brand: ${sku}`);
      }
      return brand;
    },
    getAllBrands: () => Array.from(brandSet.values()).sort(),
  };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  const mappingRaw = formData.get('mapping');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (typeof mappingRaw !== 'string') {
    return NextResponse.json({ error: 'Missing mapping' }, { status: 400 });
  }

  const mapping = JSON.parse(mappingRaw) as BrandMapInput;
  const brandMap = makeBrandMap(mapping);

  const fileName = file.name.toLowerCase();
  let parsed: ReturnType<typeof parseLmbAuditCsv>;

  if (fileName.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const unzipped = unzipSync(bytes);

    const entries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
    if (entries.length !== 1) {
      throw new Error(`ZIP must contain exactly one .csv (found ${entries.length})`);
    }

    const [innerName, raw] = entries[0];
    const csvText = strFromU8(raw);
    parsed = parseLmbAuditCsv(csvText);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Parsed ZIP CSV: ${innerName}`);
    }
  } else {
    const csvText = await file.text();
    parsed = parseLmbAuditCsv(csvText);
  }

  const invoiceGroups = new Map<string, typeof parsed.rows>();
  for (const row of parsed.rows) {
    const group = invoiceGroups.get(row.invoice);
    if (!group) {
      invoiceGroups.set(row.invoice, [row]);
    } else {
      group.push(row);
    }
  }

  if (invoiceGroups.size !== 1) {
    return NextResponse.json(
      {
        error: 'CSV must contain exactly one Invoice for v1 allocation',
        invoices: Array.from(invoiceGroups.keys()),
      },
      { status: 400 },
    );
  }

  const rows = Array.from(invoiceGroups.values())[0];
  const allocation = computeFeeAllocation(rows, brandMap);

  return NextResponse.json({ allocation });
}
