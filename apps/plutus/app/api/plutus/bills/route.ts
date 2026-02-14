import { NextRequest, NextResponse } from 'next/server';
import {
  fetchBillById,
  fetchBills,
  fetchAccounts,
  updateBill,
  updateBillWithPayload,
  QboAuthError,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';
import { buildAccountComponentMap, extractTrackedLinesFromBill } from '@/lib/plutus/bills/classification';
import {
  buildBillMappingPullSyncUpdates,
  type BillMappingPullSyncCandidate,
} from '@/lib/plutus/bills/pull-sync';
import {
  allocateManufacturingSplitAmounts,
  buildManufacturingDescription,
  isPositiveInteger,
  normalizeManufacturingSplits,
  normalizeSku,
  type ManufacturingSplitInput,
} from '@/lib/plutus/bills/split';

const logger = createLogger({ name: 'plutus-bills' });

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

    const billsById = new Map(billsResult.bills.map((bill) => [bill.Id, bill]));
    const pullSyncUpdates = buildBillMappingPullSyncUpdates(
      mappings as BillMappingPullSyncCandidate[],
      billsById,
    );

    if (pullSyncUpdates.length > 0) {
      const syncedAt = new Date();
      await db.$transaction(
        pullSyncUpdates.map((update) =>
          db.billMapping.update({
            where: { id: update.id },
            data: {
              poNumber: update.poNumber,
              billDate: update.billDate,
              vendorName: update.vendorName,
              totalAmount: update.totalAmount,
              syncedAt,
            },
          }),
        ),
      );

      for (const update of pullSyncUpdates) {
        const existing = mappingsByBillId.get(update.qboBillId);
        if (!existing) continue;
        existing.poNumber = update.poNumber;
        existing.billDate = update.billDate;
        existing.vendorName = update.vendorName;
        existing.totalAmount = update.totalAmount;
        existing.syncedAt = syncedAt;
      }
    }

    // Build response
    const bills = billsResult.bills.map((bill) => {
      const trackedLines = extractTrackedLinesFromBill(bill, accountComponentMap);

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

    if (typeof qboBillId !== 'string' || typeof brandId !== 'string') {
      return NextResponse.json({ error: 'qboBillId and brandId are required' }, { status: 400 });
    }
    const normalizedPoNumber = typeof poNumber === 'string' ? poNumber.trim() : '';

    // Validate brandId exists
    const brand = await db.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: 'Invalid brandId' }, { status: 400 });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
    }

    type SaveLineInput = {
      qboLineId: string;
      component: string;
      amountCents: number;
      sku?: string;
      quantity?: number;
      splits?: Array<{ sku: string; quantity: number }>;
    };

    const parsedLines: SaveLineInput[] = [];
    for (const rawLine of lines as unknown[]) {
      const line = rawLine as Record<string, unknown>;
      if (typeof line.qboLineId !== 'string' || typeof line.component !== 'string') {
        return NextResponse.json({ error: 'Each line must have qboLineId and component' }, { status: 400 });
      }

      if (typeof line.amountCents !== 'number' || !Number.isInteger(line.amountCents) || line.amountCents <= 0) {
        return NextResponse.json({ error: 'Each line must have positive integer amountCents' }, { status: 400 });
      }
      const amountCents = line.amountCents;

      if (line.component === 'manufacturing') {
        const hasSplits = Array.isArray(line.splits) && line.splits.length > 0;
        if (hasSplits) {
          if (line.sku !== undefined || line.quantity !== undefined) {
            return NextResponse.json(
              { error: 'Split manufacturing lines cannot include direct sku/quantity' },
              { status: 400 },
            );
          }
          const normalizedSplits = normalizeManufacturingSplits(line.splits as ManufacturingSplitInput[]);
          parsedLines.push({
            qboLineId: line.qboLineId,
            component: line.component,
            amountCents,
            splits: normalizedSplits,
          });
          continue;
        }

        if (typeof line.sku !== 'string' || line.sku === '' || typeof line.quantity !== 'number' || !isPositiveInteger(line.quantity)) {
          return NextResponse.json(
            { error: 'Manufacturing lines require sku and quantity' },
            { status: 400 },
          );
        }

        parsedLines.push({
          qboLineId: line.qboLineId,
          component: line.component,
          amountCents,
          sku: normalizeSku(line.sku),
          quantity: line.quantity,
        });
        continue;
      }

      if (Array.isArray(line.splits) && line.splits.length > 0) {
        return NextResponse.json({ error: 'Only manufacturing lines support splits' }, { status: 400 });
      }

      const sku = typeof line.sku === 'string' && line.sku !== '' ? normalizeSku(line.sku) : undefined;
      const quantity = typeof line.quantity === 'number' && isPositiveInteger(line.quantity) ? line.quantity : undefined;

      parsedLines.push({
        qboLineId: line.qboLineId,
        component: line.component,
        amountCents,
        sku,
        quantity,
      });
    }

    const hasManufacturingLines = parsedLines.some((line) => line.component === 'manufacturing');
    if (hasManufacturingLines && normalizedPoNumber === '') {
      return NextResponse.json({ error: 'PO number is required when manufacturing lines are present' }, { status: 400 });
    }

    type PersistedLine = {
      qboLineId: string;
      component: string;
      amountCents: number;
      sku: string | null;
      quantity: number | null;
    };

    let persistedLines: PersistedLine[] = parsedLines.map((line) => ({
      qboLineId: line.qboLineId,
      component: line.component,
      amountCents: line.amountCents,
      sku: typeof line.sku === 'string' ? line.sku : null,
      quantity: typeof line.quantity === 'number' ? line.quantity : null,
    }));

    let syncedAt: Date | null = null;
    let connection = await getQboConnection();
    if (connection) {
      const hasSplitLines = parsedLines.some((line) => Array.isArray(line.splits) && line.splits.length > 0);

      if (!hasSplitLines) {
        const lineDescriptions = parsedLines
          .filter((line) => line.component === 'manufacturing')
          .map((line) => ({
            lineId: line.qboLineId,
            description: buildManufacturingDescription(line.sku!, line.quantity!),
          }));

        const { updatedConnection } = await updateBill(connection, qboBillId, {
          privateNote: normalizedPoNumber === '' ? undefined : `PO: ${normalizedPoNumber}`,
          lineDescriptions,
        });
        if (updatedConnection) {
          connection = updatedConnection;
          await saveServerQboConnection(updatedConnection);
        }
      } else {
        const fetchBillResult = await fetchBillById(connection, qboBillId);
        const currentBill = fetchBillResult.bill;
        if (fetchBillResult.updatedConnection) {
          connection = fetchBillResult.updatedConnection;
        }

        const splitByLineId = new Map<string, ReturnType<typeof allocateManufacturingSplitAmounts>>();
        const lineDescriptions = new Map<string, string>();

        for (const line of parsedLines) {
          if (line.component !== 'manufacturing') continue;
          if (Array.isArray(line.splits) && line.splits.length > 0) {
            const sourceLine = (currentBill.Line ?? []).find((candidate) => candidate.Id === line.qboLineId);
            if (!sourceLine || !sourceLine.AccountBasedExpenseLineDetail) {
              throw new Error(`Manufacturing split source line not found in QBO bill: ${line.qboLineId}`);
            }
            const sourceAmountCents = Math.round(sourceLine.Amount * 100);
            if (sourceAmountCents !== line.amountCents) {
              throw new Error(`Bill line amount changed in QBO: ${line.qboLineId}`);
            }
            const allocated = allocateManufacturingSplitAmounts(sourceAmountCents, line.splits);
            splitByLineId.set(line.qboLineId, allocated);
            continue;
          }

          lineDescriptions.set(line.qboLineId, buildManufacturingDescription(line.sku!, line.quantity!));
        }

        const updatedLines: Array<Record<string, unknown>> = [];
        const splitDescriptors: Array<{
          accountId: string;
          lines: ReturnType<typeof allocateManufacturingSplitAmounts>;
        }> = [];

        for (const currentLine of currentBill.Line ?? []) {
          const allocatedSplits = splitByLineId.get(currentLine.Id);
          if (allocatedSplits) {
            if (!currentLine.AccountBasedExpenseLineDetail) {
              throw new Error(`Split source line must be account-based: ${currentLine.Id}`);
            }
            const detail = {
              ...currentLine.AccountBasedExpenseLineDetail,
              AccountRef: {
                value: currentLine.AccountBasedExpenseLineDetail.AccountRef.value,
                name: currentLine.AccountBasedExpenseLineDetail.AccountRef.name,
              },
            };
            splitDescriptors.push({
              accountId: detail.AccountRef.value,
              lines: allocatedSplits,
            });
            for (const splitLine of allocatedSplits) {
              updatedLines.push({
                DetailType: 'AccountBasedExpenseLineDetail',
                Amount: splitLine.amountCents / 100,
                Description: splitLine.description,
                AccountBasedExpenseLineDetail: detail,
              });
            }
            continue;
          }

          const updatedLine: Record<string, unknown> = {
            ...(currentLine as unknown as Record<string, unknown>),
          };
          const description = lineDescriptions.get(currentLine.Id);
          if (description !== undefined) {
            updatedLine.Description = description;
          }
          updatedLines.push(updatedLine);
        }

        const payload: Record<string, unknown> = {
          ...(currentBill as unknown as Record<string, unknown>),
          PrivateNote: normalizedPoNumber === '' ? currentBill.PrivateNote : `PO: ${normalizedPoNumber}`,
          Line: updatedLines,
        };

        const updatedBillResult = await updateBillWithPayload(connection, payload);
        if (updatedBillResult.updatedConnection) {
          connection = updatedBillResult.updatedConnection;
          await saveServerQboConnection(updatedBillResult.updatedConnection);
        }

        const updatedBill = updatedBillResult.bill;
        const candidateLines = (updatedBill.Line ?? [])
          .filter((line) => line.Id && line.AccountBasedExpenseLineDetail)
          .map((line) => ({
            lineId: line.Id,
            accountId: line.AccountBasedExpenseLineDetail!.AccountRef.value,
            amountCents: Math.round(line.Amount * 100),
            description: line.Description ? line.Description : '',
          }));

        const usedLineIds = new Set<string>();
        const splitPersistedLines: PersistedLine[] = [];

        for (const descriptor of splitDescriptors) {
          for (const splitLine of descriptor.lines) {
            const match = candidateLines.find(
              (candidate) =>
                !usedLineIds.has(candidate.lineId) &&
                candidate.accountId === descriptor.accountId &&
                candidate.amountCents === splitLine.amountCents &&
                candidate.description === splitLine.description,
            );
            if (!match) {
              throw new Error(`Failed to resolve QBO line id for split description: ${splitLine.description}`);
            }
            usedLineIds.add(match.lineId);
            splitPersistedLines.push({
              qboLineId: match.lineId,
              component: 'manufacturing',
              amountCents: splitLine.amountCents,
              sku: splitLine.sku,
              quantity: splitLine.quantity,
            });
          }
        }

        const nonSplitPersistedLines = persistedLines.filter((line) => {
          const source = parsedLines.find((candidate) => candidate.qboLineId === line.qboLineId);
          if (!source) return false;
          return !Array.isArray(source.splits) || source.splits.length === 0;
        });

        persistedLines = [...nonSplitPersistedLines, ...splitPersistedLines];
      }

      syncedAt = new Date();
    } else {
      const hasSplitLines = parsedLines.some((line) => Array.isArray(line.splits) && line.splits.length > 0);
      if (hasSplitLines) {
        return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
      }
    }

    const mapping = await db.billMapping.upsert({
      where: { qboBillId },
      create: {
        qboBillId,
        poNumber: normalizedPoNumber,
        brandId,
        billDate: billDate ? String(billDate) : '',
        vendorName: vendorName ? String(vendorName) : '',
        totalAmount: typeof totalAmount === 'number' ? totalAmount : 0,
        syncedAt,
      },
      update: {
        poNumber: normalizedPoNumber,
        brandId,
        billDate: billDate ? String(billDate) : undefined,
        vendorName: vendorName ? String(vendorName) : undefined,
        totalAmount: typeof totalAmount === 'number' ? totalAmount : undefined,
        syncedAt,
      },
    });

    await db.billLineMapping.deleteMany({
      where: { billMappingId: mapping.id },
    });

    await db.billLineMapping.createMany({
      data: persistedLines.map((line) => ({
        billMappingId: mapping.id,
        qboLineId: line.qboLineId,
        component: line.component,
        amountCents: line.amountCents,
        sku: line.sku,
        quantity: line.quantity,
      })),
    });

    if (connection) {
      await saveServerQboConnection(connection);
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
