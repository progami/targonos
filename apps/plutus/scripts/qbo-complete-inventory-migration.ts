import { createHash, randomUUID } from 'node:crypto';

import { normalizeSettlementOperatingMemo } from '@/lib/amazon-finances/settlement-memo-normalization';
import { db } from '@/lib/db';
import { buildQboInventoryLandedCostPlan, type QboInventoryAssetLineInput } from '@/lib/plutus/qbo-inventory-asset-lines';
import { buildSettlementInventoryMovementPlan, type QboInventoryItemMapping } from '@/lib/plutus/qbo-inventory-movements';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { computeProcessingHash } from '@/lib/plutus/settlement-utils';
import {
  deleteJournalEntry,
  fetchAccounts,
  fetchBills,
  fetchJournalEntries,
  getValidToken,
  type QboAccount,
  type QboBill,
  type QboConnection,
  type QboJournalEntry,
} from '@/lib/qbo/api';
import { getApiBaseUrl } from '@/lib/qbo/client';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getActiveQboConnection, qboQueryAll } from '@/lib/qbo/full-history-audit/fetch';
import { buildQboItemBasedBillPayload } from '@/lib/qbo/inventory-documents';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  apply: boolean;
  humanApproval: string | null;
};

type QboItem = {
  Id: string;
  Name: string;
  Sku?: string;
  Type?: string;
  Active?: boolean;
};

type QboDocNumberRow = {
  DocNumber?: string;
};

type QboVendorCredit = {
  Id: string;
  DocNumber?: string;
};

type QboInventoryAdjustment = {
  Id: string;
  DocNumber?: string;
};

type AuditRow = {
  invoiceId: string;
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  net: number;
};

type CreatedObject = {
  id: string;
  docNumber: string;
};

const MARKETPLACE = 'amazon.com';
const MARKET = 'us';
const SKU_ORDER = ['CS-007', 'CS-010', 'CS-12LD-7M', 'CS-1SD-32M'];
const RECEIPT_DOC_PREFIX = 'MIG-R-';
const VENDOR_CREDIT_DOC_PREFIX = 'MIG-VC-';

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let humanApproval: string | null = null;

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }
    if (arg === '--human-approval') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --human-approval');
      humanApproval = next;
      i += 2;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`QBO inventory migration requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, humanApproval };
}

function requireAccount(accounts: QboAccount[], fullyQualifiedName: string): QboAccount {
  const matches = accounts.filter((account) => account.Active !== false && account.FullyQualifiedName === fullyQualifiedName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one active QBO account named ${fullyQualifiedName}; found ${matches.length}`);
  }
  return matches[0]!;
}

function normalizeSku(value: string | undefined): string {
  return value === undefined ? '' : value.trim().toUpperCase();
}

function buildInventoryItemBySku(items: QboItem[]): Map<string, QboItem> {
  const bySku = new Map<string, QboItem>();
  for (const item of items) {
    if (item.Active === false) continue;
    if (item.Type !== 'Inventory') continue;
    const key = normalizeSku(item.Sku ?? item.Name);
    if (key === '') continue;
    bySku.set(key, item);
  }
  return bySku;
}

async function postQboObject(input: {
  connection: QboConnection;
  entityPath: 'bill' | 'vendorcredit' | 'inventoryadjustment';
  responseKey: 'Bill' | 'VendorCredit' | 'InventoryAdjustment';
  payload: Record<string, unknown>;
}): Promise<{ object: Record<string, unknown>; updatedConnection?: QboConnection }> {
  const tokenResult = await getValidToken(input.connection);
  const activeConnection = tokenResult.updatedConnection ?? input.connection;
  const entityUrl = new URL(`${getApiBaseUrl()}/v3/company/${activeConnection.realmId}/${input.entityPath}`);
  if (input.entityPath === 'inventoryadjustment') {
    entityUrl.searchParams.set('minorversion', '75');
  }
  const response = await fetch(entityUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenResult.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create QBO ${input.entityPath}: ${response.status} ${errorText}; payload=${JSON.stringify(input.payload)}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const created = data[input.responseKey];
  if (typeof created !== 'object' || created === null) {
    throw new Error(`QBO ${input.entityPath} create response did not include ${input.responseKey}`);
  }
  return { object: created as Record<string, unknown>, updatedConnection: tokenResult.updatedConnection };
}

async function fetchAllBills(input: { connection: QboConnection; startDate: string; endDate: string }): Promise<QboBill[]> {
  const maxResults = 1000;
  let startPosition = 1;
  let activeConnection = input.connection;
  const bills: QboBill[] = [];

  while (true) {
    const result = await fetchBills(activeConnection, {
      startDate: input.startDate,
      endDate: input.endDate,
      maxResults,
      startPosition,
      includeTotalCount: false,
    });
    if (result.updatedConnection !== undefined) {
      activeConnection = result.updatedConnection;
    }

    bills.push(...result.bills);
    if (result.bills.length < maxResults) break;
    startPosition += result.bills.length;
  }

  if (activeConnection !== input.connection) {
    await saveServerQboConnection(activeConnection);
  }
  return bills;
}

function collectInventoryAssetLines(bills: QboBill[]): QboInventoryAssetLineInput[] {
  const lines: QboInventoryAssetLineInput[] = [];
  for (const bill of bills) {
    for (const line of bill.Line ?? []) {
      const accountName = line.AccountBasedExpenseLineDetail?.AccountRef.name;
      if (accountName === undefined) continue;
      if (accountName !== 'Inventory Asset' && !accountName.startsWith('Inventory Asset:')) continue;
      if (line.Id === undefined) throw new Error(`QBO bill ${bill.Id} has an inventory asset line without line id`);
      lines.push({
        billId: bill.Id,
        ...(bill.DocNumber !== undefined ? { billDocNumber: bill.DocNumber } : {}),
        billDate: bill.TxnDate,
        ...(bill.VendorRef?.name !== undefined ? { vendorName: bill.VendorRef.name } : {}),
        qboLineId: line.Id,
        accountName,
        amount: line.Amount,
        ...(line.Description !== undefined ? { description: line.Description } : {}),
      });
    }
  }
  return lines;
}

function findManufacturingBillVendorByPo(input: {
  bills: QboBill[];
}): Map<string, { vendorId: string; vendorName: string; txnDate: string; sourceRefs: Set<string> }> {
  const vendorByPo = new Map<string, { vendorId: string; vendorName: string; txnDate: string; sourceRefs: Set<string> }>();
  for (const bill of input.bills) {
    const vendorId = bill.VendorRef?.value;
    const vendorName = bill.VendorRef?.name;
    if (vendorId === undefined || vendorName === undefined) continue;
    for (const line of bill.Line ?? []) {
      const description = line.Description ?? '';
      if (!description.startsWith('MFG;')) continue;
      const poMatch = description.match(/(?:^|; )PO=([^;]+)/);
      if (poMatch === null) continue;
      const internalPo = poMatch[1]!.trim();
      const sourceMatch = description.match(/(?:^|; )SOURCE=([^;]+)/);
      const sourceRef = sourceMatch === null ? bill.DocNumber ?? null : sourceMatch[1]!.trim();
      const existing = vendorByPo.get(internalPo);
      if (existing === undefined) {
        vendorByPo.set(internalPo, {
          vendorId,
          vendorName,
          txnDate: bill.TxnDate,
          sourceRefs: new Set(sourceRef === null ? [] : [sourceRef]),
        });
        continue;
      }
      if (existing.vendorId !== vendorId) {
        throw new Error(`PO ${internalPo} has multiple manufacturing vendors: ${existing.vendorName} and ${vendorName}`);
      }
      if (sourceRef !== null) existing.sourceRefs.add(sourceRef);
      if (bill.TxnDate < existing.txnDate) existing.txnDate = bill.TxnDate;
    }
  }
  return vendorByPo;
}

function receiptDocNumber(internalPo: string): string {
  return `${RECEIPT_DOC_PREFIX}${internalPo}`;
}

function vendorCreditDocNumber(internalPo: string): string {
  return `${VENDOR_CREDIT_DOC_PREFIX}${internalPo}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildVendorCreditPayload(input: {
  vendorId: string;
  txnDate: string;
  docNumber: string;
  privateNote: string;
  accountId: string;
  amount: number;
}) {
  return {
    VendorRef: { value: input.vendorId },
    TxnDate: input.txnDate,
    DocNumber: input.docNumber,
    PrivateNote: input.privateNote,
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: input.amount,
        Description: input.privateNote,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: input.accountId },
        },
      },
    ],
  };
}

function isLegacyManualCogsJournalEntry(entry: QboJournalEntry): boolean {
  return entry.Line.some((line) => {
    const description = line.Description ?? '';
    return (
      description.startsWith('Manufacturing COGS |') ||
      description.startsWith('Freight COGS |') ||
      description.startsWith('Duty COGS |') ||
      description.startsWith('Mfg Accessories COGS |')
    );
  });
}

async function fetchAllJournalEntries(input: { connection: QboConnection }): Promise<QboJournalEntry[]> {
  const maxResults = 1000;
  let startPosition = 1;
  let connection = input.connection;
  const entries: QboJournalEntry[] = [];
  while (true) {
    const result = await fetchJournalEntries(connection, {
      maxResults,
      startPosition,
      includeTotalCount: false,
    });
    if (result.updatedConnection !== undefined) connection = result.updatedConnection;
    entries.push(...result.journalEntries);
    if (result.journalEntries.length < maxResults) break;
    startPosition += result.journalEntries.length;
  }
  await saveServerQboConnection(connection);
  return entries;
}

function sourceHashForRows(rows: AuditRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function settlementTxnDate(rows: AuditRow[]): string {
  const dates = rows.map((row) => row.date).sort();
  const last = dates[dates.length - 1];
  if (last === undefined) throw new Error('Cannot determine settlement txn date without rows');
  return last;
}

async function upsertInventoryMappings(input: { mappings: QboInventoryItemMapping[] }): Promise<void> {
  for (const mapping of input.mappings) {
    const id = randomUUID();
    await db.$executeRaw`
      INSERT INTO "QboInventoryItemMapping"
        ("id", "marketplace", "sellerSku", "normalizedSellerSku", "qboItemId", "qboItemName", "active", "createdAt", "updatedAt")
      VALUES
        (${id}, ${mapping.marketplace}, ${mapping.sellerSku}, ${mapping.sellerSku.trim().toUpperCase()}, ${mapping.qboItemId}, ${mapping.sellerSku}, true, now(), now())
      ON CONFLICT ("marketplace", "normalizedSellerSku")
      DO UPDATE SET
        "sellerSku" = EXCLUDED."sellerSku",
        "qboItemId" = EXCLUDED."qboItemId",
        "qboItemName" = EXCLUDED."qboItemName",
        "active" = true,
        "updatedAt" = now()
    `;
  }
}

async function recordInventoryMovementPostings(input: {
  marketplace: string;
  settlementDocNumber: string;
  movementDate: string;
  sourceHash: string;
  adjustmentId: string;
  adjustmentLines: Array<{ sellerSku: string; qboItemId: string; qtyDiff: number }>;
}): Promise<void> {
  for (const line of input.adjustmentLines) {
    const id = randomUUID();
    await db.$executeRaw`
      INSERT INTO "QboInventoryMovementPosting"
        ("id", "marketplace", "settlementDocNumber", "sellerSku", "qboItemId", "qboInventoryAdjustmentId", "quantityDelta", "movementDate", "sourceHash", "status", "createdAt", "updatedAt")
      VALUES
        (${id}, ${input.marketplace}, ${input.settlementDocNumber}, ${line.sellerSku}, ${line.qboItemId}, ${input.adjustmentId}, ${line.qtyDiff}, ${input.movementDate}, ${input.sourceHash}, 'posted', now(), now())
      ON CONFLICT ("marketplace", "settlementDocNumber", "sellerSku")
      DO UPDATE SET
        "qboItemId" = EXCLUDED."qboItemId",
        "qboInventoryAdjustmentId" = EXCLUDED."qboInventoryAdjustmentId",
        "quantityDelta" = EXCLUDED."quantityDelta",
        "movementDate" = EXCLUDED."movementDate",
        "sourceHash" = EXCLUDED."sourceHash",
        "status" = 'posted',
        "updatedAt" = now()
    `;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  loadSharedPlutusEnv();

  let connection = await getQboConnection();
  if (connection === null) throw new Error('QBO connection is not configured');
  const activeConnection = await getActiveQboConnection();
  connection = activeConnection.connection;

  const accountsResult = await fetchAccounts(connection, { includeInactive: true });
  if (accountsResult.updatedConnection !== undefined) {
    connection = accountsResult.updatedConnection;
    await saveServerQboConnection(connection);
  }
  const inventoryAsset = requireAccount(accountsResult.accounts, 'Inventory Asset');
  const inventoryAdjustmentCogs = requireAccount(accountsResult.accounts, 'Inventory COGS Release');

  const [itemsResult, billDocsResult, vendorCreditsResult, adjustmentResult, bills, journalEntries, auditRows] =
    await Promise.all([
      qboQueryAll(activeConnection, 'SELECT * FROM Item WHERE Active IN (true, false)'),
      qboQueryAll(activeConnection, 'SELECT * FROM Bill'),
      qboQueryAll(activeConnection, 'SELECT * FROM VendorCredit'),
      qboQueryAll(activeConnection, 'SELECT * FROM InventoryAdjustment'),
      fetchAllBills({ connection, startDate: '2025-01-01', endDate: new Date().toISOString().slice(0, 10) }),
      fetchAllJournalEntries({ connection }),
      db.auditDataRow.findMany({
        where: { market: { equals: MARKET, mode: 'insensitive' } },
        select: {
          invoiceId: true,
          market: true,
          date: true,
          orderId: true,
          sku: true,
          quantity: true,
          description: true,
          net: true,
        },
        orderBy: [{ date: 'asc' }, { invoiceId: 'asc' }, { sku: 'asc' }],
      }),
    ]);

  const itemBySku = buildInventoryItemBySku(itemsResult.rows as QboItem[]);
  const missingSkus = SKU_ORDER.filter((sku) => itemBySku.get(sku) === undefined);
  if (missingSkus.length > 0) throw new Error(`Missing QBO inventory item mappings for: ${missingSkus.join(', ')}`);

  const mappings: QboInventoryItemMapping[] = SKU_ORDER.map((sku) => ({
    marketplace: MARKETPLACE,
    sellerSku: sku,
    qboItemId: itemBySku.get(sku)!.Id,
  }));

  const landedPlan = buildQboInventoryLandedCostPlan({
    marketplace: MARKETPLACE,
    lines: collectInventoryAssetLines(bills),
  });
  const vendorByPo = findManufacturingBillVendorByPo({ bills });
  const layersByPo = new Map<string, typeof landedPlan.layers>();
  for (const layer of landedPlan.layers) {
    const existing = layersByPo.get(layer.internalPo);
    if (existing === undefined) {
      layersByPo.set(layer.internalPo, [layer]);
    } else {
      existing.push(layer);
    }
  }

  const existingBillDocs = new Set(
    (billDocsResult.rows as QboDocNumberRow[]).map((bill) => bill.DocNumber).filter(Boolean),
  );
  const existingVendorCreditDocs = new Set(
    (vendorCreditsResult.rows as QboVendorCredit[]).map((credit) => credit.DocNumber).filter(Boolean),
  );
  const existingAdjustmentDocs = new Set(
    (adjustmentResult.rows as QboInventoryAdjustment[]).map((adjustment) => adjustment.DocNumber).filter(Boolean),
  );

  const receiptPlans = Array.from(layersByPo.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([internalPo, layers]) => {
      const vendor = vendorByPo.get(internalPo);
      if (vendor === undefined) throw new Error(`Missing manufacturing vendor for ${internalPo}`);
      const sortedLayers = layers.slice().sort((left, right) => SKU_ORDER.indexOf(left.sellerSku) - SKU_ORDER.indexOf(right.sellerSku));
      const sourceRefs = Array.from(new Set(sortedLayers.flatMap((layer) => layer.sourceRefs))).sort();
      const totalAmount = roundMoney(sortedLayers.reduce((sum, layer) => sum + layer.totalAmount, 0));
      return {
        internalPo,
        receiptDocNumber: receiptDocNumber(internalPo),
        vendorCreditDocNumber: vendorCreditDocNumber(internalPo),
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        txnDate: vendor.txnDate,
        sourceRefs,
        totalAmount,
        lines: sortedLayers.map((layer) => ({
          qboItemId: itemBySku.get(layer.sellerSku)!.Id,
          sellerSku: layer.sellerSku,
          quantity: layer.quantity,
          unitCost: layer.unitCost,
          amount: layer.totalAmount,
          description: [
            `INTERNAL PO: ${layer.internalPo}`,
            `SKU: ${layer.sellerSku}`,
            `QTY: ${layer.quantity}`,
            `LANDED_TOTAL: ${layer.totalAmount.toFixed(2)}`,
            `SOURCES: ${layer.sourceRefs.join(',')}`,
            `QBO_BILL_LINES: ${layer.qboBillLineRefs.join(',')}`,
          ].join('; '),
        })),
      };
    });

  const legacyManualCogsEntries = journalEntries.filter(isLegacyManualCogsJournalEntry);
  const rowsByInvoice = new Map<string, AuditRow[]>();
  for (const row of auditRows as AuditRow[]) {
    const existing = rowsByInvoice.get(row.invoiceId);
    if (existing === undefined) rowsByInvoice.set(row.invoiceId, [row]);
    else existing.push(row);
  }

  const movementPlans = Array.from(rowsByInvoice.entries())
    .sort((left, right) => settlementTxnDate(left[1]).localeCompare(settlementTxnDate(right[1])))
    .map(([invoiceId, rows]) => ({
      invoiceId,
      rows,
      plan: buildSettlementInventoryMovementPlan({
        marketplace: MARKETPLACE,
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        adjustmentAccountId: inventoryAdjustmentCogs.Id,
        auditRows: rows,
        itemMappings: mappings,
      }),
    }))
    .filter((entry) => entry.plan.adjustmentLines.length > 0);

  const blockingMovementPlans = movementPlans.filter((entry) => !entry.plan.ok);
  if (blockingMovementPlans.length > 0) {
    throw new Error(
      `Inventory movement plans blocked: ${blockingMovementPlans
        .map((entry) => `${entry.invoiceId}:${entry.plan.blocks.map((block) => block.code).join(',')}`)
        .join('; ')}`,
    );
  }

  const dryRun = {
    mode: options.apply ? 'apply' : 'dry-run',
    mappings,
    receiptPlans: receiptPlans.map((plan) => ({
      internalPo: plan.internalPo,
      receiptDocNumber: plan.receiptDocNumber,
      receiptExists: existingBillDocs.has(plan.receiptDocNumber),
      vendorCreditDocNumber: plan.vendorCreditDocNumber,
      vendorCreditExists: existingVendorCreditDocs.has(plan.vendorCreditDocNumber),
      vendorName: plan.vendorName,
      txnDate: plan.txnDate,
      totalAmount: plan.totalAmount,
      lines: plan.lines.map((line) => ({
        sellerSku: line.sellerSku,
        qboItemId: line.qboItemId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        amount: line.amount,
      })),
    })),
    legacyManualCogsEntries: legacyManualCogsEntries.map((entry) => ({
      id: entry.Id,
      docNumber: entry.DocNumber,
      txnDate: entry.TxnDate,
      totalDebit: roundMoney(
        entry.Line.filter((line) => line.JournalEntryLineDetail.PostingType === 'Debit').reduce(
          (sum, line) => sum + (line.Amount ?? 0),
          0,
        ),
      ),
    })),
    movementPlans: movementPlans.map((entry) => ({
      invoiceId: entry.invoiceId,
      txnDate: settlementTxnDate(entry.rows),
      docNumber: entry.plan.qboInventoryAdjustmentPayload?.DocNumber ?? null,
      exists:
        entry.plan.qboInventoryAdjustmentPayload?.DocNumber === undefined
          ? false
          : existingAdjustmentDocs.has(entry.plan.qboInventoryAdjustmentPayload.DocNumber),
      lines: entry.plan.adjustmentLines,
    })),
  };
  console.log(JSON.stringify(dryRun, null, 2));

  if (!options.apply) return;

  await upsertInventoryMappings({ mappings });

  const createdReceiptBills: CreatedObject[] = [];
  const createdVendorCredits: CreatedObject[] = [];
  for (const plan of receiptPlans) {
    if (!existingBillDocs.has(plan.receiptDocNumber)) {
      const created = await postQboObject({
        connection,
        entityPath: 'bill',
        responseKey: 'Bill',
        payload: buildQboItemBasedBillPayload({
          vendorId: plan.vendorId,
          txnDate: plan.txnDate,
          docNumber: plan.receiptDocNumber,
          privateNote: [
            `QBO INVENTORY MIGRATION RECEIPT`,
            `INTERNAL PO: ${plan.internalPo}`,
            `SOURCES: ${plan.sourceRefs.join(',')}`,
          ].join('; '),
          lines: plan.lines.map((line) => ({
            qboItemId: line.qboItemId,
            description: line.description,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        }) as Record<string, unknown>,
      });
      if (created.updatedConnection !== undefined) connection = created.updatedConnection;
      const bill = created.object as { Id?: string; DocNumber?: string };
      if (bill.Id === undefined) throw new Error(`Created receipt bill ${plan.receiptDocNumber} returned no Id`);
      createdReceiptBills.push({ id: bill.Id, docNumber: bill.DocNumber ?? plan.receiptDocNumber });
    }

    if (!existingVendorCreditDocs.has(plan.vendorCreditDocNumber)) {
      const created = await postQboObject({
        connection,
        entityPath: 'vendorcredit',
        responseKey: 'VendorCredit',
        payload: buildVendorCreditPayload({
          vendorId: plan.vendorId,
          txnDate: plan.txnDate,
          docNumber: plan.vendorCreditDocNumber,
          privateNote: [
            `QBO INVENTORY MIGRATION OFFSET`,
            `INTERNAL PO: ${plan.internalPo}`,
            `OFFSETS RECEIPT: ${plan.receiptDocNumber}`,
          ].join('; '),
          accountId: inventoryAsset.Id,
          amount: plan.totalAmount,
        }),
      });
      if (created.updatedConnection !== undefined) connection = created.updatedConnection;
      const vendorCredit = created.object as { Id?: string; DocNumber?: string };
      if (vendorCredit.Id === undefined) throw new Error(`Created vendor credit ${plan.vendorCreditDocNumber} returned no Id`);
      createdVendorCredits.push({ id: vendorCredit.Id, docNumber: vendorCredit.DocNumber ?? plan.vendorCreditDocNumber });
    }
  }
  await saveServerQboConnection(connection);

  const deletedLegacyCogsEntries: CreatedObject[] = [];
  for (const entry of legacyManualCogsEntries) {
    const deleted = await deleteJournalEntry(connection, entry.Id);
    if (deleted.updatedConnection !== undefined) connection = deleted.updatedConnection;
    deletedLegacyCogsEntries.push({ id: deleted.deletedJournalEntryId, docNumber: entry.DocNumber ?? entry.Id });
  }
  await saveServerQboConnection(connection);

  const createdInventoryAdjustments: CreatedObject[] = [];
  for (const entry of movementPlans) {
    const payload = entry.plan.qboInventoryAdjustmentPayload;
    if (payload === null) continue;
    if (payload.DocNumber !== undefined && existingAdjustmentDocs.has(payload.DocNumber)) continue;
    const created = await postQboObject({
      connection,
      entityPath: 'inventoryadjustment',
      responseKey: 'InventoryAdjustment',
      payload: payload as unknown as Record<string, unknown>,
    });
    if (created.updatedConnection !== undefined) connection = created.updatedConnection;
    const adjustment = created.object as { Id?: string; DocNumber?: string };
    if (adjustment.Id === undefined) throw new Error(`Created inventory adjustment ${payload.DocNumber} returned no Id`);
    createdInventoryAdjustments.push({ id: adjustment.Id, docNumber: adjustment.DocNumber ?? payload.DocNumber ?? adjustment.Id });
    await recordInventoryMovementPostings({
      marketplace: MARKETPLACE,
      settlementDocNumber: entry.invoiceId,
      movementDate: payload.TxnDate,
      sourceHash: `${computeProcessingHash(entry.rows)}:${sourceHashForRows(entry.rows)}`,
      adjustmentId: adjustment.Id,
      adjustmentLines: entry.plan.adjustmentLines,
    });
  }
  await saveServerQboConnection(connection);

  console.log(
    JSON.stringify(
      {
        createdReceiptBills,
        createdVendorCredits,
        deletedLegacyCogsEntries,
        createdInventoryAdjustments,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
