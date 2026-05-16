import { buildQboInventoryLandedCostPlan, type QboInventoryAssetLineInput } from '@/lib/plutus/qbo-inventory-asset-lines';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { getApiBaseUrl } from '@/lib/qbo/client';
import { getActiveQboConnection, qboQueryAll } from '@/lib/qbo/full-history-audit/fetch';
import { buildQboInventoryItemPayload, buildQboPurchaseOrderPayload } from '@/lib/qbo/inventory-documents';
import { fetchAccounts, fetchBills, getValidToken, type QboAccount, type QboBill, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
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

type QboPurchaseOrder = {
  Id: string;
  DocNumber?: string;
  POStatus?: string;
};

type CreatedQboObject = {
  id: string;
  docNumber?: string;
  name?: string;
};

const MARKETPLACE = 'amazon.com';
const SKU_ORDER = ['CS-007', 'CS-010', 'CS-12LD-7M', 'CS-1SD-32M'];

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
    throw new Error(`QBO inventory PO creation requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
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
      const po = poMatch[1]!.trim();
      const sourceMatch = description.match(/(?:^|; )SOURCE=([^;]+)/);
      const sourceRef = sourceMatch === null ? bill.DocNumber ?? null : sourceMatch[1]!.trim();
      const existing = vendorByPo.get(po);
      if (existing === undefined) {
        vendorByPo.set(po, {
          vendorId,
          vendorName,
          txnDate: bill.TxnDate,
          sourceRefs: new Set(sourceRef === null ? [] : [sourceRef]),
        });
        continue;
      }
      if (existing.vendorId !== vendorId) {
        throw new Error(`PO ${po} has multiple manufacturing vendors: ${existing.vendorName} and ${vendorName}`);
      }
      if (sourceRef !== null) existing.sourceRefs.add(sourceRef);
      if (bill.TxnDate < existing.txnDate) existing.txnDate = bill.TxnDate;
    }
  }
  return vendorByPo;
}

function isLandedPo(componentAmounts: { freight: number; duty: number }): boolean {
  return componentAmounts.freight > 0 && componentAmounts.duty > 0;
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
  entityPath: 'item' | 'purchaseorder';
  responseKey: 'Item' | 'PurchaseOrder';
  payload: Record<string, unknown>;
}): Promise<{ object: Record<string, unknown>; updatedConnection?: QboConnection }> {
  const tokenResult = await getValidToken(input.connection);
  const activeConnection = tokenResult.updatedConnection ?? input.connection;
  const response = await fetch(`${getApiBaseUrl()}/v3/company/${activeConnection.realmId}/${input.entityPath}`, {
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
    throw new Error(`Failed to create QBO ${input.entityPath}: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const created = data[input.responseKey];
  if (typeof created !== 'object' || created === null) {
    throw new Error(`QBO ${input.entityPath} create response did not include ${input.responseKey}`);
  }

  return {
    object: created as Record<string, unknown>,
    updatedConnection: tokenResult.updatedConnection,
  };
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
  const amazonSales = requireAccount(accountsResult.accounts, 'Amazon Sales');
  const cogs = requireAccount(accountsResult.accounts, 'Cost of goods sold');

  const [itemsResult, purchaseOrdersResult, bills] = await Promise.all([
    qboQueryAll(activeConnection, 'SELECT * FROM Item WHERE Active IN (true, false)'),
    qboQueryAll(activeConnection, 'SELECT * FROM PurchaseOrder'),
    fetchAllBills({ connection, startDate: '2025-01-01', endDate: new Date().toISOString().slice(0, 10) }),
  ]);

  const items = itemsResult.rows as QboItem[];
  const purchaseOrders = purchaseOrdersResult.rows as QboPurchaseOrder[];
  const activeItemBySku = buildInventoryItemBySku(items);
  const purchaseOrderByDocNumber = new Map(
    purchaseOrders
      .filter((purchaseOrder) => purchaseOrder.DocNumber !== undefined)
      .map((purchaseOrder) => [purchaseOrder.DocNumber!, purchaseOrder]),
  );

  const landedPlan = buildQboInventoryLandedCostPlan({
    marketplace: MARKETPLACE,
    lines: collectInventoryAssetLines(bills),
  });
  const manufacturingVendorByPo = findManufacturingBillVendorByPo({ bills });

  const layersByPo = new Map<string, typeof landedPlan.layers>();
  for (const layer of landedPlan.layers) {
    const existing = layersByPo.get(layer.internalPo);
    if (existing === undefined) {
      layersByPo.set(layer.internalPo, [layer]);
      continue;
    }
    existing.push(layer);
  }

  const missingItems = SKU_ORDER.filter((sku) => activeItemBySku.get(sku) === undefined);
  const itemCreatePlans = missingItems.map((sku) => ({
    sku,
    payload: buildQboInventoryItemPayload({
      name: sku,
      sku,
      inventoryStartDate: '2025-01-01',
      initialQuantityOnHand: 0,
      assetAccountId: inventoryAsset.Id,
      incomeAccountId: amazonSales.Id,
      expenseAccountId: cogs.Id,
    }),
  }));

  const poCreatePlans = Array.from(layersByPo.entries())
    .sort(([leftPo], [rightPo]) => leftPo.localeCompare(rightPo))
    .map(([internalPo, layers]) => {
      const existingPo = purchaseOrderByDocNumber.get(internalPo);
      const vendor = manufacturingVendorByPo.get(internalPo);
      if (vendor === undefined) throw new Error(`Missing manufacturing vendor for ${internalPo}`);
      const lines = layers
        .slice()
        .sort((left, right) => SKU_ORDER.indexOf(left.sellerSku) - SKU_ORDER.indexOf(right.sellerSku))
        .map((layer) => {
          const item = activeItemBySku.get(layer.sellerSku);
          return {
            layer,
            qboItemId: item?.Id ?? `CREATE:${layer.sellerSku}`,
          };
        });
      const allSourceRefs = Array.from(new Set(layers.flatMap((layer) => layer.sourceRefs))).sort();
      const hasLandedEvidence = layers.every((layer) => isLandedPo(layer.componentAmounts));
      return {
        internalPo,
        existingPoId: existingPo?.Id ?? null,
        status: hasLandedEvidence ? 'Closed' : 'Open',
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        txnDate: vendor.txnDate,
        sourceRefs: allSourceRefs,
        linePlans: lines.map(({ layer, qboItemId }) => ({
          qboItemId,
          sellerSku: layer.sellerSku,
          quantity: layer.quantity,
          unitCost: layer.unitCost,
          totalAmount: layer.totalAmount,
          qboBillLineRefs: layer.qboBillLineRefs,
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

  const dryRun = {
    mode: options.apply ? 'apply' : 'dry-run',
    itemCreatePlans: itemCreatePlans.map((plan) => ({ sku: plan.sku, payload: plan.payload })),
    purchaseOrderCreatePlans: poCreatePlans.map((plan) => ({
      internalPo: plan.internalPo,
      existingPoId: plan.existingPoId,
      status: plan.status,
      vendorName: plan.vendorName,
      txnDate: plan.txnDate,
      sourceRefs: plan.sourceRefs,
      lines: plan.linePlans.map((line) => ({
        sellerSku: line.sellerSku,
        qboItemId: line.qboItemId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        totalAmount: line.totalAmount,
      })),
    })),
    qboInventoryAssetBlocks: landedPlan.blocks,
  };

  console.log(JSON.stringify(dryRun, null, 2));

  if (!options.apply) return;

  const createdItems: CreatedQboObject[] = [];
  for (const plan of itemCreatePlans) {
    const created = await postQboObject({
      connection,
      entityPath: 'item',
      responseKey: 'Item',
      payload: plan.payload,
    });
    if (created.updatedConnection !== undefined) {
      connection = created.updatedConnection;
      await saveServerQboConnection(connection);
    }
    const item = created.object as { Id?: string; Name?: string; Sku?: string };
    if (item.Id === undefined) throw new Error(`Created QBO item for ${plan.sku} did not return Id`);
    createdItems.push({ id: item.Id, name: item.Name, docNumber: item.Sku });
    activeItemBySku.set(plan.sku, { Id: item.Id, Name: item.Name ?? plan.sku, Sku: item.Sku ?? plan.sku, Type: 'Inventory' });
  }

  const createdPurchaseOrders: CreatedQboObject[] = [];
  for (const plan of poCreatePlans) {
    if (plan.existingPoId !== null) continue;
    const payload = buildQboPurchaseOrderPayload({
      vendorId: plan.vendorId,
      txnDate: plan.txnDate,
      docNumber: plan.internalPo,
      privateNote: [
        `INTERNAL PO: ${plan.internalPo}`,
        `BASIS: QBO inventory asset bill lines`,
        `SOURCES: ${plan.sourceRefs.join(',')}`,
      ].join('; '),
      lines: plan.linePlans.map((line) => {
        const qboItemId = activeItemBySku.get(line.sellerSku)?.Id;
        if (qboItemId === undefined) throw new Error(`Missing QBO item id for ${line.sellerSku}`);
        return {
          qboItemId,
          description: line.description,
          quantity: line.quantity,
          unitCost: line.unitCost,
        };
      }),
    });
    const created = await postQboObject({
      connection,
      entityPath: 'purchaseorder',
      responseKey: 'PurchaseOrder',
      payload: {
        ...payload,
        POStatus: plan.status,
      },
    });
    if (created.updatedConnection !== undefined) {
      connection = created.updatedConnection;
      await saveServerQboConnection(connection);
    }
    const purchaseOrder = created.object as { Id?: string; DocNumber?: string };
    if (purchaseOrder.Id === undefined) throw new Error(`Created QBO purchase order ${plan.internalPo} did not return Id`);
    createdPurchaseOrders.push({ id: purchaseOrder.Id, docNumber: purchaseOrder.DocNumber ?? plan.internalPo });
  }

  await saveServerQboConnection(connection);
  console.log(JSON.stringify({ createdItems, createdPurchaseOrders }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
