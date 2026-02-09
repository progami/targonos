import { NextRequest, NextResponse } from 'next/server';
import { fetchBills, fetchAccounts, QboAuthError, type QboAccount } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';

const logger = createLogger({ name: 'plutus-bills' });

type InventoryComponent = 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';

function classifyComponent(account: QboAccount): InventoryComponent | null {
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

    const accountsById = new Map(accountsResult.accounts.map((a) => [a.Id, a]));

    // Fetch all QBO bill IDs from this page to look up mappings
    const qboBillIds = billsResult.bills.map((b) => b.Id);
    const mappings = await db.billMapping.findMany({
      where: { qboBillId: { in: qboBillIds } },
      include: { lines: true },
    });
    const mappingsByBillId = new Map(mappings.map((m) => [m.qboBillId, m]));

    // Build response
    const bills = billsResult.bills.map((bill) => {
      const inventoryLines: Array<{
        lineId: string;
        amount: number;
        description: string;
        account: string;
        accountId: string;
        component: InventoryComponent;
        mappedSku: string | null;
        mappedQuantity: number | null;
      }> = [];

      for (const line of bill.Line ?? []) {
        if (!line.AccountBasedExpenseLineDetail) continue;
        const accountId = line.AccountBasedExpenseLineDetail.AccountRef.value;
        const account = accountsById.get(accountId);
        if (!account) continue;
        const component = classifyComponent(account);
        if (!component) continue;

        const mapping = mappingsByBillId.get(bill.Id);
        const lineMapping = mapping?.lines.find((lm) => lm.qboLineId === line.Id);

        inventoryLines.push({
          lineId: line.Id,
          amount: line.Amount,
          description: line.Description ? line.Description : '',
          account: line.AccountBasedExpenseLineDetail.AccountRef.name,
          accountId,
          component,
          mappedSku: lineMapping ? lineMapping.sku : null,
          mappedQuantity: lineMapping ? lineMapping.quantity : null,
        });
      }

      if (inventoryLines.length === 0) return null;

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
        inventoryLines,
        mapping: mapping
          ? {
              id: mapping.id,
              poNumber: mapping.poNumber,
              syncedAt: mapping.syncedAt,
            }
          : null,
      };
    });

    const inventoryBills = bills.filter((b) => b !== null);

    // Fetch available SKUs for dropdown
    const skus = await db.sku.findMany({
      select: { sku: true, productName: true },
      orderBy: { sku: 'asc' },
    });

    return NextResponse.json({
      bills: inventoryBills,
      skus: skus.map((s) => ({ sku: s.sku, productName: s.productName })),
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
    const { qboBillId, poNumber, billDate, vendorName, totalAmount, lines } = body;

    if (typeof qboBillId !== 'string' || typeof poNumber !== 'string') {
      return NextResponse.json({ error: 'qboBillId and poNumber are required' }, { status: 400 });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
    }

    // Validate lines
    for (const line of lines) {
      if (typeof line.qboLineId !== 'string' || typeof line.component !== 'string') {
        return NextResponse.json({ error: 'Each line must have qboLineId and component' }, { status: 400 });
      }
      if (line.component === 'manufacturing') {
        if (typeof line.sku !== 'string' || !line.sku) {
          return NextResponse.json({ error: 'Manufacturing lines must have a sku' }, { status: 400 });
        }
        if (typeof line.quantity !== 'number' || line.quantity <= 0) {
          return NextResponse.json({ error: 'Manufacturing lines must have a positive quantity' }, { status: 400 });
        }
      }
    }

    // Upsert BillMapping
    const mapping = await db.billMapping.upsert({
      where: { qboBillId },
      create: {
        qboBillId,
        poNumber,
        billDate: billDate ? String(billDate) : '',
        vendorName: vendorName ? String(vendorName) : '',
        totalAmount: typeof totalAmount === 'number' ? totalAmount : 0,
      },
      update: {
        poNumber,
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
      data: lines.map((line: { qboLineId: string; component: string; sku?: string; quantity?: number; amountCents: number }) => ({
        billMappingId: mapping.id,
        qboLineId: line.qboLineId,
        component: line.component,
        sku: line.sku ? line.sku : null,
        quantity: line.quantity ? line.quantity : null,
        amountCents: typeof line.amountCents === 'number' ? line.amountCents : 0,
      })),
    });

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
