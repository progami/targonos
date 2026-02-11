import { NextRequest, NextResponse } from 'next/server';
import { createBill, fetchAccounts, QboAuthError, type QboAccount } from '@/lib/qbo/api';
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
  | 'warehouseAwd'
  | 'productExpenses';

const COMPONENT_ACCOUNT_KEYS: Record<BillComponent, string> = {
  manufacturing: 'invManufacturing',
  freight: 'invFreight',
  duty: 'invDuty',
  mfgAccessories: 'invMfgAccessories',
  warehousing3pl: 'warehousing3pl',
  warehouseAmazonFc: 'warehousingAmazonFc',
  warehouseAwd: 'warehousingAwd',
  productExpenses: 'productExpenses',
};

const VALID_COMPONENTS = new Set<string>(Object.keys(COMPONENT_ACCOUNT_KEYS));

function findSubAccountByParentId(accounts: QboAccount[], parentAccountId: string, name: string): QboAccount | undefined {
  return accounts.find((a) => a.ParentRef?.value === parentAccountId && a.Name === name);
}

function getBrandSubAccountName(component: BillComponent, brandName: string): string {
  switch (component) {
    case 'manufacturing':
      return `Manufacturing - ${brandName}`;
    case 'freight':
      return `Freight - ${brandName}`;
    case 'duty':
      return `Duty - ${brandName}`;
    case 'mfgAccessories':
      return `Mfg Accessories - ${brandName}`;
    case 'warehousing3pl':
    case 'warehouseAmazonFc':
    case 'warehouseAwd':
      return brandName;
    case 'productExpenses':
      return `Product Expenses - ${brandName}`;
  }
}

function getComponentDefaultDescription(component: BillComponent): string {
  switch (component) {
    case 'manufacturing':
      return 'Manufacturing';
    case 'freight':
      return 'Freight';
    case 'duty':
      return 'Duty';
    case 'mfgAccessories':
      return 'Mfg Accessories';
    case 'warehousing3pl':
      return '3PL Warehousing';
    case 'warehouseAmazonFc':
      return 'Amazon FC Warehousing';
    case 'warehouseAwd':
      return 'AWD Warehousing';
    case 'productExpenses':
      return 'Product Expenses';
  }
}

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

    if (config.accountsCreated !== true) {
      return NextResponse.json(
        { error: 'Plutus QBO accounts are not created yet. Go to Setup and click Create Accounts.' },
        { status: 400 },
      );
    }

    let activeConnection = connection;
    const accountsResult = await fetchAccounts(activeConnection);
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
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
      const parentAccountId = (config as Record<string, unknown>)[accountKey] as string | null;
      if (!parentAccountId) {
        return NextResponse.json(
          { error: `Account mapping for ${line.component} is not configured. Go to Settings to set up accounts.` },
          { status: 400 },
        );
      }

      const brandSubAccountName = getBrandSubAccountName(line.component as BillComponent, brand.name);
      const subAccount = findSubAccountByParentId(accountsResult.accounts, parentAccountId, brandSubAccountName);
      if (!subAccount) {
        return NextResponse.json(
          {
            error: `Missing QBO brand sub-account: "${brandSubAccountName}" (parentAccountId=${parentAccountId}). Run Setup → Create Accounts.`,
          },
          { status: 400 },
        );
      }

      // Build description
      let description = getComponentDefaultDescription(line.component as BillComponent);
      const sku = typeof line.sku === 'string' && line.sku !== '' ? line.sku : null;
      const quantity =
        typeof line.quantity === 'number' &&
        Number.isFinite(line.quantity) &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0
          ? line.quantity
          : null;

      if (line.component === 'manufacturing' && (!sku || !quantity)) {
        return NextResponse.json(
          { error: 'Manufacturing lines require sku and quantity' },
          { status: 400 },
        );
      }

      if (sku && quantity) {
        description = `${sku} x ${quantity} units`;
      } else if (sku) {
        description = sku;
      }

      qboLines.push({
        amount: line.amount,
        accountId: subAccount.Id,
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
    const { bill, updatedConnection } = await createBill(activeConnection, {
      txnDate,
      vendorId,
      privateNote: `PO: ${poNumber}`,
      lines: qboLines,
    });

    if (updatedConnection) {
      activeConnection = updatedConnection;
    }
    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
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
