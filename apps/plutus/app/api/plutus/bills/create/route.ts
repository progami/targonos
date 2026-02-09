import { NextRequest, NextResponse } from 'next/server';
import { createBill, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';

const logger = createLogger({ name: 'plutus-bills-create' });

type BillComponent =
  | 'manufacturing'
  | 'freight'
  | 'duty'
  | 'mfgAccessories'
  | 'warehousing3pl'
  | 'warehouseAmazonFc'
  | 'warehouseAwd';

const COMPONENT_ACCOUNT_KEYS: Record<BillComponent, string> = {
  manufacturing: 'invManufacturing',
  freight: 'invFreight',
  duty: 'invDuty',
  mfgAccessories: 'invMfgAccessories',
  warehousing3pl: 'warehousing3pl',
  warehouseAmazonFc: 'warehousingAmazonFc',
  warehouseAwd: 'warehousingAwd',
};

const VALID_COMPONENTS = new Set<string>(Object.keys(COMPONENT_ACCOUNT_KEYS));

export async function POST(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = await req.json();
    const { txnDate, vendorId, poNumber, brandId, lines } = body;

    if (typeof txnDate !== 'string' || txnDate === '') {
      return NextResponse.json({ error: 'txnDate is required' }, { status: 400 });
    }
    if (typeof vendorId !== 'string' || vendorId === '') {
      return NextResponse.json({ error: 'vendorId is required' }, { status: 400 });
    }
    if (typeof poNumber !== 'string' || poNumber === '') {
      return NextResponse.json({ error: 'poNumber is required' }, { status: 400 });
    }
    if (typeof brandId !== 'string' || brandId === '') {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    // Validate brand
    const brand = await db.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: 'Invalid brandId' }, { status: 400 });
    }

    // Load SetupConfig for account IDs
    const config = await db.setupConfig.findFirst();
    if (!config) {
      return NextResponse.json({ error: 'SetupConfig not found. Complete setup first.' }, { status: 400 });
    }

    // Validate and build QBO lines
    const qboLines: Array<{ amount: number; accountId: string; description: string }> = [];
    const mappingLines: Array<{ component: string; amountCents: number; sku: string | null; quantity: number | null }> = [];

    for (const line of lines) {
      if (typeof line.component !== 'string' || !VALID_COMPONENTS.has(line.component)) {
        return NextResponse.json({ error: `Invalid component: ${line.component}` }, { status: 400 });
      }
      if (typeof line.amount !== 'number' || line.amount <= 0) {
        return NextResponse.json({ error: 'Each line must have a positive amount' }, { status: 400 });
      }

      const accountKey = COMPONENT_ACCOUNT_KEYS[line.component as BillComponent];
      const accountId = (config as Record<string, unknown>)[accountKey] as string | null;
      if (!accountId) {
        return NextResponse.json(
          { error: `Account mapping for ${line.component} is not configured. Go to Settings to set up accounts.` },
          { status: 400 },
        );
      }

      // Build description
      let description = '';
      const sku = typeof line.sku === 'string' && line.sku !== '' ? line.sku : null;
      const quantity = typeof line.quantity === 'number' && line.quantity > 0 ? line.quantity : null;

      if (sku && quantity) {
        description = `${sku} x ${quantity} units`;
      } else if (sku) {
        description = sku;
      }

      qboLines.push({
        amount: line.amount,
        accountId,
        description,
      });

      mappingLines.push({
        component: line.component,
        amountCents: Math.round(line.amount * 100),
        sku,
        quantity,
      });
    }

    // Create bill in QBO
    const { bill, updatedConnection } = await createBill(connection, {
      txnDate,
      vendorId,
      privateNote: `PO: ${poNumber}`,
      lines: qboLines,
    });

    if (updatedConnection) {
      await saveServerQboConnection(updatedConnection);
    }

    // Get vendor name from the created bill
    const vendorName = bill.VendorRef?.name ?? '';
    const totalAmount = bill.TotalAmt;

    // Save mapping in Plutus DB
    const mapping = await db.billMapping.create({
      data: {
        qboBillId: bill.Id,
        poNumber,
        brandId,
        billDate: txnDate,
        vendorName,
        totalAmount,
        syncedAt: new Date(),
      },
    });

    // Create line mappings
    const billLines = bill.Line ?? [];
    await db.billLineMapping.createMany({
      data: mappingLines.map((line, index) => ({
        billMappingId: mapping.id,
        qboLineId: billLines[index]?.Id ?? String(index),
        component: line.component,
        amountCents: line.amountCents,
        sku: line.sku,
        quantity: line.quantity,
      })),
    });

    const result = await db.billMapping.findUnique({
      where: { id: mapping.id },
      include: { lines: true },
    });

    return NextResponse.json({ bill, mapping: result });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to create bill', error);
    return NextResponse.json(
      { error: 'Failed to create bill', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
