import { NextRequest, NextResponse } from 'next/server';
import { fetchBills, fetchAccounts, updateBill, QboAuthError, type QboAccount } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';

const logger = createLogger({ name: 'plutus-bills' });

type BillComponent =
  | 'manufacturing'
  | 'freight'
  | 'duty'
  | 'mfgAccessories'
  | 'warehousing3pl'
  | 'warehouseAmazonFc'
  | 'warehouseAwd'
  | 'productExpenses';

function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

function classifyByInventoryName(account: QboAccount): BillComponent | null {
  if (account.AccountType !== 'Other Current Asset') return null;
  if (account.AccountSubType !== 'Inventory') return null;

  let name = account.Name.trim();
  if (name.startsWith('Inv ')) {
    name = name.slice('Inv '.length).trimStart();
  }

  if (name.startsWith('Manufacturing')) return 'manufacturing';
  if (name.startsWith('Freight')) return 'freight';
  if (name.startsWith('Duty')) return 'duty';
  if (name.startsWith('Mfg Accessories')) return 'mfgAccessories';
  return null;
}

function buildAccountComponentMap(
  accounts: QboAccount[],
  configAccountIds: {
    warehousing3pl?: string | null;
    warehousingAmazonFc?: string | null;
    warehousingAwd?: string | null;
    productExpenses?: string | null;
  },
): Map<string, BillComponent> {
  const map = new Map<string, BillComponent>();

  function mapParentAndDescendants(parentId: string, component: BillComponent) {
    map.set(parentId, component);
    const queue = [parentId];
    const seen = new Set(queue);

    while (queue.length > 0) {
      const currentId = queue.pop();
      if (!currentId) break;

      for (const account of accounts) {
        if (!account.ParentRef) continue;
        if (account.ParentRef.value !== currentId) continue;
        if (seen.has(account.Id)) continue;

        map.set(account.Id, component);
        seen.add(account.Id);
        queue.push(account.Id);
      }
    }
  }

  const parentEntries: Array<{ id: string | null | undefined; component: BillComponent }> = [
    // Warehousing buckets (brand sub-accounts)
    { id: configAccountIds.warehousing3pl, component: 'warehousing3pl' },
    { id: configAccountIds.warehousingAmazonFc, component: 'warehouseAmazonFc' },
    { id: configAccountIds.warehousingAwd, component: 'warehouseAwd' },

    // Brand-level product expenses
    { id: configAccountIds.productExpenses, component: 'productExpenses' },
  ];

  for (const entry of parentEntries) {
    if (!entry.id) continue;
    mapParentAndDescendants(entry.id, entry.component);
  }

  // Map inventory accounts by name matching
  for (const account of accounts) {
    if (map.has(account.Id)) continue;
    const component = classifyByInventoryName(account);
    if (component) {
      map.set(account.Id, component);
    }
  }

  return map;
}

export async function GET(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage ? rawPage : '1', 10);
    const pageSize = parseInt(rawPageSize ? rawPageSize : '50', 10);
    const startPosition = (page - 1) * pageSize + 1;

    // Fetch QBO bills
    const billsResult = await fetchBills(connection, {
      startDate,
      endDate,
      maxResults: pageSize,
      startPosition,
    });
    let activeConnection = billsResult.updatedConnection ? billsResult.updatedConnection : connection;

    // Fetch QBO accounts for classification
    const accountsResult = await fetchAccounts(activeConnection);
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }
    await saveServerQboConnection(activeConnection);

    // Load SetupConfig for warehousing account IDs
    const config = await db.setupConfig.findFirst();
    const accountComponentMap = buildAccountComponentMap(accountsResult.accounts, {
      warehousing3pl: config?.warehousing3pl,
      warehousingAmazonFc: config?.warehousingAmazonFc,
      warehousingAwd: config?.warehousingAwd,
      productExpenses: config?.productExpenses,
    });

    // Fetch all QBO bill IDs from this page to look up mappings
    const qboBillIds = billsResult.bills.map((b) => b.Id);
    const mappings = await db.billMapping.findMany({
      where: { qboBillId: { in: qboBillIds } },
      include: { lines: true },
    });
    const mappingsByBillId = new Map(mappings.map((m) => [m.qboBillId, m]));

    // Build response
    const bills = billsResult.bills.map((bill) => {
      const trackedLines: Array<{
        lineId: string;
        amount: number;
        description: string;
        account: string;
        accountId: string;
        component: BillComponent;
      }> = [];

      for (const line of bill.Line ?? []) {
        if (!line.AccountBasedExpenseLineDetail) continue;
        const accountId = line.AccountBasedExpenseLineDetail.AccountRef.value;
        const component = accountComponentMap.get(accountId);
        if (!component) continue;

        trackedLines.push({
          lineId: line.Id,
          amount: line.Amount,
          description: line.Description ? line.Description : '',
          account: line.AccountBasedExpenseLineDetail.AccountRef.name,
          accountId,
          component,
        });
      }

      if (trackedLines.length === 0) return null;

      const mapping = mappingsByBillId.get(bill.Id);

      return {
        id: bill.Id,
        syncToken: bill.SyncToken,
        date: bill.TxnDate,
        amount: bill.TotalAmt,
        docNumber: bill.DocNumber ? bill.DocNumber : '',
        memo: bill.PrivateNote ? bill.PrivateNote : '',
        vendor: bill.VendorRef ? bill.VendorRef.name : 'Unknown',
        vendorId: bill.VendorRef ? bill.VendorRef.value : undefined,
        inventoryLines: trackedLines,
        mapping: mapping
          ? {
              id: mapping.id,
              poNumber: mapping.poNumber,
              brandId: mapping.brandId,
              syncedAt: mapping.syncedAt,
              lines: mapping.lines.map((l) => ({
                qboLineId: l.qboLineId,
                component: l.component,
                amountCents: l.amountCents,
                sku: l.sku,
                quantity: l.quantity,
              })),
            }
          : null,
      };
    });

    const trackedBills = bills.filter((b) => b !== null);

    // Fetch brands and SKUs for dropdowns
    const brands = await db.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const skus = await db.sku.findMany({
      select: { id: true, sku: true, productName: true, brandId: true },
      orderBy: { sku: 'asc' },
    });

    return NextResponse.json({
      bills: trackedBills,
      realmId: connection.realmId,
      brands,
      skus,
      pagination: {
        page,
        pageSize,
        totalCount: billsResult.totalCount,
        totalPages: Math.ceil(billsResult.totalCount / pageSize),
      },
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to fetch plutus bills', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qboBillId, poNumber, brandId, billDate, vendorName, totalAmount, lines } = body;

    if (typeof qboBillId !== 'string' || typeof poNumber !== 'string' || typeof brandId !== 'string') {
      return NextResponse.json({ error: 'qboBillId, poNumber, and brandId are required' }, { status: 400 });
    }

    // Validate brandId exists
    const brand = await db.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: 'Invalid brandId' }, { status: 400 });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
    }

    // Validate lines
    for (const line of lines) {
      if (typeof line.qboLineId !== 'string' || typeof line.component !== 'string') {
        return NextResponse.json({ error: 'Each line must have qboLineId and component' }, { status: 400 });
      }
    }

    for (const line of lines) {
      if (line.component !== 'manufacturing') continue;
      if (
        typeof line.sku !== 'string' ||
        line.sku === '' ||
        typeof line.quantity !== 'number' ||
        !Number.isFinite(line.quantity) ||
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0
      ) {
        return NextResponse.json(
          { error: 'Manufacturing lines require sku and quantity' },
          { status: 400 },
        );
      }
    }

    // Upsert BillMapping
    const mapping = await db.billMapping.upsert({
      where: { qboBillId },
      create: {
        qboBillId,
        poNumber,
        brandId,
        billDate: billDate ? String(billDate) : '',
        vendorName: vendorName ? String(vendorName) : '',
        totalAmount: typeof totalAmount === 'number' ? totalAmount : 0,
      },
      update: {
        poNumber,
        brandId,
        billDate: billDate ? String(billDate) : undefined,
        vendorName: vendorName ? String(vendorName) : undefined,
        totalAmount: typeof totalAmount === 'number' ? totalAmount : undefined,
        syncedAt: null, // Reset sync status on re-mapping
      },
    });

    // Delete existing line mappings and recreate
    await db.billLineMapping.deleteMany({
      where: { billMappingId: mapping.id },
    });

    await db.billLineMapping.createMany({
      data: lines.map((line: { qboLineId: string; component: string; amountCents: number; sku?: string; quantity?: number }) => ({
        billMappingId: mapping.id,
        qboLineId: line.qboLineId,
        component: line.component,
        amountCents: typeof line.amountCents === 'number' ? line.amountCents : 0,
        sku: typeof line.sku === 'string' && line.sku !== '' ? line.sku : null,
        quantity: typeof line.quantity === 'number' && line.quantity > 0 ? line.quantity : null,
      })),
    });

    // Sync PO number to QBO bill memo
    let syncedAt: Date | null = null;
    const connection = await getQboConnection();
    if (connection) {
      const lineDescriptions = lines
        .filter((l: { component: string }) => l.component === 'manufacturing')
        .map((l: { qboLineId: string; sku: string; quantity: number }) => ({
          lineId: l.qboLineId,
          description: `${normalizeSku(l.sku)} x ${l.quantity} units`,
        }));

      const { updatedConnection } = await updateBill(connection, qboBillId, {
        privateNote: `PO: ${poNumber}`,
        lineDescriptions,
      });
      if (updatedConnection) {
        await saveServerQboConnection(updatedConnection);
      }
      syncedAt = new Date();
      await db.billMapping.update({
        where: { id: mapping.id },
        data: { syncedAt },
      });
    }

    const result = await db.billMapping.findUnique({
      where: { id: mapping.id },
      include: { lines: true },
    });

    return NextResponse.json({ mapping: result });
  } catch (error) {
    logger.error('Failed to save bill mapping', error);
    return NextResponse.json(
      { error: 'Failed to save bill mapping', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
