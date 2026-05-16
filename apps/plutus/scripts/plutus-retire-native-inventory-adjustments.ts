import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { getApiBaseUrl } from '@/lib/qbo/client';
import { getValidToken, type QboConnection } from '@/lib/qbo/api';
import { saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getActiveQboConnection, qboQueryAll } from '@/lib/qbo/full-history-audit/fetch';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  apply: boolean;
  humanApproval: string | null;
  marketplace: 'amazon.com';
};

type QboInventoryAdjustment = {
  Id?: string;
  SyncToken?: string;
  DocNumber?: string;
  TxnDate?: string;
  PrivateNote?: string;
  Line?: Array<{
    ItemAdjustmentLineDetail?: {
      ItemRef?: { value?: string; name?: string };
      QtyDiff?: number;
    };
  }>;
};

type PlutusNativeInventoryAdjustment = {
  id: string;
  syncToken: string;
  docNumber: string;
  txnDate: string;
  settlementDocNumber: string;
  marketplace: 'amazon.com';
  quantityDelta: number;
  lines: Array<{ itemName: string; quantityDelta: number }>;
  privateNote: string;
};

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let humanApproval: string | null = null;
  const marketplace = 'amazon.com';

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
    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --marketplace');
      if (next !== marketplace) throw new Error(`Unsupported marketplace for native inventory retirement: ${next}`);
      i += 2;
      continue;
    }
    if (arg.startsWith('--marketplace=')) {
      const next = arg.slice('--marketplace='.length);
      if (next !== marketplace) throw new Error(`Unsupported marketplace for native inventory retirement: ${next}`);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`Native inventory retirement requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, humanApproval, marketplace };
}

function parsePlutusAdjustment(adjustment: QboInventoryAdjustment): {
  settlementDocNumber: string;
  marketplace: 'amazon.com';
} | null {
  const privateNote = adjustment.PrivateNote?.trim();
  if (privateNote === undefined || privateNote === '') return null;

  const match = /^Plutus inventory movement \| Settlement: (US-\d{6}-\d{6}-S\d+) \| Marketplace: (amazon\.com)$/.exec(
    privateNote,
  );
  if (match === null) return null;

  return {
    settlementDocNumber: match[1]!,
    marketplace: 'amazon.com',
  };
}

function requirePlutusNativeInventoryAdjustment(
  adjustment: QboInventoryAdjustment,
): PlutusNativeInventoryAdjustment | null {
  const parsed = parsePlutusAdjustment(adjustment);
  if (parsed === null) return null;

  if (adjustment.Id === undefined || adjustment.Id.trim() === '') {
    throw new Error(`Plutus InventoryAdjustment for ${parsed.settlementDocNumber} is missing Id`);
  }
  if (adjustment.SyncToken === undefined || adjustment.SyncToken.trim() === '') {
    throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} is missing SyncToken`);
  }
  if (adjustment.DocNumber === undefined || !adjustment.DocNumber.startsWith('IA-')) {
    throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} has unsupported DocNumber ${adjustment.DocNumber ?? ''}`);
  }
  if (adjustment.TxnDate === undefined || adjustment.TxnDate.trim() === '') {
    throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} is missing TxnDate`);
  }
  if (adjustment.PrivateNote === undefined || adjustment.PrivateNote.trim() === '') {
    throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} is missing PrivateNote`);
  }

  const lines = (adjustment.Line ?? []).map((line) => {
    const itemName = line.ItemAdjustmentLineDetail?.ItemRef?.name;
    const qtyDiff = line.ItemAdjustmentLineDetail?.QtyDiff;
    if (itemName === undefined || itemName.trim() === '') {
      throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} has a line without ItemRef.name`);
    }
    if (qtyDiff === undefined || !Number.isInteger(qtyDiff) || qtyDiff === 0) {
      throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} has invalid QtyDiff for ${itemName}`);
    }
    return {
      itemName,
      quantityDelta: qtyDiff,
    };
  });
  if (lines.length === 0) {
    throw new Error(`Plutus InventoryAdjustment ${adjustment.Id} has no item adjustment lines`);
  }

  return {
    id: adjustment.Id,
    syncToken: adjustment.SyncToken,
    docNumber: adjustment.DocNumber,
    txnDate: adjustment.TxnDate,
    settlementDocNumber: parsed.settlementDocNumber,
    marketplace: parsed.marketplace,
    quantityDelta: lines.reduce((sum, line) => sum + line.quantityDelta, 0),
    lines,
    privateNote: adjustment.PrivateNote,
  };
}

async function fetchPlutusNativeInventoryAdjustments(
  marketplace: 'amazon.com',
): Promise<{ connection: QboConnection; adjustments: PlutusNativeInventoryAdjustment[] }> {
  const activeConnection = await getActiveQboConnection();
  const result = await qboQueryAll(activeConnection, 'SELECT * FROM InventoryAdjustment');
  const adjustments = (result.rows as QboInventoryAdjustment[])
    .map(requirePlutusNativeInventoryAdjustment)
    .filter((adjustment) => adjustment !== null)
    .filter((adjustment) => adjustment.marketplace === marketplace)
    .sort((left, right) => {
      const dateCompare = left.txnDate.localeCompare(right.txnDate);
      if (dateCompare !== 0) return dateCompare;
      return left.docNumber.localeCompare(right.docNumber);
    });

  return {
    connection: activeConnection.connection,
    adjustments,
  };
}

async function deleteInventoryAdjustment(
  connection: QboConnection,
  adjustment: PlutusNativeInventoryAdjustment,
): Promise<{ deletedId: string; updatedConnection?: QboConnection }> {
  const tokenResult = await getValidToken(connection);
  const activeConnection = tokenResult.updatedConnection ?? connection;
  const url = new URL(`${getApiBaseUrl()}/v3/company/${activeConnection.realmId}/inventoryadjustment`);
  url.searchParams.set('operation', 'delete');
  url.searchParams.set('minorversion', '75');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenResult.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Id: adjustment.id,
      SyncToken: adjustment.syncToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to delete QBO InventoryAdjustment ${adjustment.id} ${adjustment.docNumber}: ${response.status} ${errorText}`,
    );
  }

  return {
    deletedId: adjustment.id,
    updatedConnection: activeConnection === connection ? undefined : activeConnection,
  };
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const fetched = await fetchPlutusNativeInventoryAdjustments(options.marketplace);

  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    marketplace: options.marketplace,
    count: fetched.adjustments.length,
    totalQuantityDelta: fetched.adjustments.reduce((sum, adjustment) => sum + adjustment.quantityDelta, 0),
    adjustments: fetched.adjustments.map((adjustment) => ({
      id: adjustment.id,
      syncToken: adjustment.syncToken,
      docNumber: adjustment.docNumber,
      txnDate: adjustment.txnDate,
      settlementDocNumber: adjustment.settlementDocNumber,
      quantityDelta: adjustment.quantityDelta,
      lines: adjustment.lines,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!options.apply) return;

  let connection = fetched.connection;
  const deleted: Array<{ id: string; docNumber: string; settlementDocNumber: string }> = [];
  for (const adjustment of fetched.adjustments) {
    const result = await deleteInventoryAdjustment(connection, adjustment);
    if (result.updatedConnection !== undefined) {
      connection = result.updatedConnection;
      await saveServerQboConnection(connection);
    }
    deleted.push({
      id: result.deletedId,
      docNumber: adjustment.docNumber,
      settlementDocNumber: adjustment.settlementDocNumber,
    });
  }
  await saveServerQboConnection(connection);

  console.log(
    JSON.stringify(
      {
        ok: true,
        marketplace: options.marketplace,
        deletedCount: deleted.length,
        deleted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
