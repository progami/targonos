import { NextRequest, NextResponse } from 'next/server';
import { createBill, fetchAccounts, fetchVendors, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';
import {
  buildAccountComponentMap,
  type BillComponent,
} from '@/lib/plutus/bills/classification';
import {
  allocateManufacturingSplitAmounts,
  buildManufacturingDescription,
  isPositiveInteger,
  normalizeManufacturingSplits,
  normalizeSku,
  type ManufacturingSplitInput,
} from '@/lib/plutus/bills/split';

const logger = createLogger({ name: 'plutus-bills-create' });

type CreateLineInput = {
  accountId: string;
  amount: number;
  description?: string;
  sku?: string;
  quantity?: number;
  splits?: Array<{ sku: string; quantity: number }>;
};

function mapSetupConfigToTrackedAccountIds(config: {
  warehousing3pl?: string | null;
  warehousingAmazonFc?: string | null;
  warehousingAwd?: string | null;
  productExpenses?: string | null;
}) {
  return {
    warehousing3pl: config.warehousing3pl,
    warehousingAmazonFc: config.warehousingAmazonFc,
    warehousingAwd: config.warehousingAwd,
    productExpenses: config.productExpenses,
  };
}

export async function GET() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let activeConnection = connection;
    const [vendorsResult, accountsResult, config] = await Promise.all([
      fetchVendors(activeConnection),
      fetchAccounts(activeConnection, { includeInactive: false }),
      db.setupConfig.findFirst(),
    ]);

    if (vendorsResult.updatedConnection) {
      activeConnection = vendorsResult.updatedConnection;
    }
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }
    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const accountComponentMap = buildAccountComponentMap(
      accountsResult.accounts,
      mapSetupConfigToTrackedAccountIds({
        warehousing3pl: config?.warehousing3pl,
        warehousingAmazonFc: config?.warehousingAmazonFc,
        warehousingAwd: config?.warehousingAwd,
        productExpenses: config?.productExpenses,
      }),
    );

    const vendors = vendorsResult.vendors
      .map((vendor) => ({
        id: vendor.Id,
        name: vendor.DisplayName,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const accounts = accountsResult.accounts
      .filter((account) => account.Active !== false)
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName ? account.FullyQualifiedName : account.Name,
        type: account.AccountType,
        subType: account.AccountSubType ? account.AccountSubType : null,
        component: accountComponentMap.get(account.Id) ?? null,
      }))
      .sort((left, right) => left.fullyQualifiedName.localeCompare(right.fullyQualifiedName));

    return NextResponse.json({ vendors, accounts });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to load bill creation context', error);
    return NextResponse.json(
      { error: 'Failed to load bill creation context', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
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

    if (typeof txnDate !== 'string' || txnDate.trim() === '') {
      return NextResponse.json({ error: 'txnDate is required' }, { status: 400 });
    }
    if (typeof vendorId !== 'string' || vendorId.trim() === '') {
      return NextResponse.json({ error: 'vendorId is required' }, { status: 400 });
    }
    if (typeof poNumber !== 'string' || poNumber.trim() === '') {
      return NextResponse.json({ error: 'poNumber is required' }, { status: 400 });
    }
    if (typeof brandId !== 'string' || brandId.trim() === '') {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const brand = await db.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: 'Invalid brandId' }, { status: 400 });
    }

    let activeConnection = connection;
    const [accountsResult, config] = await Promise.all([
      fetchAccounts(activeConnection, { includeInactive: true }),
      db.setupConfig.findFirst(),
    ]);
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }

    const accountById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));
    const accountComponentMap = buildAccountComponentMap(
      accountsResult.accounts,
      mapSetupConfigToTrackedAccountIds({
        warehousing3pl: config?.warehousing3pl,
        warehousingAmazonFc: config?.warehousingAmazonFc,
        warehousingAwd: config?.warehousingAwd,
        productExpenses: config?.productExpenses,
      }),
    );

    const qboLines: Array<{ amount: number; accountId: string; description: string }> = [];
    const mappingLines: Array<{ component: BillComponent; amountCents: number; sku: string | null; quantity: number | null }> = [];

    for (const rawLine of lines as unknown[]) {
      const line = rawLine as Partial<CreateLineInput>;
      if (typeof line.accountId !== 'string' || line.accountId.trim() === '') {
        return NextResponse.json({ error: 'Each line must include accountId' }, { status: 400 });
      }
      if (typeof line.amount !== 'number' || !Number.isFinite(line.amount) || line.amount <= 0) {
        return NextResponse.json({ error: 'Each line must include a positive amount' }, { status: 400 });
      }

      const account = accountById.get(line.accountId);
      if (!account) {
        return NextResponse.json({ error: `Invalid accountId: ${line.accountId}` }, { status: 400 });
      }

      const component = accountComponentMap.get(line.accountId) ?? null;
      const lineAmountCents = Math.round(line.amount * 100);

      if (component === 'manufacturing') {
        const hasSplits = Array.isArray(line.splits) && line.splits.length > 0;

        if (hasSplits) {
          if (line.sku !== undefined || line.quantity !== undefined) {
            return NextResponse.json(
              { error: 'Split manufacturing lines cannot include direct sku/quantity' },
              { status: 400 },
            );
          }
          const normalizedSplits = normalizeManufacturingSplits(line.splits as ManufacturingSplitInput[]);
          const allocatedLines = allocateManufacturingSplitAmounts(lineAmountCents, normalizedSplits);
          for (const allocatedLine of allocatedLines) {
            qboLines.push({
              amount: allocatedLine.amountCents / 100,
              accountId: line.accountId,
              description: allocatedLine.description,
            });
            mappingLines.push({
              component: 'manufacturing',
              amountCents: allocatedLine.amountCents,
              sku: allocatedLine.sku,
              quantity: allocatedLine.quantity,
            });
          }
          continue;
        }

        if (typeof line.sku !== 'string' || line.sku.trim() === '' || typeof line.quantity !== 'number' || !isPositiveInteger(line.quantity)) {
          return NextResponse.json({ error: 'Manufacturing lines require sku and quantity' }, { status: 400 });
        }

        const normalizedSku = normalizeSku(line.sku);
        qboLines.push({
          amount: line.amount,
          accountId: line.accountId,
          description: buildManufacturingDescription(normalizedSku, line.quantity),
        });
        mappingLines.push({
          component: 'manufacturing',
          amountCents: lineAmountCents,
          sku: normalizedSku,
          quantity: line.quantity,
        });
        continue;
      }

      if (Array.isArray(line.splits) && line.splits.length > 0) {
        return NextResponse.json({ error: 'Only manufacturing lines support splits' }, { status: 400 });
      }

      const description = typeof line.description === 'string' && line.description.trim() !== ''
        ? line.description.trim()
        : account.FullyQualifiedName ? account.FullyQualifiedName : account.Name;
      qboLines.push({
        amount: line.amount,
        accountId: line.accountId,
        description,
      });

      if (component) {
        mappingLines.push({
          component,
          amountCents: lineAmountCents,
          sku: null,
          quantity: null,
        });
      }
    }

    const createResult = await createBill(activeConnection, {
      txnDate,
      vendorId,
      privateNote: `PO: ${poNumber.trim()}`,
      lines: qboLines,
    });
    let finalConnection = activeConnection;
    if (createResult.updatedConnection) {
      finalConnection = createResult.updatedConnection;
    }
    if (finalConnection !== connection) {
      await saveServerQboConnection(finalConnection);
    }

    let mappingResult: {
      id: string;
      qboBillId: string;
      poNumber: string;
      brandId: string;
      billDate: string;
      vendorName: string;
      totalAmount: number;
      syncedAt: Date | null;
      lines: Array<{
        qboLineId: string;
        component: string;
        amountCents: number;
        sku: string | null;
        quantity: number | null;
      }>;
    } | null = null;

    if (mappingLines.length > 0) {
      const mapping = await db.billMapping.create({
        data: {
          qboBillId: createResult.bill.Id,
          poNumber: poNumber.trim(),
          brandId,
          billDate: txnDate,
          vendorName: createResult.bill.VendorRef?.name ? createResult.bill.VendorRef.name : '',
          totalAmount: createResult.bill.TotalAmt,
          syncedAt: new Date(),
        },
      });

      const billLines = createResult.bill.Line ?? [];
      await db.billLineMapping.createMany({
        data: mappingLines.map((line, index) => ({
          billMappingId: mapping.id,
          qboLineId: billLines[index]?.Id ? billLines[index].Id : String(index),
          component: line.component,
          amountCents: line.amountCents,
          sku: line.sku,
          quantity: line.quantity,
        })),
      });

      mappingResult = await db.billMapping.findUnique({
        where: { id: mapping.id },
        include: { lines: true },
      });
    }

    return NextResponse.json({
      bill: createResult.bill,
      mapping: mappingResult,
    });
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
