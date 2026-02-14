import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { allocateByWeight } from '@/lib/inventory/money';
import {
  fetchAccounts,
  fetchPurchaseById,
  QboAuthError,
  updatePurchaseWithPayload,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { buildPurchaseAllocationDescription, normalizePurchaseRegion, normalizePurchaseSku } from '@/lib/plutus/purchases/description';

const logger = createLogger({ name: 'plutus-purchases-map' });

type PurchaseSplitInput = {
  sku: string;
  region: string;
  quantity: number;
};

type PurchaseLineInput = {
  qboLineId: string;
  accountId: string;
  amountCents: number;
  sku?: string;
  region?: string;
  quantity?: number;
  splits?: PurchaseSplitInput[];
};

type NormalizedSplit = {
  sku: string;
  region: string;
  quantity: number;
};

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function normalizeSplitRows(splits: PurchaseSplitInput[]): NormalizedSplit[] {
  if (splits.length < 2) {
    throw new Error('Split requires at least two rows');
  }

  const normalized: NormalizedSplit[] = [];
  const seen = new Set<string>();

  for (const split of splits) {
    if (typeof split.sku !== 'string' || split.sku.trim() === '') {
      throw new Error('Split sku is required');
    }
    if (typeof split.region !== 'string' || split.region.trim() === '') {
      throw new Error('Split region is required');
    }
    if (!isPositiveInteger(split.quantity)) {
      throw new Error('Split quantity must be a positive integer');
    }

    const normalizedSku = normalizePurchaseSku(split.sku);
    const normalizedRegion = normalizePurchaseRegion(split.region);
    const uniqueKey = `${normalizedSku}::${normalizedRegion}`;
    if (seen.has(uniqueKey)) {
      throw new Error(`Duplicate split allocation: ${normalizedSku} ${normalizedRegion}`);
    }
    seen.add(uniqueKey);

    normalized.push({
      sku: normalizedSku,
      region: normalizedRegion,
      quantity: split.quantity,
    });
  }

  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qboPurchaseId, lines } = body;

    if (typeof qboPurchaseId !== 'string' || qboPurchaseId.trim() === '') {
      return NextResponse.json({ error: 'qboPurchaseId is required' }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
    }

    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let activeConnection = connection;
    const purchaseResult = await fetchPurchaseById(activeConnection, qboPurchaseId);
    if (purchaseResult.updatedConnection) {
      activeConnection = purchaseResult.updatedConnection;
    }

    const accountsResult = await fetchAccounts(activeConnection, { includeInactive: true });
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }
    const accountsById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));

    const splitByLineId = new Map<string, { accountId: string; amountCents: number; splits: NormalizedSplit[] }>();
    const singleByLineId = new Map<string, { accountId: string; amountCents: number; sku: string; region: string; quantity: number }>();

    for (const rawLine of lines as unknown[]) {
      const line = rawLine as Partial<PurchaseLineInput>;
      if (typeof line.qboLineId !== 'string' || line.qboLineId.trim() === '') {
        return NextResponse.json({ error: 'Each line requires qboLineId' }, { status: 400 });
      }
      if (typeof line.accountId !== 'string' || line.accountId.trim() === '') {
        return NextResponse.json({ error: 'Each line requires accountId' }, { status: 400 });
      }
      if (!accountsById.has(line.accountId)) {
        return NextResponse.json({ error: `Invalid accountId: ${line.accountId}` }, { status: 400 });
      }
      if (typeof line.amountCents !== 'number' || !isPositiveInteger(line.amountCents)) {
        return NextResponse.json({ error: 'Each line requires positive integer amountCents' }, { status: 400 });
      }
      if (splitByLineId.has(line.qboLineId) || singleByLineId.has(line.qboLineId)) {
        return NextResponse.json({ error: `Duplicate qboLineId in payload: ${line.qboLineId}` }, { status: 400 });
      }

      if (Array.isArray(line.splits) && line.splits.length > 0) {
        if (line.sku !== undefined || line.region !== undefined || line.quantity !== undefined) {
          return NextResponse.json(
            { error: 'Split lines cannot include direct sku/region/quantity fields' },
            { status: 400 },
          );
        }

        let normalizedSplits: NormalizedSplit[];
        try {
          normalizedSplits = normalizeSplitRows(line.splits);
        } catch (error) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 400 },
          );
        }

        splitByLineId.set(line.qboLineId, {
          accountId: line.accountId,
          amountCents: line.amountCents,
          splits: normalizedSplits,
        });
        continue;
      }

      if (typeof line.sku !== 'string' || line.sku.trim() === '') {
        return NextResponse.json({ error: 'Single lines require sku' }, { status: 400 });
      }
      if (typeof line.region !== 'string' || line.region.trim() === '') {
        return NextResponse.json({ error: 'Single lines require region' }, { status: 400 });
      }
      if (typeof line.quantity !== 'number' || !isPositiveInteger(line.quantity)) {
        return NextResponse.json({ error: 'Single lines require positive integer quantity' }, { status: 400 });
      }

      singleByLineId.set(line.qboLineId, {
        accountId: line.accountId,
        amountCents: line.amountCents,
        sku: normalizePurchaseSku(line.sku),
        region: normalizePurchaseRegion(line.region),
        quantity: line.quantity,
      });
    }

    const updatedLines: Array<Record<string, unknown>> = [];
    const seenInputLineIds = new Set<string>();

    for (const currentLine of purchaseResult.purchase.Line ?? []) {
      const splitInput = splitByLineId.get(currentLine.Id);
      const singleInput = singleByLineId.get(currentLine.Id);

      if (!splitInput && !singleInput) {
        updatedLines.push(currentLine as unknown as Record<string, unknown>);
        continue;
      }
      if (!currentLine.AccountBasedExpenseLineDetail) {
        return NextResponse.json(
          { error: `Line ${currentLine.Id} is not account-based and cannot be mapped` },
          { status: 400 },
        );
      }

      const currentAmountCents = Math.round(currentLine.Amount * 100);

      if (splitInput) {
        seenInputLineIds.add(currentLine.Id);
        if (currentAmountCents !== splitInput.amountCents) {
          return NextResponse.json(
            { error: `Line amount changed in QBO for ${currentLine.Id}. Refresh and try again.` },
            { status: 409 },
          );
        }

        const allocation = allocateByWeight(
          splitInput.amountCents,
          splitInput.splits.map((split, index) => ({
            key: String(index),
            weight: split.quantity,
          })),
        );

        const account = accountsById.get(splitInput.accountId);
        if (!account) {
          throw new Error(`Missing account during split write: ${splitInput.accountId}`);
        }
        const detail = {
          ...currentLine.AccountBasedExpenseLineDetail,
          AccountRef: {
            value: account.Id,
            name: account.Name,
          },
        };

        for (let index = 0; index < splitInput.splits.length; index += 1) {
          const split = splitInput.splits[index];
          const splitAmountCents = allocation[String(index)];
          if (splitAmountCents === undefined) {
            throw new Error(`Missing split allocation for line ${currentLine.Id} at index ${index}`);
          }

          updatedLines.push({
            DetailType: 'AccountBasedExpenseLineDetail',
            Amount: splitAmountCents / 100,
            Description: buildPurchaseAllocationDescription(split.sku, split.region, split.quantity),
            AccountBasedExpenseLineDetail: detail,
          });
        }
        continue;
      }

      seenInputLineIds.add(currentLine.Id);
      if (!singleInput) {
        throw new Error(`Missing single input for line ${currentLine.Id}`);
      }
      if (currentAmountCents !== singleInput.amountCents) {
        return NextResponse.json(
          { error: `Line amount changed in QBO for ${currentLine.Id}. Refresh and try again.` },
          { status: 409 },
        );
      }

      const account = accountsById.get(singleInput.accountId);
      if (!account) {
        throw new Error(`Missing account during write: ${singleInput.accountId}`);
      }
      updatedLines.push({
        ...(currentLine as unknown as Record<string, unknown>),
        Description: buildPurchaseAllocationDescription(singleInput.sku, singleInput.region, singleInput.quantity),
        AccountBasedExpenseLineDetail: {
          ...currentLine.AccountBasedExpenseLineDetail,
          AccountRef: {
            value: account.Id,
            name: account.Name,
          },
        },
      });
    }

    for (const lineId of splitByLineId.keys()) {
      if (!seenInputLineIds.has(lineId)) {
        return NextResponse.json({ error: `Line not found in purchase: ${lineId}` }, { status: 400 });
      }
    }
    for (const lineId of singleByLineId.keys()) {
      if (!seenInputLineIds.has(lineId)) {
        return NextResponse.json({ error: `Line not found in purchase: ${lineId}` }, { status: 400 });
      }
    }

    const payload: Record<string, unknown> = {
      ...(purchaseResult.purchase as unknown as Record<string, unknown>),
      Line: updatedLines,
    };

    const updateResult = await updatePurchaseWithPayload(activeConnection, payload);
    if (updateResult.updatedConnection) {
      activeConnection = updateResult.updatedConnection;
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({ purchase: updateResult.purchase });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to map purchase lines', error);
    return NextResponse.json(
      { error: 'Failed to map purchase lines', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
